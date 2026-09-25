import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { EsignService } from './esign.service';
import {
  createKeyMaterial,
  signPayload,
  signPdfHash,
  verifyRevocation,
  type SignablePayload,
} from '@/utils/esign';
import crypto from 'crypto';

const { emitMock, compareMock, deleteDocMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  compareMock: vi.fn(),
  deleteDocMock: vi.fn(),
}));

// Finding 2 regression hinges on the FILE side effect, not just the column
// write: the old cleanup read the CURRENT ktpFileName at cleanup time and
// unlinked it unconditionally. Asserting only on `updateMany`'s arguments (as
// the weaker version of this test did) passes even when the compare-and-delete
// guard is removed, so it proved nothing. Mock the store and assert the unlink.
vi.mock('@/utils/identity-document-store', async (importActual) => {
  const actual = await importActual<typeof import('@/utils/identity-document-store')>();
  return { ...actual, deleteIdentityDocument: deleteDocMock };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    userSigningKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    userSigningKeyHistory: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    signingKeyRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      // Finding A4: the reject/approve paths now claim the request with a
      // status-guarded `updateMany` and re-read the row, under the per-user
      // signing-key advisory lock.
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    letter: { findUnique: vi.fn(), update: vi.fn() },
    letterReviewer: { update: vi.fn() },
    letterSignature: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    letterFlowEvent: { create: vi.fn() },
    letterSignedDocument: { create: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    userIdentity: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      // Finding 2: rejection cleanup is now a guarded compare-and-delete
      // (`updateMany where ktpFileName = <bound name>`), not read-then-update.
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(prisma)),
  },
}));
vi.mock('../../lib/event-bus', () => ({ eventBus: { emit: emitMock } }));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: emitMock } }));
vi.mock('@/lib/password', () => ({ comparePassword: compareMock }));

const PASS = 'passphrase-tanda-tangan-2026';
const DAY = 24 * 60 * 60 * 1000;

/**
 * SQL kenaikan penghitung percobaan gagal yang BENAR-BENAR dijalankan.
 *
 * Regresi finding 5: `recordFailedAttempt` dulu `update({ failedAttempts:
 * current + 1 })` dari nilai yang dibaca sebelum menulis — dua percobaan gagal
 * paralel membaca nilai yang sama dan menulis nilai yang sama, sehingga lockout
 * tertunda tanpa batas (atau `lockedUntil` ditimpa `null`). Sekarang kenaikan
 * dihitung DI basis data dalam satu pernyataan. Membaca SQL-nya membuat uji
 * gagal bila seseorang mengembalikan ke bentuk baca-lalu-tulis.
 */
function incrementSql(): string {
  return (prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => (c[0] as TemplateStringsArray).join?.('') ?? String(c[0]))
    .filter((sql: string) => sql.includes('"failed_attempts" = "failed_attempts" + 1'))
    .join('\n');
}

/**
 * Identitas yang lengkap dan sudah diverifikasi.
 *
 * Bawaan untuk hampir setiap uji di berkas ini, karena kebanyakan menguji
 * perilaku *setelah* syarat identitas terpenuhi. Yang menguji syaratnya sendiri
 * mengganti nilainya sendiri.
 */
function verifiedIdentity(over: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    userId: 'ketua',
    legalName: 'Haji Endang Suryana',
    nik: '3206051205750001',
    birthPlace: 'Tasikmalaya',
    birthDate: new Date('1975-05-12T00:00:00.000Z'),
    verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    verifiedById: 'superadmin',
    verificationNote: null,
    ktpFileName: 'ktp-abc.jpg',
    ktpSha256: 'a'.repeat(64),
    ktpUploadedAt: new Date('2026-07-31T00:00:00.000Z'),
    ktpRetainUntil: null,
    ktpDeletedAt: null,
    ...over,
  };
}

/** Kunci aktif lengkap dengan bahan kriptografinya. */
function activeKey(over: Record<string, unknown> = {}) {
  const m = createKeyMaterial(PASS);
  return {
    id: 'key-1',
    userId: 'ketua',
    ...m,
    kdfParams: m.kdfParams as unknown,
    failedAttempts: 0,
    lockedUntil: null,
    approvedAt: new Date(Date.now() - 10 * DAY),
    expiresAt: new Date(Date.now() + 200 * DAY),
    revokedAt: null,
    revokedReason: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Identitas terverifikasi adalah keadaan bawaan: syarat identitas diuji
  // tersendiri di bawah, dan menuntut setiap uji lain menyiapkannya hanya
  // membuat semuanya menguji dua hal sekaligus.
  vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(verifiedIdentity() as any);
  // Transisi pencabutan memakai UPDATE bersyarat; bawaan "berhasil" (count 1)
  // supaya uji jalur bahagia tetap fokus pada perilaku yang diuji.
  vi.mocked(prisma.userSigningKey.updateMany).mockResolvedValue({ count: 1 } as any);
  // Finding A4: `decideRequest` now claims the request with a status-guarded
  // `updateMany` (count 1 = this caller won the race) and re-reads it. Default
  // to the happy path; the concurrency regression overrides these.
  vi.mocked(prisma.signingKeyRequest.updateMany).mockResolvedValue({ count: 1 } as any);
  vi.mocked(prisma.signingKeyRequest.findUniqueOrThrow).mockResolvedValue({
    id: 'req-1',
    status: 'APPROVED',
  } as any);
  // Finding 2: the guarded delete claims the row (count 1) only when the
  // current file name still matches the one bound to the rejected request.
  vi.mocked(prisma.userIdentity.updateMany).mockResolvedValue({ count: 1 } as any);
});

/**
 * Gerbang identitas.
 *
 * Sebuah tanda tangan elektronik mengikat kepada orang, dan ia mengikat hanya
 * sejauh penerbitnya tahu siapa orang itu. Kunci yang terbit untuk akun tanpa
 * identitas menghasilkan tanda tangan yang membuktikan pengetahuan passphrase
 * dan tidak lebih.
 */
describe('identitas sebagai syarat kunci', () => {
  it('menolak pengajuan bila datanya belum lengkap, sambil menyebut apa yang kurang', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ birthPlace: null }) as any
    );

    await expect(EsignService.requestKey('ketua')).rejects.toThrow(/tempat lahir/);
    expect(prisma.signingKeyRequest.create).not.toHaveBeenCalled();
  });

  /**
   * **Uji ini dahulu menegaskan kebalikannya, dan kebalikannya adalah bug.**
   *
   * Ia menuntut `requestKey` menolak identitas yang belum diverifikasi. Tetapi
   * verifikasi hanya terjadi di `decideRequest`, atas sebuah pengajuan — jadi
   * aturan itu menutup satu-satunya pintu menuju verifikasi, dan di produksi
   * 2026-09-03 tidak seorang pun dapat memperoleh kunci: setiap pengajuan
   * dijawab "sudah lengkap tetapi belum diverifikasi", selamanya.
   *
   * Uji lama hijau karena ia menguji separuh rantai terhadap dirinya sendiri.
   * Yang menemukannya adalah menelusuri rantainya di sistem yang berjalan.
   */
  it('MENERIMA pengajuan yang datanya lengkap dan ada KTP walau belum diverifikasi', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ verifiedAt: null, verifiedById: null }) as any
    );
    vi.mocked(prisma.signingKeyRequest.create).mockResolvedValue({ id: 'req-1' } as any);

    await EsignService.requestKey('ketua');
    expect(prisma.signingKeyRequest.create).toHaveBeenCalled();
  });

  /**
   * Yang tetap ditolak: tanpa foto KTP, Super Admin tidak punya apa pun untuk
   * dicocokkan, jadi pengajuannya akan tergeletak tidak dapat diputuskan.
   */
  it('menolak pengajuan bila foto KTP-nya belum diunggah', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ verifiedAt: null, ktpFileName: null }) as any
    );

    await expect(EsignService.requestKey('ketua')).rejects.toThrow(/foto KTP/);
    expect(prisma.signingKeyRequest.create).not.toHaveBeenCalled();
  });

  it('menolak pengajuan dari akun yang belum punya identitas sama sekali', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(null as any);

    await expect(EsignService.requestKey('ketua')).rejects.toThrow(/Lengkapi dulu/);
  });

  /**
   * Verifikasi menyatakan bahwa data *yang itu* sudah dicocokkan. Tanpa aturan
   * ini, seseorang dapat lolos verifikasi dengan datanya sendiri lalu
   * menggantinya menjadi milik orang lain, dan kunci berikutnya terbit atas nama
   * yang tidak pernah diperiksa.
   */
  it('mengubah data identitas menggugurkan verifikasinya', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.upsert).mockResolvedValue(verifiedIdentity() as any);

    await EsignService.saveMyIdentity('ketua', {
      legalName: 'Haji Endang Suryana',
      nik: '3206.0512.0575.0001',
      birthPlace: 'Tasikmalaya',
      birthDate: '1975-05-12',
    });

    const call = vi.mocked(prisma.userIdentity.upsert).mock.calls.at(-1)![0] as any;
    expect(call.update.verifiedAt).toBeNull();
    expect(call.update.verifiedById).toBeNull();
    // NIK dinormalkan: orang menyalinnya dari KTP berikut titiknya.
    expect(call.update.nik).toBe('3206051205750001');
  });

  it('tidak mengembalikan NIK kepada pemiliknya sendiri — ia sudah mengetahuinya', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.upsert).mockResolvedValue(verifiedIdentity() as any);

    const result = await EsignService.saveMyIdentity('ketua', {
      legalName: 'Haji Endang Suryana',
      nik: '3206051205750001',
      birthPlace: 'Tasikmalaya',
      birthDate: '1975-05-12',
    });
    expect(result.nik).toBeUndefined();
  });

  /**
   * Melaporkan, bukan menolak: NIK menyandikan tanggal lahir, jadi
   * ketidakcocokan berarti salah satunya salah ketik — tetapi kekeliruan
   * pencatatan kependudukan juga ada.
   */
  it('melaporkan ketidakcocokan tanggal lahir dengan NIK tanpa menolaknya', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.upsert).mockResolvedValue(verifiedIdentity() as any);

    const result = await EsignService.saveMyIdentity('ketua', {
      legalName: 'Haji Endang Suryana',
      nik: '3206051205750001',
      birthPlace: 'Tasikmalaya',
      birthDate: '1975-05-21',
    });
    expect(result.warning).toMatch(/tidak sama/);
    expect(prisma.userIdentity.upsert).toHaveBeenCalled();
  });

  it('menolak NIK yang sudah mendasari akun lain', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userIdentity.findFirst).mockResolvedValue({ id: 'lain' } as any);

    await expect(
      EsignService.saveMyIdentity('ketua', {
        legalName: 'Haji Endang Suryana',
        nik: '3206051205750001',
        birthPlace: 'Tasikmalaya',
        birthDate: '1975-05-12',
      })
    ).rejects.toThrow(/akun lain/);
  });

  /**
   * Identitas itulah yang mendasari kunci yang sedang hidup; mengubahnya
   * diam-diam membuat surat yang sudah ditandatangani merujuk kepada orang yang
   * berbeda dari yang pernah diperiksa.
   */
  it('menolak mengubah identitas selagi kuncinya masih berlaku', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * DAY),
    } as any);

    await expect(
      EsignService.saveMyIdentity('ketua', {
        legalName: 'Haji Endang Suryana',
        nik: '3206051205750001',
        birthPlace: 'Tasikmalaya',
        birthDate: '1975-05-12',
      })
    ).rejects.toThrow(/masih berlaku/);
  });
});

describe('persetujuan menyatakan siapa orangnya', () => {
  const pending = {
    id: 'req-1',
    userId: 'ketua',
    kind: 'ENROLLMENT',
    status: 'PENDING',
  };

  it('menolak menyetujui bila identitas pemohon belum lengkap', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ nik: null }) as any
    );

    await expect(EsignService.decideRequest('req-1', 'superadmin', true, 30)).rejects.toThrow(
      /belum lengkap/
    );
    expect(prisma.signingKeyRequest.update).not.toHaveBeenCalled();
  });

  it('menolak menyetujui identitas yang belum diverifikasi tanpa menyebut caranya', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ verifiedAt: null }) as any
    );

    await expect(EsignService.decideRequest('req-1', 'superadmin', true, 30)).rejects.toThrow(
      /nyatakan kecocokannya/
    );
  });

  it('mencatat siapa yang memverifikasi, kapan, dan dengan cara apa', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ verifiedAt: null }) as any
    );
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'req-1' } as any);
    vi.mocked(prisma.userSigningKey.deleteMany).mockResolvedValue({ count: 0 } as any);

    await EsignService.decideRequest('req-1', 'superadmin', true, 30, undefined, {
      note: 'Foto KTP dibuka dan cocok dengan data yang diisi.',
    });

    expect(prisma.userIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'ketua' },
        data: expect.objectContaining({
          verifiedById: 'superadmin',
          verificationNote: 'Foto KTP dibuka dan cocok dengan data yang diisi.',
        }),
      })
    );
  });

  /**
   * Satu-satunya jalur pembuktian. Pilihan "kartu ditunjukkan langsung" dan
   * "dikenali pribadi" pernah ada dan keduanya tidak meninggalkan apa pun yang
   * dapat diperiksa — seorang penyetuju dapat memilihnya tanpa melakukan apa
   * pun.
   */
  it('menolak menyetujui bila pemohon belum mengunggah foto KTP', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ verifiedAt: null, ktpFileName: null }) as any
    );

    await expect(
      EsignService.decideRequest('req-1', 'superadmin', true, 30, undefined, {
        note: 'cocok',
      })
    ).rejects.toThrow(/belum mengunggah foto KTP/);
    expect(prisma.signingKeyRequest.update).not.toHaveBeenCalled();
  });

  /**
   * Disetujui berarti ada kunci yang terbit, dan dasar penerbitannya dapat
   * dipersoalkan selama kunci itu masih dapat menandatangani. Karena itu
   * berkasnya **disimpan**, bukan dihapus — dengan batas waktu yang dihitung
   * dari akhir masa berlaku kuncinya, bukan dari hari keputusan.
   */
  it('menyimpan foto KTP setelah disetujui, dengan batas waktu dari akhir masa kunci', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(verifiedIdentity() as any);
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'req-1' } as any);
    vi.mocked(prisma.userSigningKey.deleteMany).mockResolvedValue({ count: 0 } as any);

    await EsignService.decideRequest('req-1', 'superadmin', true, 30);

    const call = vi.mocked(prisma.userIdentity.update).mock.calls.at(-1)![0] as any;
    expect(call.data.ktpRetainUntil).toBeInstanceOf(Date);
    // Jauh di depan: 30 hari masa kunci ditambah masa retensi bertahun-tahun.
    expect(call.data.ktpRetainUntil.getTime()).toBeGreaterThan(Date.now() + 365 * DAY);
    // Dan berkasnya tidak dibuang.
    expect(call.data.ktpFileName).toBeUndefined();
  });

  /** Ditolak berarti tidak ada kunci — berkasnya tidak membuktikan apa pun lagi. */
  it('menghapus foto KTP setelah pengajuan ditolak', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(verifiedIdentity() as any);

    await EsignService.decideRequest('req-1', 'superadmin', false, undefined, 'Belum perlu.');

    // Compare-and-delete: klaim baris dengan guard nama berkas yang terikat.
    expect(prisma.userIdentity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'ketua', ktpFileName: 'ktp-abc.jpg' },
        data: expect.objectContaining({ ktpFileName: null }),
      })
    );
  });

  /**
   * Finding 2 (regresi) — cleanup penolakan TIDAK boleh menghapus scan KTP
   * pengganti.
   *
   * Dulu `discardIdentityDocument` membaca `ktpFileName` saat cleanup berjalan
   * lalu menghapus APA PUN yang dirujuk kolom. Bila pemohon sudah mengunggah
   * scan baru di sela antara commit penolakan dan cleanup, berkas baru yang
   * sah itu ikut terhapus dan kolomnya dinolkan.
   *
   * Gagal sebelum perbaikan: `updateMany` (atau `update`) menghapus nama baru.
   * Lulus sesudah: guard nama berkas lama tidak cocok → count 0 → tak ada
   * `deleteIdentityDocument`/penghapusan.
   *
   * Di sini `updateMany` mengembalikan count 0 karena nama saat ini sudah
   * berbeda dari nama yang terikat pada penolakan.
   */
  it('tidak menghapus scan KTP pengganti yang diunggah setelah penolakan', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    // Saat keputusan diambil, yang terikat adalah berkas LAMA.
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(
      verifiedIdentity({ ktpFileName: 'ktp-lama.jpg' }) as any
    );
    // Namun cleanup berjalan setelah pemohon mengganti berkasnya: guard nama
    // lama tidak cocok dengan kolom saat ini → count 0.
    vi.mocked(prisma.userIdentity.updateMany).mockResolvedValue({ count: 0 } as any);

    await EsignService.decideRequest('req-1', 'superadmin', false, undefined, 'Belum perlu.');

    // Guard memakai nama yang TERIKAT (lama), bukan nama apa pun yang kebetulan
    // ada sekarang — inilah yang mencegah scan baru ikut terhapus.
    expect(prisma.userIdentity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'ketua', ktpFileName: 'ktp-lama.jpg' } })
    );
    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
    // Bukti akibat (bukan sekadar bentuk panggilan): count 0 → berkas TIDAK
    // di-unlink. Sebelum perbaikan (tanpa guard `cleared.count`) nama berkas
    // tetap dihapus walau klaim barisnya gagal.
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  /**
   * Finding 1 (regresi) — persetujuan konkuren yang MENANG tidak boleh
   * kehilangan foto KTP miliknya karena penolakan yang kalah balapan.
   *
   * Sebelumnya `discardIdentityDocument` dipanggil di luar transaksi dan
   * SEBELUM status dicek ulang. Ketika persetujuan konkuren menyelesaikan
   * pengajuan lebih dulu, transaksi penolakan ini di-rollback — tetapi berkas
   * KTP sudah telanjur dihapus dan barisnya dinolkan. Kuncinya lalu terbit
   * untuk pemohon yang dokumen identitasnya sudah lenyap.
   *
   * Gagal sebelum perbaikan: penghapusan terjadi walau keputusan ditolak.
   * Lulus sesudah: tidak ada `userIdentity.update` yang menolkan `ktpFileName`.
   */
  it('tidak menghapus foto KTP bila penolakan kalah balapan dengan persetujuan', async () => {
    // Pra-cek di luar transaksi melihat PENDING; pembacaan ULANG di dalam lock
    // melihat APPROVED — persetujuan konkuren menang lebih dulu.
    vi.mocked(prisma.signingKeyRequest.findUnique)
      .mockResolvedValueOnce(pending as any)
      .mockResolvedValueOnce({ ...pending, status: 'APPROVED' } as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(verifiedIdentity() as any);

    await expect(
      EsignService.decideRequest('req-1', 'superadmin', false, undefined, 'Belum perlu.')
    ).rejects.toThrow(/sudah diputuskan/i);

    // Bukti fail-before: jalur lama menghapus berkas di luar transaksi, jadi
    // `userIdentity.update` tetap terpanggil. Sesudah perbaikan, rollback
    // transaksi berarti tak ada penghapusan sama sekali.
    const erased = vi
      .mocked(prisma.userIdentity.update)
      .mock.calls.some(
        ([args]) => (args as { data?: { ktpFileName?: unknown } }).data?.ktpFileName === null
      );
    expect(erased).toBe(false);
  });

  /**
   * Finding 1 (regresi) — notifikasi penolakan TIDAK boleh terkirim bila
   * transaksinya gagal/rollback.
   *
   * Dulu `eventBus.emit('notification:send', …)` dipanggil DI DALAM
   * `$transaction`. Karena `emit` bukan operasi database, ia berjalan walau
   * transaksi kemudian di-ROLLBACK — sehingga pemohon menerima "pengajuan
   * ditolak" padahal statusnya masih PENDING dan penolakan tidak pernah
   * tersimpan.
   *
   * Di sini transaksi gagal SETELAH klaim status (saat `findUniqueOrThrow`
   * melempar). Gagal sebelum perbaikan: `emit` tetap terpanggil. Lulus sesudah:
   * `emit` tidak terpanggil sama sekali.
   */
  it('tidak mengirim notifikasi penolakan bila transaksi rollback setelah klaim status', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(verifiedIdentity() as any);
    // Klaim status berhasil (count 1) — inilah titik setelah `emit` lama.
    vi.mocked(prisma.signingKeyRequest.updateMany).mockResolvedValue({ count: 1 } as any);
    // ...lalu transaksi gagal setelah klaim: pembacaan ulang melempar.
    vi.mocked(prisma.signingKeyRequest.findUniqueOrThrow).mockRejectedValue(
      new Error('boom setelah klaim') as any
    );

    await expect(
      EsignService.decideRequest('req-1', 'superadmin', false, undefined, 'Belum perlu.')
    ).rejects.toThrow(/boom setelah klaim/);

    // Notifikasi HANYA dikirim setelah commit; rollback → tak ada emit.
    expect(emitMock).not.toHaveBeenCalled();
    // Dan cleanup berkas tidak berjalan untuk keputusan yang tidak tersimpan.
    expect(prisma.userIdentity.updateMany).not.toHaveBeenCalled();
  });

  it('tidak menuntut verifikasi ulang untuk identitas yang sudah terverifikasi', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'req-1' } as any);
    vi.mocked(prisma.userSigningKey.deleteMany).mockResolvedValue({ count: 0 } as any);

    await expect(EsignService.decideRequest('req-1', 'superadmin', true, 30)).resolves.toBeTruthy();

    // Barisnya memang tetap disentuh — batas simpan berkasnya ditetapkan di
    // sini. Yang diuji adalah verifikasinya tidak ditimpa ulang, bukan bahwa
    // tidak ada penulisan sama sekali: menegaskan "update tidak dipanggil"
    // mengukur mekanismenya, bukan akibatnya.
    for (const [call] of vi.mocked(prisma.userIdentity.update).mock.calls) {
      expect((call as any).data.verifiedById).toBeUndefined();
      expect((call as any).data.verificationNote).toBeUndefined();
    }
  });

  /** Menolak tidak menuntut apa pun: yang ditolak tidak menerbitkan kunci. */
  it('menolak pengajuan tanpa memeriksa identitas', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue(pending as any);
    vi.mocked(prisma.userIdentity.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'req-1' } as any);

    await expect(
      EsignService.decideRequest('req-1', 'superadmin', false, undefined, 'Belum diperlukan.')
    ).resolves.toBeTruthy();
  });
});

describe('pengajuan kunci', () => {
  it('memilih ENROLLMENT bila belum punya kunci', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.signingKeyRequest.create).mockResolvedValue({ id: 'r1' } as any);

    await EsignService.requestKey('ketua');

    expect(prisma.signingKeyRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'ENROLLMENT' }),
    });
  });

  it('memilih RENEWAL hanya ketika sudah dekat masa habis', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(
      activeKey({ expiresAt: new Date(Date.now() + 5 * DAY) }) as any
    );
    vi.mocked(prisma.signingKeyRequest.create).mockResolvedValue({ id: 'r1' } as any);

    await EsignService.requestKey('ketua');

    expect(prisma.signingKeyRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RENEWAL' }),
    });
  });

  it('menolak bila kunci masih lama berlakunya', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await expect(EsignService.requestKey('ketua')).rejects.toThrow(/masih berlaku/i);
  });

  it('menolak pengajuan ganda selagi satu masih menunggu', async () => {
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue({ id: 'r0' } as any);
    await expect(EsignService.requestKey('ketua')).rejects.toThrow(/masih menunggu/i);
  });
});

describe('aktivasi kunci tidak balapan', () => {
  /**
   * Regresi finding: dua `activateKey` paralel sama-sama membaca "tidak ada
   * kunci" lalu yang kalah menghapus kunci pemenang. Serialisasi diperoleh dari
   * advisory lock transaksi per pengguna, jadi transaksi aktivasi HARUS
   * memanggilnya SEBELUM membaca keadaan kunci. Urutan panggilan inilah yang
   * diuji di sini (perilaku balapan sesungguhnya diuji dengan PostgreSQL nyata
   * di `esign-activation.db.test.ts`).
   */
  it('mengambil advisory lock per pengguna sebelum membaca kunci', async () => {
    const calls: string[] = [];
    vi.mocked(prisma.$executeRaw).mockImplementation((async () => {
      calls.push('lock');
      return 1;
    }) as never);
    vi.mocked(prisma.signingKeyRequest.findFirst).mockImplementation((async () => {
      calls.push('readApproval');
      return { decidedById: 'admin', decidedAt: new Date(), grantedDays: 365 };
    }) as never);
    vi.mocked(prisma.userSigningKey.findUnique).mockImplementation((async () => {
      calls.push('readKey');
      return null;
    }) as never);
    vi.mocked(prisma.userSigningKey.create).mockResolvedValue({
      id: 'new-key',
      expiresAt: new Date(Date.now() + 365 * DAY),
    } as any);

    await EsignService.activateKey('ketua', 'passphrase-yang-cukup-panjang');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // Lock diambil lebih dulu, baru keadaan kunci dibaca DI DALAM lock.
    expect(calls[0]).toBe('lock');
    expect(calls.indexOf('readApproval')).toBeGreaterThan(0);
    expect(calls.indexOf('readKey')).toBeGreaterThan(calls.indexOf('readApproval'));
  });

  it('menolak aktivasi ulang bila kunci aktif masih ada (di dalam lock)', async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.signingKeyRequest.findFirst).mockResolvedValue({
      decidedById: 'admin',
      decidedAt: new Date(),
      grantedDays: 365,
    } as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await expect(
      EsignService.activateKey('ketua', 'passphrase-yang-cukup-panjang')
    ).rejects.toThrow(/sudah memiliki kunci tanda tangan yang aktif/i);
  });
});

describe('putusan Super Admin', () => {
  it('menolak masa berlaku di luar batas', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'ketua',
      kind: 'ENROLLMENT',
      status: 'PENDING',
    } as any);

    await expect(EsignService.decideRequest('r1', 'admin', true, 5000)).rejects.toThrow(
      /Masa berlaku/i
    );
  });

  it('perpanjangan memperpanjang kunci yang ada, tidak menggantinya', async () => {
    const key = activeKey({ expiresAt: new Date(Date.now() + 5 * DAY) });
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'ketua',
      kind: 'RENEWAL',
      status: 'PENDING',
    } as any);
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'r1' } as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(key as any);

    await EsignService.decideRequest('r1', 'admin', true, 365);

    expect(prisma.userSigningKey.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userSigningKey.update).toHaveBeenCalledWith({
      where: { id: key.id },
      data: expect.objectContaining({ expiresAt: expect.any(Date) }),
    });
  });

  it('tidak memutus pengajuan yang sudah diputus', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'ketua',
      kind: 'ENROLLMENT',
      status: 'APPROVED',
    } as any);
    await expect(EsignService.decideRequest('r1', 'admin', true)).rejects.toThrow(
      /sudah diputuskan/i
    );
  });

  /**
   * Finding A4 — keputusan yang BERSINGGUNGAN tidak boleh saling menimpa.
   *
   * Pre-check status di luar transaksi hanya melihat snapshot. Bila keputusan
   * lain menang antara pre-check dan penulisan, jalur LAMA tetap menulis
   * (guard-nya tidak ada) dan hasil akhir ditentukan urutan commit.
   *
   * Dua jalur diuji terpisah karena keduanya mengklaim status dengan cara yang
   * berbeda: persetujuan memakai UPDATE bersyarat (`updateMany`, count harus 1),
   * penolakan memakai pembacaan ULANG di bawah advisory lock per-pengguna.
   *
   * Gagal sebelum perbaikan (menulis dan resolve), lulus sesudah (throw).
   */
  it('menolak klaim ganda ketika UPDATE bersyarat kalah balapan (regresi A4)', async () => {
    // Persetujuan dengan pre-check PENDING; pesaing menyelesaikan pengajuan di
    // sela, sehingga UPDATE bersyarat tidak menemukan baris PENDING lagi.
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'ketua',
      kind: 'ENROLLMENT',
      status: 'PENDING',
    } as any);
    vi.mocked(prisma.signingKeyRequest.updateMany).mockResolvedValue({ count: 0 } as any);

    await expect(EsignService.decideRequest('r1', 'admin', true, 365)).rejects.toThrow(
      /sudah diputuskan/i
    );
  });

  it('menolak penolakan yang bersinggungan dengan persetujuan di dalam lock (regresi A4)', async () => {
    // Pre-check PENDING, lalu pembacaan ULANG di dalam lock melihat APPROVED
    // (pesaing menang). Penolakan harus melempar dan TIDAK menulis status.
    vi.mocked(prisma.signingKeyRequest.findUnique)
      .mockResolvedValueOnce({
        id: 'r1',
        userId: 'ketua',
        kind: 'ENROLLMENT',
        status: 'PENDING',
      } as any)
      .mockResolvedValueOnce({
        id: 'r1',
        userId: 'ketua',
        kind: 'ENROLLMENT',
        status: 'APPROVED',
      } as any);

    await expect(EsignService.decideRequest('r1', 'admin', false)).rejects.toThrow(
      /sudah diputuskan/i
    );
    expect(prisma.signingKeyRequest.updateMany).not.toHaveBeenCalled();
  });

  it('menolak penolakan kedua setelah status berubah di dalam lock (regresi A4)', async () => {
    vi.mocked(prisma.signingKeyRequest.findUnique)
      .mockResolvedValueOnce({
        id: 'r1',
        userId: 'ketua',
        kind: 'ENROLLMENT',
        status: 'PENDING',
      } as any)
      .mockResolvedValueOnce({
        id: 'r1',
        userId: 'ketua',
        kind: 'ENROLLMENT',
        status: 'REJECTED',
      } as any);

    await expect(EsignService.decideRequest('r1', 'admin', false)).rejects.toThrow(
      /sudah diputuskan/i
    );
    expect(prisma.signingKeyRequest.updateMany).not.toHaveBeenCalled();
  });

  /**
   * Regresi Flags–Investigation — penerbitan ulang harus menandai rekaman
   * riwayat kunci LAMA sebagai `supersededAt` SEBELUM kuncinya dihapus.
   *
   * `UserSigningKey` satu baris per pengguna dan dihapus saat penerbitan ulang;
   * tanpa menandai riwayatnya lebih dulu, jejak kunci lama tampak berlaku
   * selamanya — padahal ia sudah digantikan. Cap waktu itu ditulis DI DALAM
   * transaksi yang sama, supaya tidak ada jendela di mana kunci hilang tetapi
   * riwayatnya belum bertanda.
   */
  it('mencap supersededAt pada riwayat kunci lama saat penerbitan ulang', async () => {
    const oldKey = activeKey({ publicKey: 'pk-lama' });
    vi.mocked(prisma.signingKeyRequest.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'ketua',
      kind: 'ENROLLMENT',
      status: 'PENDING',
    } as any);
    vi.mocked(prisma.signingKeyRequest.update).mockResolvedValue({ id: 'r1' } as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(oldKey as any);

    await EsignService.decideRequest('r1', 'admin', true, 365);

    expect(prisma.userSigningKeyHistory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'ketua', supersededAt: null }),
        data: { supersededAt: expect.any(Date) },
      })
    );
    expect(prisma.userSigningKey.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'ketua' },
    });
  });
});

describe('ganti passphrase', () => {
  it('menolak bila password akun salah — passphrase saja tidak cukup', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'h' } as any);
    compareMock.mockResolvedValue(false);

    await expect(
      EsignService.changePassphrase('ketua', PASS, 'password-salah', 'passphrase-baru-2026')
    ).rejects.toThrow(/Password akun salah/i);

    expect(prisma.userSigningKey.update).not.toHaveBeenCalled();
  });

  it('mencatat percobaan gagal bila passphrase lama salah', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'h' } as any);
    compareMock.mockResolvedValue(true);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await expect(
      EsignService.changePassphrase(
        'ketua',
        'passphrase-salah-sekali',
        'pw',
        'passphrase-baru-2026'
      )
    ).rejects.toThrow();

    // Failure 5 — kenaikan ATOMIK di basis data, bukan `update` dua-langkah
    // yang membaca `failedAttempts` lalu menulis `current + 1`. Lihat
    // `incrementSql`.
    expect(incrementSql()).toMatch(/"failed_attempts" = "failed_attempts" \+ 1/);
  });

  /**
   * Finding C6 — baca-lalu-tulis material kunci berjalan di bawah advisory
   * lock per-pengguna yang SAMA dengan penerbitan/pencabutan/decideRequest.
   *
   * Sebelum perbaikan jalur ini tidak mengambil lock apa pun, sehingga
   * `rewrapKeyMaterial` dapat menulis hasil penyegelan ulang atas kunci yang
   * sudah digantikan `activateKey` di sela. Regresi ini memaku bahwa
   * `pg_advisory_xact_lock(hashtextextended(userId))` dieksekusi — jalur yang
   * tanpanya akan langsung merah.
   */
  it('mengambil advisory lock per-pengguna sebelum menulis (regresi C6)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'h' } as any);
    compareMock.mockResolvedValue(true);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await EsignService.changePassphrase('ketua', PASS, 'pw', 'passphrase-baru-2026');

    expect(prisma.$executeRaw).toHaveBeenCalled();
    const sql = (prisma.$executeRaw as any).mock.calls
      .map((c: unknown[]) => (c[0] as TemplateStringsArray).join?.('') ?? String(c[0]))
      .join('\n');
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/hashtextextended/);
  });
});

describe('menandatangani surat', () => {
  const letter = (over: Record<string, unknown> = {}) => ({
    id: 'letter-1',
    letterNumber: '434/Sket/Y-CPS/VII/2026',
    date: new Date('2026-07-13T00:00:00Z'),
    type: 'SURAT_KETERANGAN',
    nature: 'PUBLIC',
    subject: 'Keterangan',
    content: 'Isi.',
    unitId: 'unit-1',
    status: 'READY_TO_SIGN',
    reviewers: [{ id: 'rev-1', reviewerId: 'ketua', isSigner: true, order: 1, status: 'PENDING' }],
    ...over,
  });

  it('menolak bukan penandatangan', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      letter({ reviewers: [{ id: 'r', reviewerId: 'orang-lain', isSigner: true }] }) as any
    );
    await expect(EsignService.signLetter('letter-1', 'ketua', PASS)).rejects.toThrow(
      /bukan penandatangan/i
    );
  });

  it('menolak bila surat belum sampai giliran tanda tangan', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      letter({ status: 'PENDING_REVIEW' }) as any
    );
    await expect(EsignService.signLetter('letter-1', 'ketua', PASS)).rejects.toThrow(
      /belum siap ditandatangani/i
    );
  });

  it('menolak bila kunci kedaluwarsa', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(letter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(
      activeKey({ expiresAt: new Date(Date.now() - DAY) }) as any
    );
    await expect(EsignService.signLetter('letter-1', 'ketua', PASS)).rejects.toThrow(
      /Masa berlaku/i
    );
  });

  it('passphrase salah dicatat dan tidak menandatangani apa pun', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(letter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await expect(
      EsignService.signLetter('letter-1', 'ketua', 'passphrase-yang-salah')
    ).rejects.toThrow(/Passphrase.*salah/i);

    expect(prisma.letterSignature.create).not.toHaveBeenCalled();
    expect(prisma.letter.update).not.toHaveBeenCalled();
    // Finding 5 — kenaikan atomik di basis data (bukan update baca-lalu-tulis).
    expect(incrementSql()).toMatch(/"failed_attempts" = "failed_attempts" \+ 1/);
    // Lockout dihitung dari `failed_attempts + 1` dalam pernyataan yang SAMA.
    expect(incrementSql()).toMatch(/"failed_attempts" \+ 1 >=/);
  });

  it('menandatangani, menandai surat SIGNED, dan mencatat riwayat', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(letter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    vi.mocked(prisma.letterSignature.create).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);
    vi.mocked(prisma.letterSignature.update).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);

    const out = await EsignService.signLetter('letter-1', 'ketua', PASS);

    expect(out.verificationToken).toBe('tok');
    expect(prisma.letter.update).toHaveBeenCalledWith({
      where: { id: 'letter-1' },
      data: { status: 'SIGNED' },
    });
    expect(prisma.letterFlowEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SIGNED', actorId: 'ketua' }),
    });
    // Hash PDF ditulis sebagai bagian dari penandatanganan, bukan sesudahnya.
    expect(prisma.letterSignature.update).toHaveBeenCalledWith({
      where: { id: 'sig-1' },
      data: expect.objectContaining({
        pdfHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        pdfSignature: expect.any(String),
      }),
    });
  });

  /**
   * Byte-nya diarsipkan, bukan dijanjikan dapat dibuat ulang.
   *
   * Selama unduhan membuat ulang naskahnya, verifikasi publik bertumpu pada
   * janji bahwa penghasil PDF akan mengeluarkan byte identik selamanya — dan
   * satu kenaikan versi `pdf-lib` cukup untuk membatalkan seluruh surat yang
   * pernah ditandatangani sekaligus.
   */
  it('mengarsipkan byte naskah yang ditandatangani, dengan hash yang sama', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(letter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    vi.mocked(prisma.letterSignature.create).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);
    vi.mocked(prisma.letterSignature.update).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);

    await EsignService.signLetter('letter-1', 'ketua', PASS);

    const signedHash = vi.mocked(prisma.letterSignature.update).mock.calls[0][0].data
      .pdfHash as string;
    const archived = vi.mocked(prisma.letterSignedDocument.create).mock.calls[0][0].data as any;

    expect(archived.signatureId).toBe('sig-1');
    expect(archived.sha256).toBe(signedHash);
    expect(archived.byteSize).toBe(archived.bytes.length);
    expect(crypto.createHash('sha256').update(archived.bytes).digest('hex')).toBe(signedHash);
    expect(archived.generator).toMatch(/^cipansor-naskah\//);
  });

  /**
   * Sebuah surat SIGNED yang arsipnya gagal ditulis adalah surat yang tidak
   * dapat dicetak sesuai aslinya. Itu bukan keadaan yang boleh lolos diam-diam,
   * jadi kegagalannya membatalkan penandatanganan seperti kegagalan lain.
   */
  it('tidak menandatangani bila arsipnya gagal ditulis', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(letter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    vi.mocked(prisma.letterSignature.create).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);
    vi.mocked(prisma.letterSignature.update).mockResolvedValue({ id: 'sig-1' } as any);
    vi.mocked(prisma.letterSignedDocument.create).mockRejectedValue(
      new Error('bytea write failed')
    );

    await expect(EsignService.signLetter('letter-1', 'ketua', PASS)).rejects.toThrow(
      /bytea write failed/
    );
  });

  /**
   * Naskah yang tidak dapat dirender tidak boleh menghasilkan surat SIGNED.
   *
   * Sebelumnya pembuatan PDF berada di luar transaksi, dibungkus `try/catch`
   * yang hanya mencetak ke konsol. Setiap kegagalan meninggalkan surat berstatus
   * SIGNED dengan `pdfHash` kosong — dan karena unggah berkas adalah satu-satunya
   * cara memverifikasi, surat itu selamanya tidak bisa dibuktikan asli. Yang
   * dilihat publik pun bukan "sistem bermasalah", melainkan tuduhan bahwa
   * dokumennya telah diubah.
   */
  it('menolak menandatangani bila naskahnya tidak dapat dirender', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      letter({ content: 'Kutipan: \u0628\u0633\u0645 \u0627\u0644\u0644\u0647' }) as any
    );
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    vi.mocked(prisma.letterSignature.create).mockResolvedValue({
      id: 'sig-1',
      verificationToken: 'tok',
      signedAt: new Date(),
    } as any);

    await expect(EsignService.signLetter('letter-1', 'ketua', PASS)).rejects.toThrow(
      /belum didukung/i
    );
  });
});

describe('verifikasi publik', () => {
  function signedFixture(
    nature: string,
    content = 'Isi rahasia yang tidak boleh bocor.',
    authoringTrack: 'GENERATED' | 'UPLOADED' = 'GENERATED'
  ) {
    const m = createKeyMaterial(PASS);
    const signedAt = new Date('2026-07-13T04:00:00Z');
    const payload: SignablePayload = {
      letterId: 'letter-1',
      letterNumber: '434/Sket/Y-CPS/VII/2026',
      date: new Date('2026-07-13T00:00:00Z'),
      type: 'SURAT_KETERANGAN',
      nature,
      subject: 'Perihal yang sensitif',
      content,
      unitId: 'unit-1',
      signerId: 'ketua',
      signedAt,
    };
    const s = signPayload(m, PASS, payload);
    return {
      material: m,
      fixture: {
        signerId: 'ketua',
        publicKey: s.publicKey,
        signature: s.signature,
        signedAt,
        // Dibiarkan nullable secara eksplisit: beberapa tes mengisi keduanya
        // untuk menguji surat yang dicabut, dan inferensi `null` akan menolaknya.
        revokedAt: null as Date | null,
        revokedReason: null as string | null,
        signer: { name: 'H. Ramram Mansur Ramdani' },
        letter: {
          id: 'letter-1',
          letterNumber: payload.letterNumber,
          date: payload.date,
          type: payload.type,
          nature,
          subject: payload.subject,
          content,
          status: 'SIGNED',
          authoringTrack,
          unitId: 'unit-1',
          unit: { name: 'Yayasan' },
        },
      },
    };
  }

  it('token tak dikenal tidak membocorkan apa pun', async () => {
    vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(null as any);
    const r = await EsignService.verifyByToken('entah');
    expect(r).toEqual({ found: false });
  });

  it('surat asli terverifikasi', async () => {
    vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
      signedFixture('PUBLIC').fixture as any
    );
    const r: any = await EsignService.verifyByToken('tok');
    expect(r.found).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.signerName).toBe('H. Ramram Mansur Ramdani');
  });

  it('verifikasi via upload buffer PDF berhasil menemukan record berdasarkan hash SHA-256', async () => {
    const pdfBuffer = Buffer.from('PDF Content for SHA-256 hash matching test');
    const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const { material, fixture } = signedFixture('PUBLIC');
    const pdfSignature = signPdfHash(material, PASS, pdfHash);

    const fullFixture = {
      ...fixture,
      verificationToken: 'tok-123',
      pdfHash,
      pdfSignature,
    };

    // Prisma mengembalikan Prisma__LetterSignatureClient — sebuah thenable yang
    // juga membawa relasi — bukan Promise biasa. Mock ini hanya perlu bagian
    // then-able-nya, jadi tipenya dilebarkan sekali di sini.
    vi.mocked(prisma.letterSignature.findUnique).mockImplementation(((args: any) => {
      if (args?.where?.pdfHash === pdfHash) {
        return Promise.resolve(fullFixture as any);
      }
      if (args?.where?.verificationToken === 'tok-123') {
        return Promise.resolve(fullFixture as any);
      }
      return Promise.resolve(null as any);
    }) as unknown as typeof prisma.letterSignature.findUnique);

    const r: any = await EsignService.verifyByPdfBuffer(pdfBuffer);

    expect(r.found).toBe(true);
    expect(r.valid).toBe(true);
  });

  it.each(['PUBLIC', 'LIMITED', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL'])(
    'tidak pernah mengembalikan isi surat (sifat %s)',
    async (nature) => {
      vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
        signedFixture(nature).fixture as any
      );
      const r: any = await EsignService.verifyByToken('tok');
      expect(JSON.stringify(r)).not.toContain('Isi rahasia yang tidak boleh bocor');
      expect(r.content).toBeUndefined();
    }
  );

  it('perihal hanya ditampilkan untuk surat bersifat Biasa', async () => {
    vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
      signedFixture('PUBLIC').fixture as any
    );
    expect(((await EsignService.verifyByToken('tok')) as any).subject).toBe(
      'Perihal yang sensitif'
    );

    for (const nature of ['LIMITED', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL']) {
      vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
        signedFixture(nature).fixture as any
      );
      expect(((await EsignService.verifyByToken('tok')) as any).subject).toBeNull();
    }
  });

  /**
   * Jalur penyusunannya ikut dikembalikan, karena ia bagian dari jawabannya.
   *
   * Verifikasi membuktikan hal yang sama untuk kedua jalur — byte yang
   * diunggah adalah byte yang ditandatangani. Yang berbeda adalah apa yang
   * dapat dikatakannya tentang keterangan di buku agenda, dan halaman publik
   * tidak dapat membedakannya kalau nilai ini tidak sampai ke sana.
   */
  it.each(['GENERATED', 'UPLOADED'] as const)(
    'mengembalikan jalur penyusunan naskah (%s)',
    async (track) => {
      vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
        signedFixture('PUBLIC', 'Isi rahasia yang tidak boleh bocor.', track).fixture as any
      );
      const r: any = await EsignService.verifyByToken('tok');
      expect(r.letter.authoringTrack).toBe(track);
    }
  );

  /**
   * Jalur penyusunan bukan isi surat, jadi kerahasiaan tidak menyembunyikannya.
   *
   * Perihal disembunyikan pada surat Terbatas ke atas karena ia mengungkap
   * perkaranya. "Disusun sistem" atau "diunggah penyusun" tidak mengungkap
   * apa pun tentang perkaranya — ia justru menerangkan seberapa jauh
   * pemeriksaan yang baru saja dilakukan berlaku, dan itu perlu diketahui
   * pembaca surat rahasia sama seperti pembaca surat biasa.
   */
  it.each(['LIMITED', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL'])(
    'jalur penyusunan tetap disebut walau perihalnya disembunyikan (sifat %s)',
    async (nature) => {
      vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(
        signedFixture(nature, 'Isi rahasia yang tidak boleh bocor.', 'UPLOADED').fixture as any
      );
      const r: any = await EsignService.verifyByToken('tok');
      expect(r.letter.subject).toBeNull();
      expect(r.letter.authoringTrack).toBe('UPLOADED');
    }
  );

  it('naskah yang diubah setelah ditandatangani tidak lagi sah', async () => {
    const { fixture } = signedFixture('PUBLIC');
    fixture.letter.content = 'Isi yang sudah diubah diam-diam.';
    vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(fixture as any);

    const r: any = await EsignService.verifyByToken('tok');
    expect(r.intact).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('tanda tangan yang dicabut tidak sah walau naskahnya utuh', async () => {
    const { fixture } = signedFixture('PUBLIC');
    fixture.revokedAt = new Date();
    fixture.revokedReason = 'Diterbitkan keliru';
    vi.mocked(prisma.letterSignature.findUnique).mockResolvedValue(fixture as any);

    const r: any = await EsignService.verifyByToken('tok');
    expect(r.intact).toBe(true);
    expect(r.revoked).toBe(true);
    expect(r.valid).toBe(false);
  });
});

/**
 * Pencabutan.
 *
 * Dua hal yang paling mudah salah dan paling mahal akibatnya: mencabut sesuatu
 * yang sudah dicabut (menimpa catatan pertama, yang justru menjawab sejak kapan
 * ia tidak berlaku), dan mengira mencabut kunci berarti mencabut surat-suratnya
 * (tidak — dan itulah sebabnya jumlahnya dilaporkan kembali).
 */
describe('mencabut kunci tanda tangan', () => {
  const REASON = 'Passphrase bocor ke pihak lain';

  beforeEach(() => {
    vi.mocked(prisma.letterSignature.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'audit-1' } as any);
  });

  it('mencatat tanggal, alasan, dan siapa yang mencabut', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await EsignService.revokeKey('ketua', 'admin-1', REASON);

    // Transisinya bersyarat (`revokedAt: null`) supaya dua pencabutan paralel
    // tidak dapat saling menimpa; lihat uji balapan di bawah.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', revokedAt: null },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        revokedReason: REASON,
        revokedById: 'admin-1',
      }),
    });
  });

  it('menolak mencabut kunci yang sudah dicabut', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(
      activeKey({ revokedAt: new Date('2026-01-01'), revokedReason: 'Sudah' }) as any
    );

    await expect(EsignService.revokeKey('ketua', 'admin-1', REASON)).rejects.toThrow(
      /sudah dicabut/i
    );
    expect(prisma.userSigningKey.updateMany).not.toHaveBeenCalled();
  });

  /**
   * Regresi BUG (finding D) — balapan dua pencabutan paralel.
   *
   * Kedua permintaan membaca kunci yang belum dicabut di luar transaksi, lalu
   * keduanya masuk ke transaksinya. Tanpa UPDATE bersyarat, keduanya menulis
   * dan masing-masing menulis audit "sukses", sehingga yang terakhir menimpa
   * tanggal/alasan/pelaku yang pertama. Di sini yang diuji adalah sisi yang
   * KALAH: `updateMany` mengembalikan `count: 0` (baris sudah diklaim
   * permintaan lain), dan pemanggilnya harus mendapat konflik deterministik
   * — bukan sukses palsu.
   */
  it('kalah balapan (count: 0) → 409 konflik, tanpa audit/notifikasi sukses', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    vi.mocked(prisma.userSigningKey.updateMany).mockResolvedValue({ count: 0 } as any);

    await expect(EsignService.revokeKey('ketua', 'admin-1', REASON)).rejects.toMatchObject({
      statusCode: 409,
    });
    // Tidak ada cap riwayat, tidak ada audit sukses, tidak ada notifikasi.
    expect(prisma.userSigningKeyHistory.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalledWith('notification:send', expect.anything());
  });

  it('menolak alasan yang hanya berisi spasi', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await expect(EsignService.revokeKey('ketua', 'admin-1', '              ')).rejects.toThrow(
      /Alasan pencabutan/i
    );
    expect(prisma.userSigningKey.updateMany).not.toHaveBeenCalled();
  });

  /**
   * Yang mencabut kunci karena passphrase bocor perlu tahu berapa surat yang
   * sudah telanjur ditandatangani dengannya — mencabut kuncinya tidak mencabut
   * satu pun di antaranya.
   */
  it('melaporkan surat yang sudah ditandatangani dengan kunci itu', async () => {
    const key = activeKey();
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(key as any);
    vi.mocked(prisma.letterSignature.findMany).mockResolvedValue([
      {
        id: 'sig-1',
        signedAt: new Date('2026-08-01'),
        letter: {
          id: 'letter-1',
          letterNumber: '434/Sket/Y-CPS/VII/2026',
          subject: 'Keterangan',
          date: new Date('2026-08-01'),
        },
      },
    ] as any);

    const r = await EsignService.revokeKey('ketua', 'admin-1', REASON);

    expect(r.affectedLetterCount).toBe(1);
    expect(r.affectedLetters[0]).toMatchObject({ letterId: 'letter-1', signatureId: 'sig-1' });
  });

  /**
   * Dicocokkan pada salinan kunci publiknya, bukan sekadar pada
   * penandatangannya: orang yang sama bisa pernah memegang kunci lain, dan
   * surat-surat kunci lama itu tidak ada hubungannya dengan kebocoran ini.
   */
  it('mencocokkan surat pada kunci publiknya, bukan hanya pada penandatangannya', async () => {
    const key = activeKey();
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(key as any);

    await EsignService.revokeKey('ketua', 'admin-1', REASON);

    expect(prisma.letterSignature.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { signerId: 'ketua', publicKey: key.publicKey, revokedAt: null },
      })
    );
  });

  /**
   * Kode sebab RFC 5280 §5.3.1: hanya KEY_COMPROMISE yang membuat surat-surat
   * yang telanjur ditandatangani menjadi meragukan. Membedakannya menghindarkan
   * petugas dari dua kekeliruan yang berlawanan — mencabut belasan naskah yang
   * sebenarnya tidak apa-apa, atau membiarkan naskah bertanda tangan kunci
   * bocor tetap berlaku.
   */
  it('menandai perlunya peninjauan hanya untuk kebocoran kunci', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    const bocor = await EsignService.revokeKey('ketua', 'admin-1', REASON, 'KEY_COMPROMISE' as any);
    expect(bocor.lettersNeedReview).toBe(true);

    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);
    const berhenti = await EsignService.revokeKey(
      'ketua',
      'admin-1',
      REASON,
      'AFFILIATION_CHANGED' as any
    );
    expect(berhenti.lettersNeedReview).toBe(false);
  });

  it('menyimpan kode sebabnya, dan memilih yang paling tidak berbahaya bila tidak disebut', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await EsignService.revokeKey('ketua', 'admin-1', REASON);

    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', revokedAt: null },
      data: expect.objectContaining({ revocationCode: 'AFFILIATION_CHANGED' }),
    });
  });

  it('memberi tahu pemilik kunci', async () => {
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(activeKey() as any);

    await EsignService.revokeKey('ketua', 'admin-1', REASON);

    expect(emitMock).toHaveBeenCalledWith(
      'notification:send',
      expect.objectContaining({ userId: 'ketua', title: expect.stringMatching(/Dicabut/i) })
    );
  });

  /**
   * Regresi Flags–Investigation — lifecycle `UserSigningKeyHistory` tidak
   * pernah dicatat.
   *
   * Modelnya mendokumentasikan `supersededAt`/`revokedAt`, tetapi tidak ada
   * jalur yang menulisnya: `ensureSigningKeyHistory` hanya meng-upsert baris
   * baru saat suara pertama ditandatangani, sementara penerbitan ulang dan
   * pencabutan hanya menyentuh `UserSigningKey`. Riwayat — satu-satunya yang
   * dipercaya saat memverifikasi suara historis — memperlihatkan setiap kunci
   * berlaku selamanya. Pencabutan harus menandai baris riwayat kunci itu,
   * dengan cap waktu yang SAMA, tanpa menyentuh suara yang sudah sah.
   */
  it('mencap revokedAt pada rekaman riwayat kunci yang dicabut', async () => {
    const key = activeKey();
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(key as any);

    const r = await EsignService.revokeKey('ketua', 'admin-1', REASON);

    expect(prisma.userSigningKeyHistory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'ketua',
          fingerprint: expect.any(String),
          revokedAt: null,
        }),
        data: { revokedAt: expect.any(Date) },
      })
    );
    // Cap waktu riwayat harus sama dengan cap waktu kuncinya.
    const call = vi.mocked(prisma.userSigningKeyHistory.updateMany).mock.calls[0][0] as any;
    expect((call.data.revokedAt as Date).getTime()).toBe(r.revokedAt.getTime());
  });
});

describe('mencabut naskah dinas', () => {
  const REASON = 'Nomor surat ganda, diterbitkan ulang';
  const SIGNER = { id: 'ketua', roleCode: 'YAYASAN_KETUA' };
  const PENGAWAS = { id: 'pengawas-1', roleCode: 'YAYASAN_PENGAWAS' };
  const SUPER_ADMIN = { id: 'admin-1', roleCode: 'SUPER_ADMIN' };
  const OTHER = { id: 'guru-9', roleCode: 'TKQ_GURU' };

  function signedLetter(over: Record<string, unknown> = {}) {
    return {
      id: 'letter-1',
      status: 'SIGNED',
      letterNumber: '434/Sket/Y-CPS/VII/2026',
      subject: 'Keterangan',
      createdById: 'tata-usaha',
      signatures: [
        { id: 'sig-1', signerId: 'ketua', signerRoleCode: 'YAYASAN_KETUA', revokedAt: null },
      ],
      ...over,
    };
  }

  /** Kunci milik pencabutnya — bukan milik penandatangan. */
  function revokerKey(userId: string) {
    return activeKey({ id: `key-${userId}`, userId });
  }

  beforeEach(() => {
    vi.mocked(prisma.letterSignature.update).mockResolvedValue({
      id: 'sig-1',
      revokedAt: new Date(),
      revokedReason: REASON,
    } as any);
    vi.mocked(prisma.letterFlowEvent.create).mockResolvedValue({ id: 'ev-1' } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'audit-1' } as any);
  });

  it('penandatangannya sendiri boleh mencabut', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('ketua') as any);

    await EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS);

    expect(prisma.letterSignature.update).toHaveBeenCalledWith({
      where: { id: 'sig-1' },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        revokedReason: REASON,
        revokedById: 'ketua',
        revokedByRoleCode: 'YAYASAN_KETUA',
      }),
    });
  });

  /**
   * Menganulir naskah organ pelaksana adalah perbuatan pengawasan, dan Pengawas
   * memakai kuncinya sendiri — sehingga passphrase Ketua yang bocor tidak
   * menghalangi pencabutannya.
   */
  it('Pengawas boleh mencabut naskah Pengurus, dengan kuncinya sendiri', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('pengawas-1') as any);

    await EsignService.revokeLetterSignature('letter-1', PENGAWAS, REASON, PASS);

    expect(prisma.userSigningKey.findUnique).toHaveBeenCalledWith({
      where: { userId: 'pengawas-1' },
    });
    expect(prisma.letterSignature.update).toHaveBeenCalled();
  });

  /**
   * Pengelola sistem mengurus kunci, bukan kewenangan menandatangani atas nama
   * yayasan. Sebelumnya ia boleh mencabut naskah siapa pun.
   */
  it('Super Admin ditolak, dan tidak ada yang tertulis', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);

    await expect(
      EsignService.revokeLetterSignature('letter-1', SUPER_ADMIN, REASON, PASS)
    ).rejects.toThrow(/Pengawas Yayasan/i);

    expect(prisma.letterSignature.update).not.toHaveBeenCalled();
  });

  it('pengguna lain ditolak', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);

    await expect(
      EsignService.revokeLetterSignature('letter-1', OTHER, REASON, PASS)
    ).rejects.toThrow(/Pengawas Yayasan/i);

    expect(prisma.letterFlowEvent.create).not.toHaveBeenCalled();
  });

  /**
   * Pencabutan adalah pernyataan kriptografis, bukan pengubahan kolom status:
   * sebuah CRL pun ditandatangani penerbitnya (RFC 5280). Passphrase yang salah
   * berarti tidak ada pencabutan sama sekali.
   */
  it('passphrase salah tidak mencabut apa pun, dan dicatat', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('ketua') as any);

    await expect(
      EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, 'passphrase-yang-salah')
    ).rejects.toThrow(/Passphrase/i);

    expect(prisma.letterSignature.update).not.toHaveBeenCalled();
    // Finding 5 — pencacah pencabut juga naik secara atomik di basis data.
    expect(incrementSql()).toMatch(/"failed_attempts" = "failed_attempts" \+ 1/);
  });

  it('menyimpan tanda tangan Ed25519 atas pernyataan pencabutannya', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    const key = revokerKey('ketua');
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(key as any);

    await EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS);

    const written = vi.mocked(prisma.letterSignature.update).mock.calls[0][0] as any;
    expect(written.data.revocationSignature).toEqual(expect.any(String));
    expect(written.data.revocationDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(written.data.revocationPublicKey).toBe(key.publicKey);

    // Benar-benar dapat diverifikasi, bukan sekadar terisi.
    expect(
      verifyRevocation(
        written.data.revocationPublicKey,
        {
          signatureId: 'sig-1',
          letterId: 'letter-1',
          revokedById: 'ketua',
          revokedByRoleCode: 'YAYASAN_KETUA',
          revokedAt: written.data.revokedAt,
          reason: REASON,
        },
        written.data.revocationSignature
      )
    ).toBe(true);
  });

  it('alasan yang diubah membatalkan tanda tangan pencabutannya', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('ketua') as any);

    await EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS);
    const written = vi.mocked(prisma.letterSignature.update).mock.calls[0][0] as any;

    expect(
      verifyRevocation(
        written.data.revocationPublicKey,
        {
          signatureId: 'sig-1',
          letterId: 'letter-1',
          revokedById: 'ketua',
          revokedByRoleCode: 'YAYASAN_KETUA',
          revokedAt: written.data.revokedAt,
          reason: 'Alasan yang diganti diam-diam',
        },
        written.data.revocationSignature
      )
    ).toBe(false);
  });

  it('menolak bila pencabut tidak punya kunci yang berlaku', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(null as any);

    await expect(
      EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS)
    ).rejects.toThrow(/kunci tanda tangan elektronik/i);
  });

  /**
   * Statusnya sengaja tetap. Surat ini memang pernah ditandatangani dan memang
   * pernah beredar; mengembalikannya ke DRAFT menghapus kenyataan itu dari buku
   * agenda.
   */
  it('tidak mengubah status surat', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('ketua') as any);

    await EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS);

    expect(prisma.letter.update).not.toHaveBeenCalled();
  });

  it('mencatat pencabutan pada riwayat alur surat', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('pengawas-1') as any);

    await EsignService.revokeLetterSignature('letter-1', PENGAWAS, REASON, PASS);

    expect(prisma.letterFlowEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        letterId: 'letter-1',
        actorId: 'pengawas-1',
        action: 'SIGNATURE_REVOKED',
        note: expect.stringContaining(REASON),
      }),
    });
  });

  it('memberi tahu penandatangan dan pembuat konsep', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('pengawas-1') as any);

    await EsignService.revokeLetterSignature('letter-1', PENGAWAS, REASON, PASS);

    const notified = emitMock.mock.calls
      .filter((c) => c[0] === 'notification:send')
      .map((c) => (c[1] as { userId: string }).userId);
    expect(notified).toContain('ketua');
    expect(notified).toContain('tata-usaha');
  });

  it('tidak memberi tahu pencabutnya sendiri', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
    vi.mocked(prisma.userSigningKey.findUnique).mockResolvedValue(revokerKey('ketua') as any);

    await EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS);

    const notified = emitMock.mock.calls
      .filter((c) => c[0] === 'notification:send')
      .map((c) => (c[1] as { userId: string }).userId);
    expect(notified).not.toContain('ketua');
  });

  it('menolak naskah yang sudah dicabut, dan mengatakannya begitu', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(
      signedLetter({
        signatures: [
          {
            id: 'sig-1',
            signerId: 'ketua',
            signerRoleCode: 'YAYASAN_KETUA',
            revokedAt: new Date('2026-08-20'),
          },
        ],
      }) as any
    );

    await expect(
      EsignService.revokeLetterSignature('letter-1', SIGNER, REASON, PASS)
    ).rejects.toThrow(/sudah dicabut/i);
    expect(prisma.letterSignature.update).not.toHaveBeenCalled();
  });

  it('menolak alasan yang terlalu pendek', async () => {
    vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);

    await expect(
      EsignService.revokeLetterSignature('letter-1', SIGNER, 'salah', PASS)
    ).rejects.toThrow(/Alasan pencabutan/i);
    expect(prisma.letterSignature.update).not.toHaveBeenCalled();
  });
});
