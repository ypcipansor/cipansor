import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  FoundationDecisionService,
  canonicalDecisionPayload,
  sha256bytes,
} from '../foundation-decisions.service';
import { createKeyMaterial } from '@/utils/esign';
import { createSealMaterial, signSeal } from '@/utils/foundation-eseal';
import { config } from '@/config';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    foundationDecision: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    foundationDecisionMember: { create: vi.fn() },
    foundationDecisionVote: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    foundationDecisionRule: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    foundationEseal: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    foundationDecisionDocument: { create: vi.fn(), findUnique: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    userSigningKey: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(prisma)),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

const PASS = 'passphrase-anggota-2026';
const material = createKeyMaterial(PASS);
const signingKeyRow = {
  id: 'key-user-1',
  algorithm: material.algorithm,
  publicKey: material.publicKey,
  encryptedPrivateKey: material.encryptedPrivateKey,
  kdfSalt: material.kdfSalt,
  kdfParams: material.kdfParams,
  iv: material.iv,
  authTag: material.authTag,
  approvedAt: new Date(),
  expiresAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
  revokedAt: null,
  lockedUntil: null,
  failedAttempts: 0,
};

const dm = prisma as unknown as Record<string, any>;

function memberAssignments(count: number, roleCode = 'YAYASAN_PEMBINA') {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i}`,
    user: { id: `user-${i}`, name: `Anggota ${i}` },
    role: { code: roleCode },
  }));
}

function decisionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'dec-1',
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    decisionType: 'pengesahan-rencana-kerja',
    subject: 'Pengesahan Rencana Kerja',
    body: 'Rencana kerja tahunan disetujui seluruh anggota.',
    status: 'VOTING',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: 'user-0',
    decidedById: null,
    decidedAt: null,
    quorumSnapshot: {
      organType: 'PEMBINA',
      kind: 'CIRCULAR',
      activeCount: 3,
      presentMode: 'MUTLAK',
      presentValue: 1,
      decisionMode: 'MUTLAK',
      decisionValue: 1,

    },
    voteSummary: { approve: 0, reject: 0, abstain: 0, present: 0, active: 3, totalVotes: 0 },
    finalPdfDigest: null,
    finalPdfByteSize: null,
    finalPdfSealSignature: null,
    esealId: null,
    verificationToken: 'tok-1',
    createdBy: { id: 'user-0', name: 'Anggota 0' },
    decidedBy: null,
    members: [
      {
        id: 'm0',
        userId: 'user-0',
        name: 'Anggota 0',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-0', name: 'Anggota 0' },
      },
      {
        id: 'm1',
        userId: 'user-1',
        name: 'Anggota 1',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-1', name: 'Anggota 1' },
      },
      {
        id: 'm2',
        userId: 'user-2',
        name: 'Anggota 2',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-2', name: 'Anggota 2' },
      },
    ],
    votes: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dm.$executeRaw.mockResolvedValue(1);
  dm.$transaction.mockImplementation((cb: any) => cb(prisma));
});

describe('sha256bytes', () => {
  it('meng-hash byte mentah, bukan teks hasil dekode UTF-8', () => {
    // Byte 0x80–0xFF tidak sah sebagai UTF-8. `toString('utf8')` menggantinya
    // dengan U+FFFD, sehingga dua berkas berbeda dapat menghasilkan digest yang
    // sama — regresi yang membuat verifikasi tidak lagi mengikat byte asli.
    const a = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x80]);
    const b = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xfd, 0xfc, 0x01, 0x81]);
    expect(sha256bytes(a)).not.toBe(sha256bytes(b));
    expect(sha256bytes(a)).toBe(createHash('sha256').update(a).digest('hex'));
  });

  it('berbeda dari hash teks-lossy untuk byte non-UTF8', () => {
    const buf = Buffer.from([0xff, 0xfe, 0x80]);
    const lossy = createHash('sha256').update(buf.toString('utf8'), 'utf8').digest('hex');
    expect(sha256bytes(buf)).not.toBe(lossy);
  });
});

describe('canonicalDecisionPayload', () => {
  const base = {
    decisionId: 'dec-1',
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    decisionType: 'pengesahan-rencana-kerja',
    subject: 'Pengesahan',
    body: 'Isi keputusan.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    activeCount: 3,
    voterId: 'user-1',
    choice: 'APPROVE',
    signedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('deterministik untuk input yang sama', () => {
    expect(canonicalDecisionPayload(base)).toBe(canonicalDecisionPayload(base));
  });

  it('berubah bila isi keputusan berubah', () => {
    const changed = canonicalDecisionPayload({ ...base, body: 'Isi keputusan berbeda.' });
    expect(changed).not.toBe(canonicalDecisionPayload(base));
  });

  it('berubah bila pilihan suara berubah', () => {
    expect(canonicalDecisionPayload({ ...base, choice: 'REJECT' })).not.toBe(
      canonicalDecisionPayload(base)
    );
  });
});

describe('FoundationDecisionService.castVote', () => {
  it('mencatat suara + tanda tangan digital dan memperbarui ringkasan', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({
      id: 'vote-1',
      decisionId: 'dec-1',
      userId: 'user-1',
      choice: 'APPROVE',
      signedAt: new Date(),
    });
    dm.foundationDecisionVote.findMany.mockResolvedValue([
      { choice: 'APPROVE' },
      { choice: 'APPROVE' },
      { choice: 'REJECT' },
    ]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', note: undefined, passphrase: PASS }
    );

    expect(result.voteId).toBe('vote-1');
    expect(dm.foundationDecisionVote.create).toHaveBeenCalledTimes(1);
    const created = dm.foundationDecisionVote.create.mock.calls[0][0].data;
    expect(created.choice).toBe('APPROVE');
    expect(created.signature).toBeTruthy();
    expect(created.publicKey).toBe(material.publicKey);
    expect(created.canonicalDigest).toBeTruthy();
    expect(result.voteSummary.approve).toBe(2);
    expect(result.voteSummary.reject).toBe(1);
  });

  it('mengunci baris keputusan di dalam transaksi (anti-balapan)', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([{ choice: 'APPROVE' }]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    expect(dm.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dm.$transaction).toHaveBeenCalledTimes(1);
  });

  it('menolak bila keputusan sudah tidak VOTING saat baris dikunci', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique
      .mockResolvedValueOnce(d) // pemeriksaan awal
      .mockResolvedValueOnce(decisionRow({ status: 'APPROVED' })); // di dalam kunci
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/tidak lagi menerima suara/);
  });

  it('menolak bila sudah pernah memberi suara', async () => {
    const d = decisionRow({
      votes: [
        {
          id: 'v',
          userId: 'user-1',
          choice: 'APPROVE',
          signedAt: new Date(),
          user: { id: 'user-1', name: 'Anggota 1' },
        },
      ],
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/sudah memberikan suara/);
  });

  it('menolak pemilih di luar SNAPSHOT anggota meski perannya anggota organ', async () => {
    // Peran saat ini YAYASAN_PEMBINA, tetapi userId-nya tidak ada di snapshot —
    // orang yang baru diangkat setelah keputusan dibuat.
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'newcomer', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/bukan anggota organ/);
  });

  it('menerima pemilih yang ada di snapshot walau roleCode saat ini berbeda', async () => {
    // Anggota snapshot (user-1) tetapi peran hari ini bukan lagi organ itu —
    // tetap boleh, karena snapshot-lah yang terkunci.
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([{ choice: 'APPROVE' }]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'STAFF' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );
    expect(result.voteId).toBe('vote-1');
  });

  it('mewajibkan alasan untuk REJECT pada keputusan sirkuler', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'REJECT',
        note: 'no',
        passphrase: PASS,
      })
    ).rejects.toThrow(/wajib disertai alasan/);
  });

  it('menolak pemilih tanpa kunci tanda tangan yang sah', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(null);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/belum memiliki kunci tanda tangan/);
  });

  it('menaikkan failedAttempts dan memberi tahu sisa percobaan saat passphrase salah', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    // `increment` atomik mengembalikan baris HASIL increment, bukan nilai basi
    // yang dibaca sebelum update.
    dm.userSigningKey.update
      .mockResolvedValueOnce({ ...signingKeyRow, failedAttempts: 1 })
      .mockResolvedValueOnce(signingKeyRow);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: 'passphrase-yang-salah-sekali',
      })
    ).rejects.toThrow(/Sisa percobaan: 4/);

    // Pernyataan increment atomik, bukan penulisan nilai hasil baca.
    const incrementCall = dm.userSigningKey.update.mock.calls[0][0];
    expect(incrementCall.data).toEqual({ failedAttempts: { increment: 1 } });
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  it('mengunci kunci setelah percobaan gagal mencapai ambang', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue({ ...signingKeyRow, failedAttempts: 4 });
    dm.userSigningKey.update
      .mockResolvedValueOnce({ ...signingKeyRow, failedAttempts: 5 })
      .mockResolvedValueOnce(signingKeyRow);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: 'passphrase-yang-salah-sekali',
      })
    ).rejects.toThrow(/dikunci sementara/);

    // `lockedUntil` dihitung dari nilai HASIL increment (5), bukan dari 4.
    const lockCall = dm.userSigningKey.update.mock.calls[1][0];
    expect(lockCall.data.lockedUntil).toBeInstanceOf(Date);
  });

  /**
   * Regresi: percobaan gagal PARALEL tidak boleh melewati lockout.
   *
   * Dulu `recordFailedAttempt(keyId, current)` menulis `current + 1` dari nilai
   * yang dibaca sebelum update. Lima percobaan paralel sama-sama membaca
   * `failedAttempts: 0`, dan kelimanya menulis `1` — penghitung tak pernah
   * menembus ambang, jadi lockout tak pernah menyala dan tebakan passphrase
   * menjadi gratis. Dengan `increment` atomik, tiap panggilan menaikkan nilai
   * yang benar-benar tersimpan.
   */
  it('lima percobaan salah paralel tetap saling menaikkan until lockout tercapai', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue({ ...signingKeyRow, failedAttempts: 0 });

    // Simulasi penghitung yang benar-benar bertambah di basis data: setiap
    // `increment` mengembalikan nilai berikutnya, membuktikan tiap panggilan
    // bergantung pada hasil panggilan sebelumnya, bukan pada bacaan basi.
    let stored = 0;
    dm.userSigningKey.update.mockImplementation(async (args: any) => {
      if (args.data.failedAttempts?.increment) stored += args.data.failedAttempts.increment;
      return { ...signingKeyRow, failedAttempts: stored };
    });

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        FoundationDecisionService.castVote(
          { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
          'dec-1',
          { choice: 'APPROVE', passphrase: 'passphrase-yang-salah-sekali' }
        ).catch((e) => e as Error)
      )
    );

    // Setidaknya satu percobaan melaporkan kunci terkunci — mustahil terjadi
    // bila kelimanya menulis nilai basi yang sama.
    expect(attempts.some((e) => /dikunci sementara/.test((e as Error).message))).toBe(true);
    expect(stored).toBe(5);
    // Panggilan increment haruslah bentuk atomik, bukan `failedAttempts: n`.
    const incrementCalls = dm.userSigningKey.update.mock.calls.filter(
      (c: any) => c[0].data.failedAttempts?.increment
    );
    expect(incrementCalls).toHaveLength(5);
  });

  it('menolak menandatangani bila kunci sedang terkunci', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue({
      ...signingKeyRow,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/terkunci sementara/);
  });

  it('membuka blokir setelah suara berhasil ditandatangani', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([{ choice: 'APPROVE' }]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findMany.mockResolvedValue([]);

    await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    expect(dm.userSigningKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedAttempts: 0, lockedUntil: null }),
      })
    );
  });

  /**
   * Regresi: audit VOTE ditulis DI DALAM transaksi suara.
   *
   * Dulu `auditLog.create` VOTE berjalan SETELAH transaksi commit. Bila
   * penulisan audit gagal, suara sudah tercommit tetapi `castVote` melempar
   * galat; percobaan ulang ditolak sebagai suara ganda, sehingga suara sah
   * kehilangan baris auditnya. Di sini kegagalan audit harus membatalkan
   * seluruh transaksi — suara tidak boleh tercommit.
   */
  it('gagal menulis audit → vote tidak tercommit (audit di dalam transaksi)', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([{ choice: 'APPROVE' }]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findMany.mockResolvedValue([]);
    dm.auditLog.create.mockRejectedValueOnce(new Error('audit down'));

    // Transaksi tiruan yang benar-benar rollback: perubahan hanya tersedia bila
    // callback selesai tanpa melempar.
    const committed: string[] = [];
    dm.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        ...prisma,
        $executeRaw: vi.fn().mockResolvedValue(1),
        foundationDecision: prisma.foundationDecision,
        foundationDecisionVote: prisma.foundationDecisionVote,
        foundationEseal: prisma.foundationEseal,
        auditLog: prisma.auditLog,
        userSigningKey: prisma.userSigningKey,
      };
      const result = await cb(tx);
      committed.push('commit');
      return result;
    });

    await expect(
      FoundationDecisionService.castVote(
        { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
        'dec-1',
        { choice: 'APPROVE', passphrase: PASS }
      )
    ).rejects.toThrow(/audit down/);

    // Audit dipanggil di dalam callback transaksi, dan transaksi TIDAK pernah
    // mencapai titik commit — vote tidak tercommit.
    expect(dm.auditLog.create).toHaveBeenCalledTimes(1);
    expect(committed).toEqual([]);
  });
});

describe('FoundationDecisionService.create', () => {
  it('membuat keputusan + snapshot anggota organ dan mencatat audit', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(3));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    const id = await FoundationDecisionService.create(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        subject: 'Subjek Keputusan',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'pengesahan-rencana-kerja',
      }
    );

    expect(id).toBe('dec-new');
    expect(dm.foundationDecision.create).toHaveBeenCalledTimes(1);
    const data = dm.foundationDecision.create.mock.calls[0][0].data;
    expect(data.status).toBe('VOTING');
    expect(data.quorumSnapshot.presentMode).toBe('MUTLAK');
    expect(data.members.create).toHaveLength(3);
    expect(dm.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('menolak organ yang tidak berwenang atas jenis keputusan', async () => {
    // PENGURUS tidak berwenang atas "perubahan-anggaran-dasar" (milik Pembina).
    await expect(
      FoundationDecisionService.create(
        { id: 'user-9', roleCode: 'YAYASAN_KETUA' },
        {
          organType: 'PENGURUS',
          kind: 'MEETING',
          subject: 'Perubahan AD',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'perubahan-anggaran-dasar',
        }
      )
    ).rejects.toThrow(/tidak berwenang/);

    expect(dm.userRoleAssignment.findMany).not.toHaveBeenCalled();
  });

  it('menolak organ kosong (tanpa anggota aktif) alih-alih meloloskan kuorum', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue([]);

    await expect(
      FoundationDecisionService.create(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Subjek Keputusan',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      )
    ).rejects.toThrow(/Tidak ada anggota aktif/);

    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
  });

  it('menyaring penugasan kedaluwarsa dan akun nonaktif dari snapshot', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(1));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await FoundationDecisionService.create(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        subject: 'Subjek Keputusan',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'pengesahan-rencana-kerja',
      }
    );

    const where = dm.userRoleAssignment.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
    expect(where.user).toEqual({ isActive: true, deletedAt: null });
  });
});

describe('FoundationDecisionService.applyOutcome', () => {
  it('meng-hash BYTE PDF dan menyimpan referensi e-seal spesifik', async () => {
    const sealMaterialRow = createSealMaterial(config.foundation.esealPassphrase);
    const sealRow = {
      id: 'seal-1',
      algorithm: sealMaterialRow.algorithm,
      publicKey: sealMaterialRow.publicKey,
      encryptedPrivateKey: sealMaterialRow.encryptedPrivateKey,
      kdfSalt: sealMaterialRow.kdfSalt,
      kdfParams: sealMaterialRow.kdfParams,
      iv: sealMaterialRow.iv,
      authTag: sealMaterialRow.authTag,
      revokedAt: null,
      activatedAt: new Date(),
      createdAt: new Date(),
    };
    dm.foundationEseal.findMany.mockResolvedValue([sealRow]);
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });
    dm.foundationDecision.update.mockResolvedValue({ id: 'dec-1', status: 'APPROVED' });
    dm.auditLog.create.mockResolvedValue({ id: 'log-1' });

    const evaluation = {
      outcome: 'APPROVED' as const,
      activeCount: 3,
      presentCount: 3,
      approvedCount: 3,
      rejectedCount: 0,
      abstainCount: 0,
      presentRequired: 3,
      decisionRequired: 3,
      presentMet: true,
      decisionMet: true,
      neededToApprove: 0,
    };

    // renderPdf menghasilkan PDF nyata; sha256bytes harus dipakai, bukan
    // sha256hex(buf.toString('utf8')).
    const result = await FoundationDecisionService.applyOutcome(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      decisionRow() as never,
      evaluation as never
    );

    expect(result.outcome).toBe('APPROVED');
    // Seal yang dicabut tidak boleh dipakai untuk membubuhkan tanda tangan
    // baru: pencarian hanya boleh menyentuh seal yang masih aktif.
    expect(dm.foundationEseal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { revokedAt: null } })
    );
    const updateData = dm.foundationDecision.update.mock.calls[0][0].data;
    expect(updateData.esealId).toBe('seal-1');
    // Digest harus sama dengan hash byte arsip, bukan hash teksnya.
    const docData = dm.foundationDecisionDocument.create.mock.calls[0][0].data;
    const archivedBytes = Buffer.from(docData.bytes);
    expect(updateData.finalPdfDigest).toBe(sha256bytes(archivedBytes));
    expect(updateData.finalPdfDigest).toBe(docData.sha256);
  });

  /**
   * Regresi: PDF yang disegel harus dirender dari bentuk keputusan FINAL,
   * bukan dari baris yang masih VOTING.
   *
   * `applyOutcome` dulu memanggil `renderPdf(d)` SEBELUM `foundationDecision
   * .update`, sehingga `d.status` masih VOTING dan `decidedAt` null — dan arsip
   * permanen yang ditandatangani e-seal mencetak "Status: VOTING" serta
   * menghilangkan tanggal putusan. Karena digest-nya mengunci byte itu, kesalahannya
   * tersegel selamanya. Yang diperiksa di sini adalah argumen yang benar-benar
   * diterima generator PDF.
   */
  it('merender PDF dari bentuk final (APPROVED + decidedAt), bukan VOTING', async () => {
    const sealMaterialRow = createSealMaterial(config.foundation.esealPassphrase);
    dm.foundationEseal.findMany.mockResolvedValue([
      {
        id: 'seal-1',
        ...sealMaterialRow,
        revokedAt: null,
        activatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });
    dm.foundationDecision.update.mockResolvedValue({ id: 'dec-1', status: 'APPROVED' });

    const captured: Array<{ status: string; decidedAt: Date | null }> = [];
    const spy = vi
      .spyOn(FoundationDecisionService, 'renderPdf')
      .mockImplementation(async (d: any) => {
        captured.push({ status: d.status, decidedAt: d.decidedAt });
        return Buffer.from('%PDF-1.7 arsip final');
      });

    const evaluation = {
      outcome: 'APPROVED' as const,
      activeCount: 3,
      presentCount: 3,
      approvedCount: 3,
      rejectedCount: 0,
      abstainCount: 0,
      presentRequired: 3,
      decisionRequired: 3,
      presentMet: true,
      decisionMet: true,
      neededToApprove: 0,
    };

    try {
      // `decisionRow()` berstatus VOTING dengan decidedAt null — persis baris
      // yang dulu dirender apa adanya.
      await FoundationDecisionService.applyOutcome(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        decisionRow() as never,
        evaluation as never
      );

      expect(captured).toHaveLength(1);
      expect(captured[0].status).toBe('APPROVED');
      expect(captured[0].decidedAt).toBeInstanceOf(Date);
      // Tanggal yang tercetak di PDF harus sama dengan yang ditulis ke basis
      // data — dua nilai berbeda berarti arsip dan DB menyebut waktu berbeda.
      const updateData = dm.foundationDecision.update.mock.calls[0][0].data;
      expect(updateData.decidedAt).toEqual(captured[0].decidedAt);
    } finally {
      spy.mockRestore();
    }
  });

  /**
   * Regresi: rotasi `FOUNDATION_ESEAL_PASSPHRASE` tidak boleh memblokir
   * approval baru.
   *
   * `ensureSeal` dulu mengambil seal aktif TERTUA (`revokedAt: null`) tanpa
   * memeriksa apakah kunci privatnya masih dapat didekripsi dengan passphrase
   * SEKARANG. Setelah passphrase dirotasi, seal lama masih `revokedAt: null`,
   * sehingga dipakai ulang; `signSeal` lalu gagal mendekripsi DI DALAM
   * transaksi approval, seluruh transaksi rollback, dan keputusan tak pernah
   * tertutup. Seal yang tak dapat ditandatangani harus dilewati dan seal baru
   * diterbitkan.
   */
  it('menerbitkan seal baru saat seal lama tersegel passphrase lama (rotasi)', async () => {
    // Baris seal lama: masih aktif, tetapi passphrase-nya (lama) berbeda dari
    // `config.foundation.esealPassphrase` yang berlaku sekarang. Stub `findFirst`
    // juga supaya implementasi lama (yang mengambil seal aktif tertua) benar-
    // benar bertemu seal yang tak dapat ditandatangani ini, bukan tak sengaja
    // lolos karena mock-nya kosong.
    const oldMaterial = createSealMaterial('passphrase-e-seal-lama-2025');
    const oldSealRow = {
      id: 'seal-lama',
      ...oldMaterial,
      revokedAt: null,
      activatedAt: new Date(),
      createdAt: new Date(),
    };
    dm.foundationEseal.findMany.mockResolvedValue([oldSealRow]);
    dm.foundationEseal.findFirst.mockResolvedValue(oldSealRow);
    dm.foundationEseal.create.mockResolvedValue({
      id: 'seal-baru',
      ...createSealMaterial(config.foundation.esealPassphrase),
      revokedAt: null,
      activatedAt: new Date(),
      createdAt: new Date(),
    });
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });
    dm.foundationDecision.update.mockResolvedValue({ id: 'dec-1', status: 'APPROVED' });
    dm.auditLog.create.mockResolvedValue({ id: 'log-1' });

    const evaluation = {
      outcome: 'APPROVED' as const,
      activeCount: 3,
      presentCount: 3,
      approvedCount: 3,
      rejectedCount: 0,
      abstainCount: 0,
      presentRequired: 3,
      decisionRequired: 3,
      presentMet: true,
      decisionMet: true,
      neededToApprove: 0,
    };

    const result = await FoundationDecisionService.applyOutcome(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      decisionRow() as never,
      evaluation as never
    );

    // Approval berhasil alih-alih melempar karena dekripsi gagal...
    expect(result.outcome).toBe('APPROVED');
    // ...seal baru diterbitkan, dan keputusan mereferensikannya — bukan seal
    // lama yang tak dapat ditandatangani.
    expect(dm.foundationEseal.create).toHaveBeenCalledTimes(1);
    const updateData = dm.foundationDecision.update.mock.calls[0][0].data;
    expect(updateData.esealId).toBe('seal-baru');
    expect(updateData.finalPdfSealSignature).toBeTruthy();
  });
});

describe('FoundationDecisionService.verifyByToken', () => {
  it('mengembalikan bentuk DTO lengkap dengan nilai netral saat tidak ditemukan', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(null);
    const res = await FoundationDecisionService.verifyByToken('nope');
    expect(res).toMatchObject({
      found: false,
      isValid: false,
      decisionId: null,
      subject: null,
      organType: null,
      status: null,
      decidedAt: null,
      digest: null,
      archiveDigest: null,
      digestOk: null,
      sealVerified: null,
      reason: expect.any(String),
      voteCount: 0,
      approveCount: 0,
      rejectCount: 0,
      abstainCount: 0,
    });
  });

  /**
   * Regresi privasi: endpoint verifikasi anonim TIDAK boleh membocorkan roster
   * tata kelola (userId/nama/roleCode setiap anggota). Cukup angka rekap suara
   * untuk membuktikan kuorum; siapa yang memutus adalah data internal.
   */
  it('tidak mengembalikan roster anggota ke pemanggil anonim', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...decisionRow({ status: 'APPROVED' }),
      finalPdfDigest: null,
      finalPdfSealSignature: null,
      esealId: null,
      document: null,
    });
    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res).not.toHaveProperty('members');
    expect(JSON.stringify(res)).not.toContain('Anggota 0');
  });

  it('menghitung ulang hash byte arsip dan menandai byte yang diubah', async () => {
    const bytes = Buffer.from('%PDF-1.7 arsip asli');
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...decisionRow({ status: 'APPROVED' }),
      finalPdfDigest: sha256bytes(bytes),
      finalPdfSealSignature: null,
      esealId: null,
      document: { bytes: new Uint8Array(bytes) },
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res.found).toBe(true);
    expect(res.archiveDigest).toBe(sha256bytes(bytes));
    expect(res.digestOk).toBe(true);
  });

  it('menandai digestOk=false bila byte arsip berbeda dari digest tertanda tangan', async () => {
    const signed = Buffer.from('%PDF-1.7 arsip asli');
    const tampered = Buffer.from('%PDF-1.7 arsip yang diubah');
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...decisionRow({ status: 'APPROVED' }),
      finalPdfDigest: sha256bytes(signed),
      finalPdfSealSignature: null,
      esealId: null,
      document: { bytes: new Uint8Array(tampered) },
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res.digestOk).toBe(false);
    expect(res.archiveDigest).toBe(sha256bytes(tampered));
    expect(res.digest).toBe(sha256bytes(signed));
  });

  it('memakai seal spesifik (esealId), bukan seal tertua', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...decisionRow({ status: 'APPROVED' }),
      finalPdfDigest: 'digest-abc',
      finalPdfSealSignature: 'sig-abc',
      esealId: 'seal-spesifik',
      document: null,
    });
    dm.foundationEseal.findUnique.mockResolvedValue(null);

    await FoundationDecisionService.verifyByToken('tok-1');

    expect(dm.foundationEseal.findUnique).toHaveBeenCalledWith({
      where: { id: 'seal-spesifik' },
    });
    expect(dm.foundationEseal.findFirst).not.toHaveBeenCalled();
  });
});

describe('FoundationDecisionService.getFinalDocument', () => {
  it('mengembalikan dokumen untuk keputusan APPROVED', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'APPROVED' },
    });
    const doc = await FoundationDecisionService.getFinalDocument('dec-1');
    expect(doc.id).toBe('doc-1');
  });

  it('melempar 404 bila dokumen belum final', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'VOTING' },
    });
    await expect(FoundationDecisionService.getFinalDocument('dec-1')).rejects.toThrow(
      /belum final/
    );
  });

  it('melempar 404 bila dokumen tidak ada', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue(null);
    await expect(FoundationDecisionService.getFinalDocument('dec-1')).rejects.toThrow(
      /tidak ditemukan/
    );
  });
});

describe('FoundationDecisionService.verifyByPdfBuffer', () => {
  const sealMaterialRow = createSealMaterial(config.foundation.esealPassphrase);

  function approvedRow(digest: string, signature: string | null) {
    return {
      ...decisionRow({ status: 'APPROVED' }),
      finalPdfDigest: digest,
      finalPdfSealSignature: signature,
      esealId: signature ? 'seal-1' : null,
    };
  }

  /**
   * Regresi BUG KRITIS: PDF palsu yang mempertahankan token asli.
   *
   * Jalur token menghitung ulang hash arsip SERVER, sehingga sebuah PDF karangan
   * yang menyalin token asli tetap lolos. Jalur unggahan menghitung hash byte
   * yang BENAR-BENAR diunggah pemindai dan membandingkannya dengan digest yang
   * ditandatangani e-seal — berkas asing itu harus ditolak.
   */
  it('menolak berkas unggahan yang tidak dikenal (digest tak cocok)', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(null);
    dm.foundationDecision.findFirst.mockResolvedValue(null);

    const forged = Buffer.from('%PDF-1.7 isi karangan yang menyisipkan token asli');
    const res = await FoundationDecisionService.verifyByPdfBuffer(forged);

    expect(res.found).toBe(false);
    expect(res.isValid).toBe(false);
    // Pencarian dilakukan lewat digest unggahan, bukan sekadar token.
    expect(dm.foundationDecision.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { finalPdfDigest: sha256bytes(forged) } })
    );
  });

  it('menerima berkas unggahan yang byte-nya persis sama dengan arsip tersegel', async () => {
    const bytes = Buffer.from('%PDF-1.7 arsip asli yang di-e-seal');
    const digest = sha256bytes(bytes);
    const signature = signSeal(sealMaterialRow, config.foundation.esealPassphrase, digest);

    dm.foundationDecision.findUnique.mockResolvedValue(approvedRow(digest, signature));
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: sealMaterialRow.publicKey,
    });

    const res = await FoundationDecisionService.verifyByPdfBuffer(bytes);
    expect(res.found).toBe(true);
    expect(res.digestOk).toBe(true);
    expect(res.sealVerified).toBe(true);
    expect(res.isValid).toBe(true);
  });

  /**
   * Regresi: rotasi passphrase e-seal tidak boleh membatalkan verifikasi
   * keputusan lama.
   *
   * Versi sebelumnya menuntut `signSeal(material, SEAL_PASSPHRASE, digest)`
   * sama dengan tanda tangan tersimpan — yang berarti mendekripsi kunci privat
   * dengan passphrase yang berlaku SEKARANG. Setelah passphrase dirotasi, setiap
   * keputusan lama gagal diverifikasi padahal dokumennya tidak berubah. Yang
   * benar adalah memverifikasi dengan kunci PUBLIK, yang tidak ikut berubah.
   */
  it('tetap memverifikasi tanda tangan setelah passphrase dirotasi (kunci publik)', async () => {
    const bytes = Buffer.from('%PDF-1.7 arsip lama sebelum rotasi');
    const digest = sha256bytes(bytes);
    // Ditandatangani dengan passphrase LAMA.
    const oldMaterial = createSealMaterial('passphrase-e-seal-lama-2025');
    const signature = signSeal(oldMaterial, 'passphrase-e-seal-lama-2025', digest);

    dm.foundationDecision.findUnique.mockResolvedValue(approvedRow(digest, signature));
    // Kunci publik seal LAMA — pasphrase SEKRANG di `config` berbeda dan tidak
    // dapat mendekripsi kunci privat lama; verifikasi harus tetap berhasil.
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: oldMaterial.publicKey,
    });

    const res = await FoundationDecisionService.verifyByPdfBuffer(bytes);
    expect(res.sealVerified).toBe(true);
    expect(res.isValid).toBe(true);
  });

  it('menandai tidak sah bila berkas unggahan diubah setelah disegel', async () => {
    const signed = Buffer.from('%PDF-1.7 arsip asli');
    const digest = sha256bytes(signed);
    const signature = signSeal(sealMaterialRow, config.foundation.esealPassphrase, digest);
    // Byte server = arsip asli; berkas unggahan = arsip yang diubah. Pencarian
    // memakai sha256 arsip (kolom sha256) menemukannya, lalu digestOk=false.
    dm.foundationDecision.findUnique.mockResolvedValue(null);
    dm.foundationDecision.findFirst.mockResolvedValue(approvedRow(digest, signature));
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: sealMaterialRow.publicKey,
    });

    const res = await FoundationDecisionService.verifyByPdfBuffer(
      Buffer.from('%PDF-1.7 arsip yang diubah')
    );
    expect(res.found).toBe(true);
    expect(res.digestOk).toBe(false);
    expect(res.isValid).toBe(false);
  });
});
