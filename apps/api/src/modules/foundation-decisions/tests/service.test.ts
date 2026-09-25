import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  FoundationDecisionService,
  canonicalDecisionPayload,
  sha256bytes,
  sha256hex,
  canonicalDigestForVote,
} from '../foundation-decisions.service';
import { createKeyMaterial, publicKeyFingerprint, signPdfHash } from '@/utils/esign';
import * as pdfModule from '@/utils/generate-decision-pdf';
import { createSealMaterial, signSeal } from '@/utils/foundation-eseal';
import { requiredCount } from '@/utils/foundation-quorum';
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
      updateMany: vi.fn(),
    },
    foundationDecisionDocument: { create: vi.fn(), findUnique: vi.fn() },
    userRoleAssignment: { findMany: vi.fn(), findFirst: vi.fn() },
    userSigningKey: { findUnique: vi.fn(), update: vi.fn() },
    userSigningKeyHistory: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(prisma)),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
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

/**
 * Buat baris suara yang BENAR-BENAR bertanda tangan untuk sebuah keputusan.
 *
 * Sejak `votesOf` memverifikasi ulang tiap suara, mock `{ choice: 'APPROVE' }`
 * tanpa digest/tanda tangan tidak lagi dihitung — dan itu memang tujuannya.
 * Helper ini membangun baris yang lolos verifikasi sehingga test yang menguji
 * jalur lain (kuorum, lock, audit) tetap menguji apa yang dimaksudkannya.
 */
/**
 * Rekaman kunci publik tepercaya untuk seorang anggota.
 *
 * Sejak audit #1, sebuah suara hanya sah bila menunjuk rekaman riwayat kunci
 * yang dimiliki pemilih yang SAMA (`signingKeyId` + fingerprint). Baris yang
 * hanya membawa `publicKey` sendiri TIDAK lagi dihitung — itulah perbaikannya.
 * Helper ini membangun rekaman yang membuat test jalur lain tetap bermakna.
 */
function keyHistoryRow(userId: string) {
  return {
    id: `kh-${userId}`,
    userId,
    algorithm: material.algorithm,
    publicKey: material.publicKey,
    fingerprint: publicKeyFingerprint(material.publicKey),
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    supersededAt: null,
    revokedAt: null,
  };
}

function signedVoteRow(
  d: any,
  userId: string,
  choice: 'APPROVE' | 'REJECT' | 'ABSTAIN',
  signedAt = new Date('2026-01-02T00:00:00Z')
) {
  const digest = canonicalDigestForVote(d, { userId, choice, signedAt });
  const key = keyHistoryRow(userId);
  return {
    id: `vote-${userId}`,
    decisionId: d.id,
    userId,
    choice,
    canonicalDigest: digest,
    signature: signPdfHash(material, PASS, digest),
    publicKey: material.publicKey,
    algorithm: material.algorithm,
    note: null,
    signedAt,
    signingKeyId: key.id,
    publicKeyFingerprint: key.fingerprint,
    user: { id: userId, name: `Anggota ${userId}` },
    signingKey: key,
  };
}

function memberAssignments(count: number, roleCode = 'YAYASAN_PEMBINA') {
  return Array.from({ length: count }, (_, i) => ({
    id: `asg-${i}`,
    userId: `user-${i}`,
    isPrimary: i === 0,
    user: { id: `user-${i}`, name: `Anggota ${i}` },
    role: { code: roleCode },
  }));
}

function decisionRow(over: Record<string, unknown> = {}): any {
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
    publication: 'PRIVATE',
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
  // `assertUserActiveInTx` membaca status hidup akun DI DALAM transaksi dengan
  // `FOR UPDATE`. Default-nya: akun aktif dan belum dihapus, sehingga uji yang
  // bukan tentang offboarding tidak ikut gagal. Uji offboarding menimpanya.
  dm.$queryRaw.mockResolvedValue([{ is_active: true, deleted_at: null }]);
  // `assertActorHasCurrentOrganAssignmentInTx` (F1) menuntut penugasan organ
  // yang saat ini aktif untuk SETIAP suara. Default-nya: satu penugasan aktif,
  // sehingga uji yang bukan tentang pencabutan peran tidak ikut gagal. Uji
  // pencabutan/kedaluwarsa peran menimpanya dengan `null`.
  dm.userRoleAssignment.findFirst.mockResolvedValue({ id: 'asg-current' });
  // `assertActorAuthorizedInTx` (F4) membaca ulang peran AKTIF aktor di dalam
  // transaksi lewat `userRoleAssignment.findMany`. Mock yang sama juga melayani
  // pembacaan snapshot anggota `create`, jadi dibedakan dari `where.userId`
  // (hanya pembacaan peran aktor yang memfilter per pengguna). Default SUPER
  // ADMIN membuat uji yang bukan tentang pencabutan peran lolos otorisasi;
  // uji F4 menimpanya. Uji yang mengeset `mockResolvedValue` sendiri tetap
  // menang atas implementasi ini.
  dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
    args?.where?.userId ? [{ role: { code: 'SUPER_ADMIN' } }] : []
  );
  // `ensureSigningKeyHistory` meng-upsert rekaman kunci tepercaya; kembalikan
  // baris yang dibentuk dari argumennya supaya suara yang dibuat terikat ke
  // rekaman milik pemilih yang benar.
  dm.userSigningKeyHistory.upsert.mockImplementation((args: any) => ({
    id: `kh-${args.create.userId}`,
    userId: args.create.userId,
    algorithm: args.create.algorithm,
    publicKey: args.create.publicKey,
    fingerprint: args.create.fingerprint,
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    supersededAt: null,
    revokedAt: null,
  }));
  // Anti-TOCTOU (audit B): `castVote` membaca ULANG rekaman riwayat di dalam
  // transaksi. Default-nya adalah rekaman yang masih berlaku; test yang
  // menguji rotasi menimpanya dengan `revokedAt`/`supersededAt`.
  dm.userSigningKeyHistory.findUnique.mockImplementation(async () => ({
    id: 'kh-user-1',
    userId: 'user-1',
    algorithm: material.algorithm,
    publicKey: material.publicKey,
    fingerprint: publicKeyFingerprint(material.publicKey),
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    supersededAt: null,
    revokedAt: null,
  }));
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
      signedVoteRow(d, 'user-1', 'APPROVE'),
      signedVoteRow(d, 'user-2', 'APPROVE'),
      signedVoteRow(d, 'user-0', 'REJECT'),
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
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    // F1 memperkuat protokol kunci: `castVote` kini mengunci baris keputusan
    // DAN tabel penugasan (agar pemeriksaan hak pilih hari ini tidak balapan
    // dengan pencabutan peran). Assertion menghitung jumlah panggilan menjadi
    // rapuh; yang penting adalah kedua kunci yang menjamin anti-balapan itu
    // BENAR-BENAR diambil, dan tetap di dalam SATU transaksi.
    const lockSql = dm.$executeRaw.mock.calls
      .map((c: unknown[]) => (Array.isArray(c[0]) ? (c[0] as string[]).join('') : String(c[0])))
      .join('\n');
    expect(lockSql).toMatch(/foundation_decisions/);
    expect(lockSql).toMatch(/user_role_assignments/);
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
    // Suara lama yang BENAR-BENAR bertanda tangan: itulah yang menghalangi
    // suara kedua. Baris mentah tanpa tanda tangan tidak dihitung (lihat uji
    // "baris suara tidak sah" di bawah), sehingga memakai baris kosong di sini
    // justru menguji jalur yang berbeda dari yang dimaksud.
    const d = decisionRow({ votes: [signedVoteRow(decisionRow(), 'user-1', 'APPROVE')] });
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
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
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

  /**
   * Devin Review — catatan suara dapat "terdampar" seperti naskah.
   *
   * Catatan suara dicetak `buildPdfData` → `generateDecisionPdf`, yang MENOLAK
   * aksara tanpa glyph. Gerbang saat pembuatan keputusan tidak melihat catatan
   * yang masuk belakangan, jadi sebelum perbaikan sebuah emoji di catatan
   * membuat suara TERSIMPAN tetapi `prepareApprovalArtifact` gagal permanen:
   * keputusan tidak dapat disahkan dan tidak ada jalur mengedit catatan.
   * Perbaikan menolak catatan di pintu masuk, memakai cakupan glyph yang SAMA.
   */
  it('menolak catatan suara yang memuat aksara tanpa glyph (emoji) sebelum suara tersimpan', async () => {
    const d = decisionRow({ kind: 'DELIBERATION' });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'REJECT',
        note: 'Perlu revisi 🎉',
        passphrase: PASS,
      })
    ).rejects.toThrow(/Catatan suara memuat aksara yang tidak dapat dicetak/);

    // Tidak ada suara yang ditulis: validasi berjalan SEBELUM transaksi, jadi
    // pemilih tetap dapat mengirim ulang catatan yang sudah dibersihkan.
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  it('menerima catatan suara biasa (teks WinAnsi) saat font Unicode tersedia', async () => {
    const d = decisionRow({ kind: 'DELIBERATION' });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([
      { ...signedVoteRow(d, 'user-1', 'REJECT'), note: 'Perlu revisi anggaran' },
    ]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'REJECT', note: 'Perlu revisi anggaran', passphrase: PASS }
    );
    expect(result.voteId).toBe('vote-1');
    const created = dm.foundationDecisionVote.create.mock.calls[0][0].data;
    expect(created.note).toBe('Perlu revisi anggaran');
  });

  /**
   * F1 (SECURITY CRITICAL) — mantan anggota organ kehilangan hak suara.
   *
   * Snapshot keanggotaan bersifat immutable sebagai catatan historis, tetapi
   * hak suara baru harus mengikuti penugasan organ yang SAAT INI aktif.
   * `castVote` memeriksanya di dalam transaksi, di bawah kunci penugasan yang
   * sama dengan seluruh mutasi eligibility.
   */
  it('menolak pemilih yang seluruh peran organnya sudah dicabut', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    // Masih anggota snapshot, akun aktif, kunci sah — tetapi TIDAK ada
    // penugasan organ yang aktif hari ini.
    dm.userRoleAssignment.findFirst.mockResolvedValue(null);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/tidak lagi memegang peran organ yang aktif/);
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  it('menerima pemilih yang masih memegang penugasan organ aktif', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);
    dm.userRoleAssignment.findFirst.mockResolvedValue({ id: 'asg-current' });

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
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
    // Increment dan penghitungan lockout terjadi dalam SATU pernyataan SQL;
    // bacaan sesudahnya mengembalikan nilai pasca-increment.
    dm.userSigningKey.findUnique
      .mockResolvedValueOnce(signingKeyRow)
      .mockResolvedValueOnce({ ...signingKeyRow, failedAttempts: 1 });
    dm.$executeRaw.mockResolvedValue(1);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: 'passphrase-yang-salah-sekali',
      })
    ).rejects.toThrow(/Sisa percobaan: 4/);

    // Increment + `lockedUntil` ditulis dalam SATU pernyataan SQL, bukan dua
    // update terpisah yang dapat berjalan terbalik. (F4: pernyataan pertama
    // kini advisory lock, jadi increment dicari lewat isinya, bukan indeks.)
    const increment = dm.$executeRaw.mock.calls
      .map((c: any[]) => (c[0] as string[]).join('?'))
      .find((sql: string) => sql.includes('"failed_attempts" = "failed_attempts" + 1'));
    expect(increment).toBeDefined();
    expect(increment).toContain('locked_until');
    // F4: pencacah berjalan di bawah advisory lock per-pengguna yang SAMA
    // dengan reset saat suara sukses.
    const lockSql = dm.$executeRaw.mock.calls
      .map((c: any[]) => (c[0] as string[]).join('?'))
      .find((sql: string) => sql.includes('pg_advisory_xact_lock'));
    expect(lockSql).toBeDefined();
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  it('mengunci kunci setelah percobaan gagal mencapai ambang', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique
      .mockResolvedValueOnce({ ...signingKeyRow, failedAttempts: 4 })
      .mockResolvedValueOnce({ ...signingKeyRow, failedAttempts: 5 });

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: 'passphrase-yang-salah-sekali',
      })
    ).rejects.toThrow(/dikunci sementara/);

    // `locked_until` dihitung DI DALAM pernyataan yang sama dari
    // `failed_attempts + 1` — tidak ada update kedua yang dapat menimpanya.
    const rawSql = dm.$executeRaw.mock.calls
      .map((c: any[]) => (c[0] as string[]).join('?'))
      .find((sql: string) => sql.includes('"failed_attempts" + 1 >='));
    expect(rawSql).toBeDefined();
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

    // Simulasi basis data yang benar-benar atomik: SATU pernyataan menaikkan
    // penghitung dan mengunci bila ambang tercapai, berdasarkan nilai yang
    // tersimpan saat itu. Inilah yang membuat kegagalan paralel tidak dapat
    // saling menimpa — tak ada penulisan kedua yang dapat mengembalikan
    // `lockedUntil` ke nilai lebih rendah.
    let stored = 0;
    let lockedUntil: Date | null = null;
    dm.$executeRaw.mockImplementation(async (strings: any, ...values: any[]) => {
      // F4: pencacah kini didahului advisory lock dalam transaksi yang sama.
      // Hanya pernyataan yang benar-benar menaikkan penghitung yang dihitung;
      // memakai indeks argumen akan salah, karena advisory lock membawa satu
      // nilai (userId) sedangkan increment membawa beberapa.
      const sql = (strings as string[]).join('?');
      if (sql.includes('pg_advisory_xact_lock')) return 1;
      const keyId = values[values.length - 1];
      stored += 1;
      if (stored >= 5) lockedUntil = new Date(Date.now() + 15 * 60_000);
      void keyId;
      return 1;
    });
    dm.userSigningKey.findUnique.mockImplementation(async () => ({
      ...signingKeyRow,
      failedAttempts: stored,
      lockedUntil,
    }));

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
          choice: 'APPROVE',
          passphrase: 'passphrase-yang-salah-sekali',
        }).catch((e) => e as Error)
      )
    );

    // Setidaknya satu percobaan melaporkan kunci terkunci — mustahil terjadi
    // bila kelimanya menulis nilai basi yang sama.
    expect(attempts.some((e) => /dikunci sementara/.test((e as Error).message))).toBe(true);
    expect(stored).toBe(5);
    // Lockout tidak boleh kembali longgar: nilai akhirnya terkunci.
    expect(lockedUntil).toBeInstanceOf(Date);
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
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
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
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
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
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/audit down/);

    // Audit dipanggil di dalam callback transaksi, dan transaksi TIDAK pernah
    // mencapai titik commit — vote tidak tercommit.
    expect(dm.auditLog.create).toHaveBeenCalledTimes(1);
    expect(committed).toEqual([]);
  });

  /**
   * Regresi BUG SEVERE — hasil rapat bergantung pada urutan suara.
   *
   * `castVote` dulu memanggil `evaluateQuorum` TANPA `closed`, dan mesin kuorum
   * lama memulangkan APPROVED begitu peserta yang SEDANG hadir menyetujui —
   * sehingga dua orang yang membuka rapat lalu setuju langsung mengesahkannya,
   * dan anggota ketiga yang datang kemudian ditolak. Pada rapat, satu suara
   * yang masuk TIDAK boleh menutup rapat; statusnya tetap VOTING sampai
   * pemimpin menutupnya lewat `finalize`.
   */
  it('suara pada rapat TIDAK menutup rapat sendiri (outcome tetap OPEN)', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    // Setelah suara ini, kuorum hadir (3/3) dan mayoritas setuju tercapai —
    // cukup untuk APPROVED pada mesin lama. Tetap OPEN selama belum ditutup.
    dm.foundationDecisionVote.findMany.mockResolvedValue([
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'APPROVE'),
      signedVoteRow(d, 'user-2', 'APPROVE'),
    ]);
    dm.foundationDecision.update.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    expect(result.outcome.outcome).toBe('OPEN');
    expect(result.outcome.status).toBe('VOTING');
  });

  /**
   * Regresi audit B — rotasi kunci paralel TIDAK boleh meninggalkan suara
   * invalid yang memblokir percobaan ulang.
   *
   * `castVote` membaca kunci, menandatangani, lalu membuka transaksi. Bila
   * `esign.activateKey`/`revokeKey` commit di sela-selanya, baris suara yang
   * terlanjur ditulis ditolak `isVoteAuthentic` (kunci tidak berlaku pada
   * `signedAt`) TETAPI tetap ada — sehingga rekap tidak memuat suara itu dan
   * percobaan ulang ditolak "sudah memberikan suara". Perbaikannya: buktikan
   * ulang kunci DI DALAM transaksi, SEBELUM insert. Test ini mensimulasikan
   * rotasi yang menang dengan membuat riwayat kunci sudah di-supersede saat
   * pembacaan di dalam transaksi.
   */
  it('rotasi kunci yang menang membatalkan suara TANPA menyisakan baris (bisa retry)', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    // Kunci yang menandatangani sudah DIGANTIKAN sebelum transaksi suara
    // membaca ulang riwayatnya (rotasi menang).
    dm.userSigningKeyHistory.upsert.mockImplementation((args: any) => ({
      id: `kh-${args.create.userId}`,
      userId: args.create.userId,
      algorithm: args.create.algorithm,
      publicKey: args.create.publicKey,
      fingerprint: args.create.fingerprint,
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      supersededAt: null,
      revokedAt: null,
    }));
    dm.userSigningKeyHistory.findUnique.mockResolvedValue({
      id: 'kh-user-1',
      userId: 'user-1',
      algorithm: material.algorithm,
      publicKey: material.publicKey,
      fingerprint: publicKeyFingerprint(material.publicKey),
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      // Rotasi jatuh TEPAT SEBELUM signedAt → keyUsableAt false.
      supersededAt: new Date('2026-01-01T12:00:00Z'),
      revokedAt: null,
    });

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/berubah atau tidak lagi berlaku/);

    // Tidak ada baris suara yang ditulis → pengguna dapat mencoba lagi.
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  /**
   * Kunci yang hilang sama sekali di dalam transaksi (rotasi sudah menghapus
   * baris lama, penggantinya belum/sudah beda) juga fail closed tanpa insert.
   */
  it('kunci hilang/berbeda di dalam transaksi → batal tanpa insert', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const other = createKeyMaterial('kunci-baru-pengganti-2026');
    // Pembacaan PERTAMA (di luar transaksi) memakai kunci lama; pembacaan
    // KEDUA (di dalam transaksi) mendapati kunci sudah diganti.
    dm.userSigningKey.findUnique.mockResolvedValueOnce(signingKeyRow).mockResolvedValueOnce({
      ...signingKeyRow,
      publicKey: other.publicKey,
      algorithm: other.algorithm,
    });

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/berubah atau tidak lagi berlaku/);
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });
});

/**
 * Finding 3 (BUG severe) — kegagalan menyiapkan artefak TIDAK boleh membuang
 * suara penentu.
 *
 * Sebelum perbaikan, `prepareApprovalArtifact` yang melempar (mis. font
 * Unicode hilang sehingga glyph tak bisa dicetak) merambat keluar transaksi
 * dan me-rollback suara yang BARU SAJA membuat kuorum terpenuhi. Pemilih
 * kehilangan suaranya dan harus memilih ulang. Sesudah perbaikan, suaranya
 * tercatat, penyegelan ditunda (`sealDeferred`), dan status tetap VOTING
 * sehingga `finalize` dapat merender ulang setelah penyebabnya pulih.
 */
it('artefak gagal → suara TETAP tercatat, penyegelan ditunda (regresi finding 3)', async () => {
  const d = decisionRow({
    kind: 'CIRCULAR',
    status: 'VOTING',
    quorumSnapshot: {
      organType: 'PEMBINA',
      kind: 'CIRCULAR',
      activeCount: 3,
      presentMode: 'MUTLAK',
      presentValue: 1,
      decisionMode: 'MUTLAK',
      decisionValue: 1,
    },
  });
  // Dua anggota sudah menyetujui; suara ketiga (user-1) membuat kuorum PENUH.
  // Pembacaan PERTAMA (di luar lock) hanya memuat dua suara; pembacaan di
  // DALAM lock memuat suara ketiga yang barusan ditulis.
  // Tiga pembacaan berurutan: (1) di luar lock, (2) di dalam lock untuk
  // cek duplikat — keduanya BELUM memuat suara user-1; (3) sesudah insert,
  // untuk mengevaluasi kuorum — sudah memuat suara user-1.
  dm.foundationDecision.findUnique
    .mockResolvedValueOnce({
      ...d,
      votes: [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-2', 'APPROVE')],
    })
    .mockResolvedValueOnce({
      ...d,
      votes: [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-2', 'APPROVE')],
    })
    .mockResolvedValue({
      ...d,
      votes: [
        signedVoteRow(d, 'user-0', 'APPROVE'),
        signedVoteRow(d, 'user-1', 'APPROVE'),
        signedVoteRow(d, 'user-2', 'APPROVE'),
      ],
    });
  dm.foundationDecisionVote.create.mockResolvedValue({
    id: 'vote-1',
    decisionId: 'dec-1',
    userId: 'user-1',
    choice: 'APPROVE',
    signedAt: new Date(),
  });
  // Ketiga anggota menyetujui → kuorum penuh, sehingga `applyLocked` akan
  // mencoba menyegel. Tepat di situ penyiapan artefak GAGAL.
  dm.foundationDecisionVote.findMany.mockResolvedValue([
    signedVoteRow(d, 'user-0', 'APPROVE'),
    signedVoteRow(d, 'user-1', 'APPROVE'),
    signedVoteRow(d, 'user-2', 'APPROVE'),
  ]);
  dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
  dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
  dm.foundationEseal.findFirst.mockResolvedValue(null);

  const renderSpy = vi
    .spyOn(FoundationDecisionService, 'renderPdf')
    .mockRejectedValue(
      new Error('Naskah memuat aksara yang tidak memiliki glyph pada font risalah')
    );

  try {
    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    // Suara tercatat — inilah inti perbaikan.
    expect(dm.foundationDecisionVote.create).toHaveBeenCalledTimes(1);
    expect(result.voteId).toBe('vote-1');
    // Penyegelan ditunda, status tetap VOTING, dan pemanggil diberi tahu
    // supaya UI tidak menyuruh pemilih mengulang suara yang sudah sah.
    expect(result.sealDeferred).toBe(true);
    expect(result.outcome.outcome).toBe('OPEN');
    expect(result.outcome.status).toBe('VOTING');
    // Tidak ada dokumen final yang diarsipkan tanpa e-seal, dan keputusan
    // TIDAK pernah ditandai APPROVED tanpa dokumen — penyegelan benar-benar
    // ditunda, bukan setengah jalan. (Pembaruan `voteSummary` tetap terjadi.)
    expect(dm.foundationDecisionDocument.create).not.toHaveBeenCalled();
    const statusWrites = dm.foundationDecision.update.mock.calls
      .map((c: any[]) => c[0]?.data?.status)
      .filter(Boolean);
    expect(statusWrites).not.toContain('APPROVED');
  } finally {
    renderSpy.mockRestore();
  }
});

describe('FoundationDecisionService.finalize', () => {
  /**
   * Rapat 3 anggota: kuorum hadir MAJORITY (>½ → 2), keputusan MAJORITY hadir.
   */
  const meeting = (votes: any[]) =>
    decisionRow({
      kind: 'MEETING',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
      votes,
    });

  beforeEach(() => {
    dm.foundationEseal.findFirst.mockResolvedValue(null);
    dm.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  /**
   * Regresi BUG SEVERE — rapat quorate yang gagal mencapai approval menggantung
   * selamanya.
   *
   * Rapat yang kuorum tetapi tidak cukup setuju menunggu seluruh anggota aktif
   * memilih; anggota absen membuatnya tak pernah dapat ditutup. Penutupan
   * manual (`closed: true`) menghitung hasil sekali terhadap suara yang ada dan
   * menutupnya sebagai REJECTED tanpa menunggu yang absen.
   */
  it('menutup rapat quorate tanpa approval cukup sebagai REJECTED', async () => {
    // 2 hadir (kuorum terpenuhi), 1 setuju & 1 menolak → mayoritas TIDAK
    // tercapai. Anggota ketiga absen dan tidak boleh membuat rapat menggantung.
    const d = meeting([]);
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'REJECT')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'REJECTED' });

    const res = await FoundationDecisionService.finalize(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );

    expect(res.outcome).toBe('REJECTED');
    expect(dm.foundationDecision.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
    );
  });

  it('menolak menutup rapat yang belum memenuhi kuorum hadir', async () => {
    // Hanya 1 dari 3 hadir → kuorum hadir (2) belum terpenuhi.
    const d = meeting([]);
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/belum dapat ditutup/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Regresi BUG NON-SEVERE — aksi finalisasi pada sirkuler selalu gagal.
   *
   * Sirkuler tidak punya rapat untuk ditutup; hasilnya ditutup OTOMATIS oleh
   * `castVote` (APPROVED saat mufakat tercapai, REJECTED saat mustahil), dan
   * selama masih mungkin ia tetap VOTING. Karena itu `finalize` tidak punya
   * kondisi sukses yang sah untuknya — ia selalu menolak. Sebelum perbaikan,
   * `canFinalize` pada DTO masih `true` untuk sirkuler, sehingga UI menawarkan
   * tombol yang endpoint-nya pasti tolak.
   */
  it('CIRCULAR: finalize ditolak eksplisit (tidak ada penutupan manual)', async () => {
    // 3 anggota aktif; 2 setuju, 1 belum bersuara, jadi mufakat 3 masih mungkin.
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/sirkuler tidak difinalisasi manual/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Sirkuler dengan aturan non-mufakat (MAJORITY) pun tak dapat difinalkan.
   * Penolakannya eksplisit dan tidak bergantung pada outcome kuorum.
   */
  it('CIRCULAR mayoritas: finalize juga ditolak eksplisit', async () => {
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 5,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    // 3 anggota: 1 setuju, 1 menolak, 1 abstain. Ambang mayoritas = 3 (+1 dari
    // 5 > 2.5). Sisa 2 anggota masih dapat menyetujui, jadi belum mustahil.
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'REJECT'),
      signedVoteRow(d, 'user-2', 'ABSTAIN'),
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/sirkuler tidak difinalisasi manual/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Sirkuler yang mufakat sudah MUSTAHIL: penutupan REJECTED terjadi lewat
   * `castVote` OTOMATIS, bukan `finalize`. Aksi manual tetap ditolak.
   */
  it('CIRCULAR: finalize tetap ditolak walau mufakat sudah mustahil', async () => {
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    d.votes = [signedVoteRow(d, 'user-0', 'REJECT'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/sirkuler tidak difinalisasi manual/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Sirkuler yang seluruh anggotanya sudah setuju tetap APPROVED lewat
   * `castVote` — kecuali bila penyegelannya TERTUNDA.
   *
   * Bila penyiapan artefak gagal pada suara terakhir, `castVote` menyimpan
   * suaranya tetapi menunda e-seal dan meninggalkan status VOTING. Tidak ada
   * suara baru yang mungkin (semua sudah memilih), sehingga `finalize` adalah
   * SATU-SATUNYA jalan menyelesaikannya; menolaknya membuat keputusan
   * tergantung selamanya. Di sini penyebabnya sudah pulih, jadi penyegelan
   * dilanjutkan dan keputusan menjadi APPROVED.
   */
  it('CIRCULAR: penyegelan tertunda diselesaikan lewat finalize (menjadi APPROVED)', async () => {
    const sealMaterialRow = createSealMaterial(config.foundation.esealPassphrase);
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'APPROVE'),
      signedVoteRow(d, 'user-2', 'APPROVE'),
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
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
    dm.auditLog.create.mockResolvedValue({ id: 'log-1' });

    const result = await FoundationDecisionService.finalize(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );

    expect(result.outcome).toBe('APPROVED');
    const statusWrites = dm.foundationDecision.update.mock.calls
      .map((c: any[]) => c[0]?.data?.status)
      .filter(Boolean);
    expect(statusWrites).toContain('APPROVED');
  });

  /**
   * Sirkuler dengan mufakat penuh tetapi riwayat kunci SUDAH DICABUT tetap
   * ditolak eksplisit: kuorum penuh yang tidak lagi autentik bukan "tertunda",
   * melainkan tidak sah — penyegelannya memang tidak boleh dilanjutkan.
   */
  it('CIRCULAR: suara yang tak lagi autentik TIDAK dianggap penyegelan tertunda', async () => {
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    // Tiga baris mentah menyetujui, tetapi tanda tangannya tidak terikat ke
    // riwayat kunci mana pun, jadi suara AUTENTIK = 0.
    d.votes = [
      { ...signedVoteRow(d, 'user-0', 'APPROVE'), signingKeyId: null, signingKey: null },
      { ...signedVoteRow(d, 'user-1', 'APPROVE'), signingKeyId: null, signingKey: null },
      { ...signedVoteRow(d, 'user-2', 'APPROVE'), signingKeyId: null, signingKey: null },
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/sirkuler tidak difinalisasi manual/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Regresi BUG — Pengawas tidak dapat memulai/menutup keputusan kewenangannya.
   *
   * Rute FINALIZE memuat Pengawas supaya ia dapat menutup rapat organnya, tetapi
   * service memperketatnya: finalizer yang bukan pimpinan/Super Admin hanya
   * boleh menutup keputusan yang memuatnya sebagai anggota snapshot. Tanpa itu
   * satu-satunya cara Pengawas memperoleh hak buka rapatnya adalah sekaligus
   * memperoleh hak menutup rapat organ mana pun.
   */
  it('menolak Pengawas yang bukan anggota snapshot menutup keputusan organ lain', async () => {
    const d = meeting([]); // anggota snapshot: user-0, user-1, user-2
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.finalize(
        { id: 'pengawas-luar', roleCode: 'YAYASAN_PENGAWAS' },
        'dec-1'
      )
    ).rejects.toThrow(/tidak berhak menutup/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  it('mengizinkan Pengawas anggota snapshot menutup rapat organnya', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      status: 'VOTING',
      members: [
        { id: 'm0', userId: 'user-0', name: 'Anggota 0', roleCode: 'YAYASAN_PENGAWAS' },
        { id: 'm1', userId: 'pengawas-1', name: 'Pengawas', roleCode: 'YAYASAN_PENGAWAS' },
      ],
      quorumSnapshot: {
        organType: 'PENGAWAS',
        kind: 'MEETING',
        activeCount: 2,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    // 2 hadir (kuorum), 1 setuju & 1 menolak → tidak ada mayoritas → REJECTED.
    // Finalisasi REJECTED tidak menyentuh jalur PDF/e-seal, jadi yang benar-benar
    // diuji di sini adalah OTORISASI finalizer, bukan kripto seal.
    d.votes = [signedVoteRow(d, 'pengawas-1', 'APPROVE'), signedVoteRow(d, 'user-0', 'REJECT')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'REJECTED' });

    const res = await FoundationDecisionService.finalize(
      { id: 'pengawas-1', roleCode: 'YAYASAN_PENGAWAS' },
      'dec-1'
    );
    expect(res.outcome).toBe('REJECTED');
  });
});

/**
 * Regresi finding 1 (BUG severe) — keputusan yang naskahnya TIDAK DAPAT
 * dirender harus punya terminal.
 *
 * Sebelum gerbang `create` ada, keputusan dengan emoji dapat terlanjur dibuat.
 * `finalize`/penyegelan gagal permanen, dan `cancel` dulu menolaknya karena
 * kuorum hadir sudah terpenuhi — sehingga keputusan tergantung `VOTING`
 * selamanya. Sekarang `cancel` meloloskan pembatalan justru ketika naskahnya
 * tidak dapat dirender, dengan alasan audit yang berbeda.
 */
describe('FoundationDecisionService.cancel — jalan keluar naskah tak-tercetak', () => {
  it('membatalkan rapat VOTING yang kuorumnya penuh bila naskah tak dapat dirender', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      status: 'VOTING',
      subject: 'Pengesahan 🎉 rencana kerja',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    // Kuorum hadir terpenuhi (2 dari 3).
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'CANCELLED' });

    const res = await FoundationDecisionService.cancel(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(res.outcome).toBe('CANCELLED');
    const audit = dm.auditLog.create.mock.calls.at(-1)![0].data;
    expect(audit.action).toBe('CANCEL');
    expect(audit.newValues.reason).toBe('naskah-tidak-dapat-dirender');
    expect(audit.newValues.glyphOffenders.length).toBeGreaterThan(0);
  });

  it('TETAP menolak pembatalan bila kuorum penuh dan naskah dapat dirender', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.cancel({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/Kuorum rapat sudah terpenuhi/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  /**
   * Regresi finding 1 — sirkuler dengan penyegelan TERTUNDA juga terdampar.
   *
   * Sirkuler menutup dirinya pada suara penentu; bila penyegelan gagal pada
   * suara itu, tidak ada suara baru yang bisa masuk (`castVote` menolak suara
   * ganda) dan `finalize` pun gagal permanen bila penyebabnya font. Tanpa
   * pembatalan, keputusan itu tergantung `VOTING` selamanya. Pembatalan oleh
   * aktor berwenang adalah jalan keluar terminalnya.
   */
  it('membatalkan sirkuler yang penyegelannya tertunda permanen', async () => {
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      subject: 'Pengesahan rencana kerja',
      body: 'Rencana kerja tahunan disetujui seluruh anggota.',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    // Seluruh anggota menyetujui → mufakat penuh, tetapi status masih VOTING:
    // definisi `isDeferredCircular`.
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'APPROVE'),
      signedVoteRow(d, 'user-2', 'APPROVE'),
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'CANCELLED' });

    const res = await FoundationDecisionService.cancel(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(res.outcome).toBe('CANCELLED');
    const audit = dm.auditLog.create.mock.calls.at(-1)![0].data;
    expect(audit.newValues.reason).toBe('sirkuler-penyegelan-tertunda');
  });

  it('TETAP menolak pembatalan sirkuler VOTING yang bukan deferred', async () => {
    const d = decisionRow({
      kind: 'CIRCULAR',
      status: 'VOTING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    // Baru satu suara setuju: mufakat belum tercapai, jadi sirkuler masih bisa
    // menutup sendiri saat anggota lain bersuara — pembatalan manual ditolak.
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.cancel({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/tidak dibatalkan manual/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });
});

/**
 * Regresi BUG — tombol finalisasi ditawarkan kepada pengguna yang peladen
 * tolak (audit A).
 *
 * DTO detail kini membawa `canFinalize` yang dihitung dengan definisi yang
 * SAMA dengan `finalize`. Test ini memaku perilakunya untuk tiap kelas aktor.
 */
describe('FoundationDecisionService.detail — canFinalize pada DTO (audit A)', () => {
  it('pimpinan/Super Admin mendapat canFinalize=true pada keputusan rapat VOTING', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow({ kind: 'MEETING' }));
    const detail = await FoundationDecisionService.detail(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1'
    );
    expect(detail.canFinalize).toBe(true);
  });

  /**
   * Regresi BUG NON-SEVERE — sirkuler tidak pernah dapat difinalisasi manual.
   *
   * Hasil sirkuler ditutup otomatis saat pemungutan suara, sehingga tombol
   * Finalisasi (dan `canFinalize`) harus mati untuknya walau aktor berwenang
   * dan statusnya VOTING. Sebelum perbaikan, DTO memberi `canFinalize=true`.
   */
  it('CIRCULAR VOTING → canFinalize=false walau aktor berwenang', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow({ kind: 'CIRCULAR' }));
    const detail = await FoundationDecisionService.detail(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1'
    );
    expect(detail.canFinalize).toBe(false);
  });

  it('Pengawas BUKAN anggota snapshot mendapat canFinalize=false', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow({ kind: 'MEETING' }));
    const detail = await FoundationDecisionService.detail(
      { id: 'pengawas-luar', roleCode: 'YAYASAN_PENGAWAS' },
      'dec-1'
    );
    expect(detail.canFinalize).toBe(false);
  });

  it('Pengawas anggota snapshot mendapat canFinalize=true', async () => {
    const d = decisionRow({ kind: 'MEETING' });
    d.members = [
      { id: 'm1', userId: 'pengawas-1', name: 'Pengawas', roleCode: 'YAYASAN_PENGAWAS' },
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    const detail = await FoundationDecisionService.detail(
      { id: 'pengawas-1', roleCode: 'YAYASAN_PENGAWAS' },
      'dec-1'
    );
    expect(detail.canFinalize).toBe(true);
  });

  it('canFinalize=false saat keputusan sudah tidak VOTING', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({ kind: 'MEETING', status: 'APPROVED' })
    );
    const detail = await FoundationDecisionService.detail(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1'
    );
    expect(detail.canFinalize).toBe(false);
  });

  /**
   * Regresi BUG (audit A) — anggota snapshot yang rute TOLAK tidak boleh
   * memperoleh tombol.
   *
   * Bendahara & Anggota adalah anggota snapshot organ PENGURUS, tetapi tidak
   * ada di `FINALIZE` rute: `authorize(...FINALIZE)` menolak mereka 403 sebelum
   * service berjalan. Bila eligibility hanya dari keanggotaan, UI menawarkan
   * tombol yang peladen pasti tolak.
   */
  it('Bendahara & Anggota anggota snapshot → canFinalize=false & finalize ditolak', async () => {
    const d = decisionRow({ kind: 'MEETING' });
    d.members = [
      { id: 'm1', userId: 'bendahara-1', name: 'Bendahara', roleCode: 'YAYASAN_BENDAHARA' },
      { id: 'm2', userId: 'anggota-1', name: 'Anggota', roleCode: 'YAYASAN_ANGGOTA' },
    ];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    for (const actor of [
      { id: 'bendahara-1', roleCode: 'YAYASAN_BENDAHARA' },
      { id: 'anggota-1', roleCode: 'YAYASAN_ANGGOTA' },
    ]) {
      const detail = await FoundationDecisionService.detail(actor, 'dec-1');
      expect(detail.canFinalize).toBe(false);
      await expect(FoundationDecisionService.finalize(actor, 'dec-1')).rejects.toThrow(
        /tidak berhak menutup/
      );
    }
  });
});

/**
 * Regresi BUG (finding B) — `canVote` pada DTO detail.
 *
 * Sebelumnya `canVote` hanya melihat status VOTING + keanggotaan snapshot,
 * sehingga anggota yang SUDAH memilih tetap menerima `canVote: true` dan UI
 * menawarkan tombol yang `castVote` pasti tolak ("sudah memberikan suara").
 * Kontrak peladen harus benar lebih dulu; menyembunyikan tombol di web adalah
 * tambahan, bukan penggantinya.
 */
describe('FoundationDecisionService.detail — canVote pada DTO (finding B)', () => {
  it('anggota yang belum memilih pada keputusan VOTING mendapat canVote=true', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    const detail = await FoundationDecisionService.detail(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(detail.canVote).toBe(true);
    expect(detail.myVote).toBeNull();
  });

  it('anggota yang SUDAH memilih mendapat canVote=false dan suaranya terbaca', async () => {
    const d = decisionRow();
    d.votes = [signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    const detail = await FoundationDecisionService.detail(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(detail.canVote).toBe(false);
    expect(detail.myVote).toBe('APPROVE');
  });

  it('anggota snapshot yang peran organnya sudah dicabut → canVote=false', async () => {
    // F1: peladen menolak suara mantan anggota yang seluruh peran organnya
    // dicabut, jadi DTO juga tidak boleh menawarkannya.
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    dm.userRoleAssignment.findFirst.mockResolvedValue(null);
    const detail = await FoundationDecisionService.detail(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(detail.members.some((m) => m.userId === 'user-1')).toBe(true);
    expect(detail.canVote).toBe(false);
  });

  it('peran READ yang bukan anggota snapshot dapat membaca tetapi canVote=false', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    // Peran yayasan boleh MEMBACA seluruh keputusan, tetapi yang bukan anggota
    // snapshot organ ini bukan pemilih — `castVote` menolaknya sebagai bukan
    // anggota, jadi DTO harus sepakat.
    const detail = await FoundationDecisionService.detail(
      { id: 'user-9', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(detail.canVote).toBe(false);
    expect(detail.members.some((m) => m.userId === 'user-9')).toBe(false);
  });

  it('pihak luar tanpa hubungan → detail ditolak', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    await expect(
      FoundationDecisionService.detail({ id: 'guru-9', roleCode: 'GURU' }, 'dec-1')
    ).rejects.toThrow(/tidak berhak/);
  });

  it('keputusan terminal (APPROVED) → canVote=false', async () => {
    const d = decisionRow({ status: 'APPROVED' });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    const detail = await FoundationDecisionService.detail(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1'
    );
    expect(detail.canVote).toBe(false);
  });
});

/**
 * Regresi INVESTIGATION D — status publikasi dapat diubah ketika keputusan
 * masih VOTING.
 *
 * `PUBLIC` hanya bermakna bagi keputusan APPROVED dengan artefak final lengkap;
 * selain itu peladen menolak, dan DTO menandai `publishable` sejalan.
 */
describe('FoundationDecisionService.setPublication (audit D)', () => {
  beforeEach(() => {
    dm.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    dm.foundationDecision.update = vi.fn().mockResolvedValue({ updatedAt: new Date() });
  });

  it('menolak PUBLIC untuk keputusan VOTING', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({
        status: 'VOTING',
        finalPdfDigest: 'd',
        finalPdfSealSignature: 's',
        esealId: 'e',
        document: { id: 'doc' },
      })
    );
    await expect(
      FoundationDecisionService.setPublication(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        'dec-1',
        'PUBLIC'
      )
    ).rejects.toThrow(/disahkan/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  it('menolak PUBLIC untuk keputusan REJECTED', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({
        status: 'REJECTED',
        finalPdfDigest: null,
        finalPdfSealSignature: null,
        esealId: null,
        document: null,
      })
    );
    await expect(
      FoundationDecisionService.setPublication(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        'dec-1',
        'PUBLIC'
      )
    ).rejects.toThrow(/disahkan/);
  });

  it('menolak PUBLIC bila artefak final belum lengkap walau APPROVED', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({
        status: 'APPROVED',
        finalPdfDigest: 'd',
        finalPdfSealSignature: null,
        esealId: null,
        document: null,
      })
    );
    await expect(
      FoundationDecisionService.setPublication(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        'dec-1',
        'PUBLIC'
      )
    ).rejects.toThrow(/disahkan/);
  });

  it('menerima PUBLIC untuk APPROVED dengan artefak lengkap', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({
        status: 'APPROVED',
        finalPdfDigest: 'd',
        finalPdfSealSignature: 's',
        esealId: 'e',
        document: { id: 'doc' },
      })
    );
    const res = await FoundationDecisionService.setPublication(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1',
      'PUBLIC'
    );
    expect(res.publication).toBe('PUBLIC');
    expect(dm.auditLog.create).toHaveBeenCalled();
  });

  it('PRIVATE selalu boleh, juga pada VOTING', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({ status: 'VOTING', publication: 'PUBLIC' })
    );
    const res = await FoundationDecisionService.setPublication(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1',
      'PRIVATE'
    );
    expect(res.publication).toBe('PRIVATE');
  });

  /**
   * Regresi audit C — audit memakai `oldValues` dari PEMBACAAN TERKUNCI.
   *
   * Versi lama membaca `d.publication` di luar transaksi. Dua request paralel
   * dapat mencatat nilai sebelumnya yang sama. Di sini pembacaan pra-lock
   * sengaja dibuat BASI (mengklaim `PUBLIC`) sedangkan pembacaan di dalam kunci
   * mengembalikan `PRIVATE`; audit harus memakai yang terkunci.
   */
  it('audit memakai publication hasil pembacaan TERKUNCI, bukan snapshot pra-lock', async () => {
    dm.foundationDecision.findUnique
      .mockResolvedValueOnce(
        decisionRow({
          status: 'APPROVED',
          publication: 'PUBLIC',
          finalPdfDigest: 'd',
          finalPdfSealSignature: 's',
          esealId: 'e',
          document: { id: 'doc' },
        })
      )
      .mockResolvedValueOnce(
        decisionRow({
          status: 'APPROVED',
          publication: 'PRIVATE',
          finalPdfDigest: 'd',
          finalPdfSealSignature: 's',
          esealId: 'e',
          document: { id: 'doc' },
        })
      );

    await FoundationDecisionService.setPublication(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1',
      'PUBLIC'
    );

    expect(dm.foundationDecision.update).toHaveBeenCalledTimes(1);
    const audit = dm.auditLog.create.mock.calls[0][0].data;
    expect(audit.oldValues).toEqual({ publication: 'PRIVATE' });
    expect(audit.newValues).toEqual({ publication: 'PUBLIC' });
  });

  /**
   * No-op semantics (audit C): publikasi yang TIDAK berubah tidak menulis
   * audit. Baris audit `oldValues === newValues` mengisi jejak dengan
   * perubahan yang tidak pernah terjadi.
   */
  it('tidak menulis audit bila publication tidak berubah (no-op)', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({ status: 'VOTING', publication: 'PRIVATE' })
    );
    const res = await FoundationDecisionService.setPublication(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1',
      'PRIVATE'
    );
    expect(res.publication).toBe('PRIVATE');
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });

  /**
   * Syarat PUBLIC divalidasi terhadap STATE TERKUNCI: baris yang berubah
   * (mis. e-seal dicabut) antara baca pra-lock dan baca terkunci ditolak, dan
   * tidak ada audit yang ditulis.
   */
  it('menolak bila artefak hilang pada pembacaan terkunci (race finalisasi/e-seal)', async () => {
    dm.foundationDecision.findUnique
      .mockResolvedValueOnce(
        decisionRow({
          status: 'APPROVED',
          finalPdfDigest: 'd',
          finalPdfSealSignature: 's',
          esealId: 'e',
          document: { id: 'doc' },
        })
      )
      .mockResolvedValueOnce(
        decisionRow({
          status: 'APPROVED',
          finalPdfDigest: null,
          finalPdfSealSignature: null,
          esealId: null,
        })
      );
    await expect(
      FoundationDecisionService.setPublication(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        'dec-1',
        'PUBLIC'
      )
    ).rejects.toThrow(/disahkan/);
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });

  it('publishable pada DTO detail sejalan dengan policy setPublication', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({
        status: 'APPROVED',
        finalPdfDigest: 'd',
        finalPdfSealSignature: 's',
        esealId: 'e',
        document: { id: 'doc' },
      })
    );
    const detail = await FoundationDecisionService.detail(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1'
    );
    expect(detail.publishable).toBe(true);
  });

  it('publishable=false saat VOTING', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    const detail = await FoundationDecisionService.detail(
      { id: 'super', roleCode: 'SUPER_ADMIN' },
      'dec-1'
    );
    expect(detail.publishable).toBe(false);
  });
});

/**
 * Regresi BUG (audit B) — form pembuatan menawarkan organ yang tidak dapat
 * dibuat pengguna. `createOptions` menghitung daftar dari kebijakan yang sama
 * dengan gerbang create.
 */
describe('FoundationDecisionService.createOptions (audit B)', () => {
  it('Pengawas mendapat PENGAWAS & GABUNGAN, bukan PEMBINA/PENGURUS', async () => {
    const opts = await FoundationDecisionService.createOptions({
      id: 'p',
      roleCode: 'YAYASAN_PENGAWAS',
    });
    expect(opts.allowedOrgans.map((o) => o.organType).sort()).toEqual(['GABUNGAN', 'PENGAWAS']);
    const pengawas = opts.allowedOrgans.find((o) => o.organType === 'PENGAWAS');
    expect(pengawas!.decisionTypes).toEqual(['pemberhentian-sementara-pengurus']);
  });

  it('Super Admin mendapat semua organ beserta jenis yang berwenang', async () => {
    const opts = await FoundationDecisionService.createOptions({
      id: 's',
      roleCode: 'SUPER_ADMIN',
    });
    expect(opts.allowedOrgans.map((o) => o.organType).sort()).toEqual([
      'GABUNGAN',
      'PEMBINA',
      'PENGAWAS',
      'PENGURUS',
    ]);
    const pengawas = opts.allowedOrgans.find((o) => o.organType === 'PENGAWAS');
    expect(pengawas!.decisionTypes).toEqual(['pemberhentian-sementara-pengurus']);
    const gabungan = opts.allowedOrgans.find((o) => o.organType === 'GABUNGAN');
    expect(gabungan!.decisionTypes).toEqual(['pemilihan-pembina']);
  });

  it('kombinasi organ×decisionType yang dikirim selalu berwenang', async () => {
    const opts = await FoundationDecisionService.createOptions({
      id: 's',
      roleCode: 'SUPER_ADMIN',
    });
    const { organMayDecide } = await import('@/utils/foundation-authority');
    for (const { organType, decisionTypes } of opts.allowedOrgans) {
      for (const t of decisionTypes) {
        expect(organMayDecide(organType, t, 'SUPER_ADMIN', { allowSuperAdmin: true })).toBe(true);
      }
    }
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

  /**
   * Regresi BUG — Pengawas tidak dapat memulai keputusan yang menjadi
   * kewenangannya.
   *
   * `YAYASAN_PENGAWAS` tidak ada di daftar rute WRITE, padahal matriks
   * kewenangan menetapkan `pemberhentian-sementara-pengurus` kepadanya. Organ
   * yang berwenang tetapi tak dapat membuka rapatnya sendiri adalah kontradiksi.
   */
  it('mengizinkan Pengawas membuat keputusan kewenangannya sendiri', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue([
      {
        id: 'asg-pengawas',
        userId: 'user-9',
        isPrimary: true,
        user: { id: 'user-9', name: 'Pengawas Satu' },
        role: { code: 'YAYASAN_PENGAWAS' },
      },
    ]);
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-pengawas' });

    const id = await FoundationDecisionService.create(
      { id: 'user-9', roleCode: 'YAYASAN_PENGAWAS' },
      {
        organType: 'PENGAWAS',
        kind: 'MEETING',
        subject: 'Pemberhentian sementara',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'pemberhentian-sementara-pengurus',
      }
    );

    expect(id).toBe('dec-pengawas');
    expect(dm.foundationDecision.create).toHaveBeenCalledTimes(1);
  });

  it('tetap menolak Pengawas membuat keputusan organ LAIN', async () => {
    await expect(
      FoundationDecisionService.create(
        { id: 'user-9', roleCode: 'YAYASAN_PENGAWAS' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Perubahan AD',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'perubahan-anggaran-dasar',
        }
      )
    ).rejects.toThrow(/tidak berwenang/);
  });

  /**
   * Regresi finding 1 (BUG severe) — keputusan dengan aksara yang tidak dapat
   * dicetak DITOLAK sebelum voting dibuka.
   *
   * Dulu pemeriksaan glyph hanya berjalan saat approval. Bila naskah memuat
   * emoji, `prepareApprovalArtifact` gagal setelah suara penentu tercatat; naskah
   * tidak dapat diedit dan `cancel` menolaknya, sehingga keputusan tergantung
   * `VOTING` selamanya. Gerbang di `create` memakai jalur ketercetakan yang sama
   * dan mengembalikan 400 yang menyebut field — tidak ada keputusan dibuat.
   */
  it('menolak naskah beraksara tak-tercetak SEBELUM voting dibuka', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(2));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);

    await expect(
      FoundationDecisionService.create(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Pengesahan 🎉 rencana kerja',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      )
    ).rejects.toThrow(/tidak dapat dicetak|subjekt|subject/i);

    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
  });

  it('menolak nama anggota yang tidak dapat dicetak ke risalah', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue([
      {
        id: 'asg-1',
        userId: 'user-1',
        isPrimary: true,
        user: { id: 'user-1', name: 'Nama 🎉 Anggota' },
        role: { code: 'YAYASAN_PEMBINA' },
      },
    ]);
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);

    await expect(
      FoundationDecisionService.create(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Pengesahan rencana kerja',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      )
    ).rejects.toThrow(/tidak dapat dicetak/i);

    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
  });

  /**
   * Regresi SECURITY CRITICAL — Super Admin tetap terikat matriks kewenangan
   * organ.
   *
   * `organMayDecide` dulu mengembalikan `true` untuk Super Admin SEBELUM
   * memeriksa jenis keputusan, sehingga Super Admin dapat membuka keputusan
   * milik Pembina sambil memilih organ PENGURUS/PENGAWAS/GABUNGAN. Organ yang
   * salah itu menjadi snapshot pemilih, memenuhi kuorum, dan memperoleh PDF +
   * e-seal Yayasan yang sah. Uji ini membuktikan tidak ada satu pun langkah
   * berikutnya yang berjalan: tidak ada snapshot anggota, tidak ada keputusan
   * (sehingga tidak ada voting dan tidak ada e-seal).
   */
  it('Super Admin DITOLAK bila organ tidak cocok dengan jenis keputusan', async () => {
    await expect(
      FoundationDecisionService.create(
        { id: 'admin-1', roleCode: 'SUPER_ADMIN' },
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
    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
    expect(dm.foundationEseal.create).not.toHaveBeenCalled();
    expect(dm.foundationDecisionDocument.create).not.toHaveBeenCalled();
  });

  /**
   * Sisi positifnya: Super Admin BOLEH memulai workflow yang organ dan
   * jenisnya memang cocok. Tanpa uji ini, memperketat matriks dapat diam-diam
   * menutup satu-satunya jalur admin sistem.
   */
  it('Super Admin DIIZINKAN memulai workflow yang organ dan jenisnya cocok', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(2));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-admin' });

    const id = await FoundationDecisionService.create(
      { id: 'admin-1', roleCode: 'SUPER_ADMIN' },
      {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        subject: 'Pengesahan rencana kerja',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'pengesahan-rencana-kerja',
      }
    );

    expect(id).toBe('dec-admin');
    expect(dm.foundationDecision.create).toHaveBeenCalledTimes(1);
  });

  /**
   * Pengguna organ biasa tetap tunduk pada keanggotaan DAN matriks kewenangan:
   * anggota Pengurus tidak dapat memutus hal milik Pembina walau roleCode-nya
   * sah sebagai anggota sebuah organ.
   */
  it('anggota organ biasa tetap tunduk pada keanggotaan + matriks kewenangan', async () => {
    await expect(
      FoundationDecisionService.create(
        { id: 'user-1', roleCode: 'YAYASAN_KETUA' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Pengesahan anggaran',
          body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
          decisionType: 'pengesahan-anggaran',
        }
      )
    ).rejects.toThrow(/tidak berwenang/);

    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
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
  /**
   * Regresi BUG — satu orang dengan DUA peran pada organ yang sama dulu
   * disusutkan lewat `distinct: ['userId']` tanpa urutan yang dijanjikan.
   * Snapshot bisa menyimpan jabatan yang salah (dan berubah antar-render),
   * sehingga PDF ber-e-seal mencetak jabatan yang bukan kebijakan organ.
   * Sekarang `selectSnapshotAssignments` memilih deterministik: primary menang,
   * lalu senioritas jabatan.
   */
  it('satu orang dengan dua peran organ menghasilkan SATU anggota berjabatan deterministik', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue([
      {
        id: 'asg-bendahara',
        userId: 'user-1',
        isPrimary: false,
        user: { id: 'user-1', name: 'Rangkap Dua' },
        role: { code: 'YAYASAN_BENDAHARA' },
      },
      {
        id: 'asg-ketua',
        userId: 'user-1',
        isPrimary: false,
        user: { id: 'user-1', name: 'Rangkap Dua' },
        role: { code: 'YAYASAN_KETUA' },
      },
    ]);
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await FoundationDecisionService.create(
      { id: 'user-0', roleCode: 'YAYASAN_KETUA' },
      {
        organType: 'PENGURUS',
        kind: 'MEETING',
        subject: 'Subjek Keputusan',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'keputusan-operasional',
      }
    );

    const data = dm.foundationDecision.create.mock.calls[0][0].data;
    expect(data.members.create).toHaveLength(1);
    expect(data.members.create[0].userId).toBe('user-1');
    expect(data.members.create[0].roleCode).toBe('YAYASAN_KETUA');
    // activeCount menghitung ORANG unik, bukan jumlah penugasan.
    expect(data.quorumSnapshot.activeCount).toBe(1);
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

  /**
   * Regresi: rotasi passphrase DENGAN indeks unik seal-aktif ditegakkan.
   *
   * Uji di atas membiarkan `create` seal baru berhasil. Di PostgreSQL nyata,
   * indeks unik parsial `foundation_eseals_single_active_key` menolak insert
   * itu selama seal LAMA masih `revoked_at IS NULL` — dan seal lama memang
   * masih aktif, hanya saja tak dapat ditandatangani. Sebelum perbaikan,
   * `ensureSeal` hanya melewatinya lalu mencoba membuat seal kedua, ditolak
   * P2002, membaca ulang "pemenang" yang ternyata seal lama yang tak dapat
   * dipakai, dan mengembalikannya — sehingga `signSeal` melempar di dalam
   * transaksi approval dan SETIAP approval baru gagal 500 setelah rotasi.
   * Perbaikan: seal yang tak dapat dipakai DICABUT lebih dulu.
   */
  it('mencabut seal lama yang tak dapat dipakai sebelum menerbitkan seal baru (rotasi + indeks unik)', async () => {
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
    // Indeks unik parsial menolak selama seal lama masih aktif.
    const uniqueViolation = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    dm.foundationEseal.create.mockRejectedValueOnce(uniqueViolation).mockResolvedValue({
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

    expect(result.outcome).toBe('APPROVED');
    // Seal lama DICABUT, bukan dibiarkan aktif lalu dilewati.
    expect(dm.foundationEseal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.objectContaining({ in: ['seal-lama'] }) }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
    // Dan keputusannya mereferensikan seal BARU yang dapat ditandatangani.
    expect(dm.foundationDecision.update.mock.calls[0][0].data.esealId).toBe('seal-baru');
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
      ...decisionRow({ status: 'APPROVED', publication: 'PUBLIC' }),
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
      ...decisionRow({ status: 'APPROVED', publication: 'PUBLIC' }),
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

  /**
   * Regresi audit #10 — rekap PUBLIK hanya menghitung suara autentik.
   *
   * `verifyDecisionCore` dulu menghitung semua baris `foundation_decision_votes`
   * apa adanya, berbeda dari finalisasi yang menyaring suara lewat verifikasi
   * tanda tangan. Baris suara palsu yang disisipkan langsung ke basis data
   * karenanya mengubah angka yang dilihat pengunjung halaman verifikasi —
   * meskipun suara itu tidak pernah masuk ke PDF tersegel. Angka publik harus
   * berasal dari himpunan suara yang SAMA dengan yang menentukan kuorum.
   */
  it('rekap publik hanya menghitung suara autentik, bukan baris palsu', async () => {
    const d = decisionRow({ status: 'APPROVED', publication: 'PUBLIC' });
    const authentic0 = signedVoteRow(d, 'user-0', 'APPROVE');
    const authentic1 = signedVoteRow(d, 'user-1', 'APPROVE');
    // Baris palsu: pilihan APPROVE, tetapi tidak menunjuk rekaman kunci
    // tepercaya mana pun (relasi `signingKey` null).
    const forged = {
      ...signedVoteRow(d, 'user-2', 'APPROVE'),
      signature: 'sig-karangan',
      publicKey: 'pk-karangan',
      signingKeyId: null,
      publicKeyFingerprint: null,
      signingKey: null,
    };
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...d,
      finalPdfDigest: null,
      finalPdfSealSignature: null,
      esealId: null,
      document: null,
      votes: [authentic0, authentic1, forged],
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res.voteCount).toBe(2);
    expect(res.approveCount).toBe(2);
  });

  /**
   * Regresi SECURITY — verifikasi publik membocorkan metadata tata kelola.
   *
   * `verifyDecisionCore` dulu mengembalikan subject/organ/tanggal/rekap suara
   * ke endpoint anonim tanpa syarat. Keputusan yayasan dapat menyangkut
   * personalia ("Pemberhentian Sementara Pengurus X") atau operasi internal,
   * dan tautan maupun PDF-nya dapat sampai ke pihak luar tanpa persetujuan
   * publikasi. Klasifikasi `publication` bawaannya PRIVATE: metadata disensor
   * sampai seseorang (Super Admin) sengaja menerbitkannya — sedangkan bukti
   * keabsahan tetap dapat diperiksa.
   *
   * `decisionRow` memakai klasifikasi bawaan (PRIVATE) bila tidak disebut.
   */
  it('menyensor metadata keputusan PRIVATE, tetapi keabsahan tetap diperiksa', async () => {
    const d = decisionRow({ status: 'APPROVED', finalPdfDigest: 'digest-abc' });
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...d,
      finalPdfSealSignature: 'sig-abc',
      esealId: 'seal-1',
      document: null,
      votes: [signedVoteRow(d, 'user-0', 'APPROVE')],
    });
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: 'pk',
      algorithm: 'Ed25519',
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    // Metadata tata kelola TIDAK bocor.
    expect(res.subject).toBeNull();
    expect(res.organType).toBeNull();
    expect(res.kind).toBeNull();
    expect(res.status).toBeNull();
    expect(res.decidedAt).toBeNull();
    expect(res.voteCount).toBe(0);
    expect(res.approveCount).toBe(0);
    // F5: penunjuk internal (decisionId + digest) juga disensor untuk PRIVATE.
    expect(res.decisionId).toBeNull();
    expect(res.digest).toBeNull();
    expect(res.archiveDigest).toBeNull();
    // Keabsahan tetap dapat diperiksa tanpa penunjuk internal.
    expect(res.digestOk).toBeNull(); // jalur token tanpa byte pembanding
    expect(res.publication).toBe('PRIVATE');
    expect(res.sealVerified).not.toBeNull();
  });

  /**
   * F5 (SECURITY) — keputusan PRIVATE tidak boleh membocorkan `decisionId` atau
   * digest lewat endpoint verifikasi anonim.
   *
   * `decisionId` dan `digest` adalah penunjuk yang dapat dipakai mengorelasikan
   * token/dokumen dengan entitas internal (mis. menyambungkannya ke berkas lain
   * atau ke daftar internal). Yang diperlukan pemindai hanyalah putusan
   * keabsahan; ia tidak perlu — dan tidak boleh — mengetahui identitas internal
   * keputusan yang belum diterbitkan.
   */
  it('menyensor decisionId & digest untuk PRIVATE (F5)', async () => {
    const d = decisionRow({ status: 'APPROVED', publication: 'PRIVATE' });
    const bytes = Buffer.from('%PDF-1.7 rahasia');
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...d,
      finalPdfDigest: sha256bytes(bytes),
      finalPdfSealSignature: 'sig-abc',
      esealId: 'seal-1',
      document: { bytes: new Uint8Array(bytes) },
      votes: [signedVoteRow(d, 'user-0', 'APPROVE')],
    });
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: 'pk',
      algorithm: 'Ed25519',
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res.found).toBe(true);
    expect(res.publication).toBe('PRIVATE');
    // Tidak ada penunjuk internal sama sekali.
    expect(res.decisionId).toBeNull();
    expect(res.digest).toBeNull();
    expect(res.archiveDigest).toBeNull();
    // Putusan keabsahan tetap ada.
    expect(res.digestOk).toBe(true);
    expect(res.sealVerified).not.toBeNull();
  });

  it('menampilkan metadata HANYA untuk keputusan yang diterbitkan (PUBLIC)', async () => {
    const d = decisionRow({ status: 'APPROVED', publication: 'PUBLIC' });
    dm.foundationDecision.findUnique.mockResolvedValue({
      ...d,
      document: null,
      votes: [signedVoteRow(d, 'user-0', 'APPROVE')],
    });

    const res = await FoundationDecisionService.verifyByToken('tok-1');
    expect(res.subject).toBe('Pengesahan Rencana Kerja');
    expect(res.organType).toBe('PEMBINA');
    expect(res.publication).toBe('PUBLIC');
    expect(res.voteCount).toBe(1);
    // PUBLIC: penunjuk internal BOLEH keluar.
    expect(res.decisionId).toBe('dec-1');
  });
});

describe('FoundationDecisionService.getFinalDocument', () => {
  const reader = { id: 'u-reader', roleCode: 'YAYASAN_KETUA' };
  // Arsip dengan digest yang benar-benar cocok, seperti baris nyata: kolom
  // `sha256` arsip dan `finalPdfDigest` keputusan sama-sama disetel ke hash
  // byte tersebut. Finding A3 menambahkan pemeriksaan integritas ini, jadi
  // setiap baris uji harus konsisten atau ia sengaja mewakili arsip rusak.
  const ARCHIVE = Buffer.from('%PDF');
  const ARCHIVE_DIGEST = sha256bytes(ARCHIVE);
  const archiveDoc = () => ({
    id: 'doc-1',
    bytes: new Uint8Array(ARCHIVE),
    sha256: ARCHIVE_DIGEST,
    decision: {
      status: 'APPROVED',
      finalPdfDigest: ARCHIVE_DIGEST,
      members: [{ userId: reader.id }],
    },
  });

  it('mengembalikan dokumen untuk keputusan APPROVED', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue(archiveDoc());
    const doc = await FoundationDecisionService.getFinalDocument(reader, 'dec-1');
    expect(doc.id).toBe('doc-1');
  });

  /**
   * Regresi (item review #3): anggota snapshot yang rolenya sudah berubah tetap
   * boleh mengunduh dokumen yang masih berhak ia tanda tangani. Akses bacanya
   * tidak boleh lagi bergantung pada peran HARI INI.
   */
  it('mengizinkan anggota snapshot yang rolenya di luar READ untuk mengunduh', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      ...archiveDoc(),
      decision: {
        status: 'APPROVED',
        finalPdfDigest: ARCHIVE_DIGEST,
        members: [{ userId: 'u-alumni' }],
      },
    });
    const doc = await FoundationDecisionService.getFinalDocument(
      { id: 'u-alumni', roleCode: 'GURU' },
      'dec-1'
    );
    expect(doc.id).toBe('doc-1');
  });

  it('menolak pihak luar tanpa hubungan dari mengunduh dokumen', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      ...archiveDoc(),
      decision: {
        status: 'APPROVED',
        finalPdfDigest: ARCHIVE_DIGEST,
        members: [{ userId: 'u-member' }],
      },
    });
    await expect(
      FoundationDecisionService.getFinalDocument({ id: 'u-outsider', roleCode: 'GURU' }, 'dec-1')
    ).rejects.toThrow(/tidak berhak/);
  });

  /**
   * Finding A3 — byte arsip yang tidak cocok dengan digest yang ditandatangani
   * TIDAK boleh terunduh sebagai PDF resmi.
   *
   * Skenario nyata: arsip tersimpan diubah di luar aplikasi (korupsi, atau
   * penulisan langsung ke basis data). Versi sebelumnya mengembalikan
   * `doc.bytes` apa adanya, sehingga pengunduh menerima berkas "resmi" yang
   * justru ditolak oleh verifikasi unggahan. Gagal sebelum perbaikan (dokumen
   * kembali tanpa galat), lulus sesudah (409), dan BUKAN 404 — dokumennya ada,
   * integritasnya yang gagal.
   */
  it('menolak arsip yang byte-nya tidak cocok dengan finalPdfDigest (regresi A3)', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      ...archiveDoc(),
      // Byte arsip diubah, tetapi digest tersimpan masih milik byte asli.
      bytes: new Uint8Array(Buffer.from('%PDF-putra-tampered')),
    });
    await expect(FoundationDecisionService.getFinalDocument(reader, 'dec-1')).rejects.toMatchObject(
      { code: 'CONFLICT' }
    );
  });

  it('menolak arsip yang kolom sha256-nya menyimpang dari finalPdfDigest (regresi A3)', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      ...archiveDoc(),
      sha256: 'f'.repeat(64),
    });
    await expect(FoundationDecisionService.getFinalDocument(reader, 'dec-1')).rejects.toMatchObject(
      { code: 'CONFLICT' }
    );
  });

  it('menolak unduhan ketika keputusan tidak menyimpan finalPdfDigest (regresi A3)', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      ...archiveDoc(),
      decision: { status: 'APPROVED', finalPdfDigest: null, members: [{ userId: reader.id }] },
    });
    await expect(FoundationDecisionService.getFinalDocument(reader, 'dec-1')).rejects.toMatchObject(
      { code: 'CONFLICT' }
    );
  });

  it('melempar 404 bila dokumen belum final', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      sha256: ARCHIVE_DIGEST,
      decision: { status: 'VOTING', finalPdfDigest: ARCHIVE_DIGEST, members: [] },
    });
    await expect(FoundationDecisionService.getFinalDocument(reader, 'dec-1')).rejects.toThrow(
      /belum final/
    );
  });

  it('melempar 404 bila dokumen tidak ada', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue(null);
    await expect(FoundationDecisionService.getFinalDocument(reader, 'dec-1')).rejects.toThrow(
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

  /**
   * Finding 5 — berkas yang DIUBAH berakhir di cabang `!d` yang SAMA dengan
   * berkas asing, sebab digest-nya berbeda. Pesan `reason` karena itu tidak
   * boleh memastikan dokumen "tidak terdaftar": itu menyesatkan pemegang
   * salinan sah yang termodifikasi sekaligus membocorkan keberadaan keputusan
   * privat lewat selisih kata. Ia harus menyebut KEDUA kemungkinan netral.
   */
  it('pesan found:false menyebut "tidak terdaftar ATAU diubah", tanpa klaim sepihak (finding 5)', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(null);
    dm.foundationDecision.findFirst.mockResolvedValue(null);

    const altered = Buffer.from('%PDF-1.7 berkas sah yang diubah satu byte');
    const res = await FoundationDecisionService.verifyByPdfBuffer(altered);

    expect(res.found).toBe(false);
    expect(res.reason).toMatch(/tidak cocok dengan arsip ber-e-seal/i);
    expect(res.reason).toMatch(/tidak terdaftar ATAU telah diubah/i);
    // Tidak boleh lagi hanya menyatakan "tidak terdaftar".
    expect(res.reason).not.toMatch(/tidak terdaftar sebagai risalah\/keputusan resmi/i);
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

  /**
   * Regresi SECURITY CRITICAL (jalur unggahan) — verifikasi anonim tidak boleh
   * membocorkan metadata tata kelola.
   *
   * Klasifikasi `publication` harus mengalir sampai ke INTI verifikasi di jalur
   * ini juga, bukan hanya jalur token. Bila tidak, dua jalur publik dapat
   * menyimpang: satu menyensor dan satu tidak. Yang diuji di sini adalah
   * PERILAKU: keputusan PRIVATE tetap menjawab "sah" tanpa subject/status/tally.
   */
  it('menyensor metadata keputusan PRIVATE pada jalur unggahan, keabsahan tetap', async () => {
    const bytes = Buffer.from('%PDF-1.7 dokumen privat yang tetap sah');
    const digest = sha256bytes(bytes);
    const signature = signSeal(sealMaterialRow, config.foundation.esealPassphrase, digest);
    // `approvedRow` mewarisi publication bawaan PRIVATE dari `decisionRow`.
    const row = { ...approvedRow(digest, signature), publication: 'PRIVATE' };
    dm.foundationDecision.findUnique.mockResolvedValue(row);
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: sealMaterialRow.publicKey,
    });

    const res = await FoundationDecisionService.verifyByPdfBuffer(bytes);
    expect(res.found).toBe(true);
    expect(res.isValid).toBe(true);
    expect(res.publication).toBe('PRIVATE');
    expect(res.subject).toBeNull();
    expect(res.status).toBeNull();
    expect(res.voteCount).toBe(0);
  });

  it('menampilkan metadata keputusan PUBLIC pada jalur unggahan', async () => {
    const bytes = Buffer.from('%PDF-1.7 dokumen terbit untuk publik');
    const digest = sha256bytes(bytes);
    const signature = signSeal(sealMaterialRow, config.foundation.esealPassphrase, digest);
    const row = { ...approvedRow(digest, signature), publication: 'PUBLIC' };
    dm.foundationDecision.findUnique.mockResolvedValue(row);
    dm.foundationEseal.findUnique.mockResolvedValue({
      id: 'seal-1',
      publicKey: sealMaterialRow.publicKey,
    });

    const res = await FoundationDecisionService.verifyByPdfBuffer(bytes);
    expect(res.publication).toBe('PUBLIC');
    expect(res.subject).toBe('Pengesahan Rencana Kerja');
    expect(res.status).toBe('APPROVED');
  });
});

/**
 * Regresi item review #1 — suara palsu/termodifikasi tidak boleh dihitung.
 *
 * `votesOf` dulu hanya memetakan `choice`, tanpa memverifikasi ulang digest dan
 * tanda tangan tiap suara. Baris `foundation_decision_votes` yang diubah
 * langsung di basis data (pilihan diganti, atau baris disisipkan) tetap ikut
 * evaluasi kuorum dan menerima e-seal Yayasan yang sah. Saringan baru membuang
 * suara yang `canonicalDigest`/`signature`-nya tidak cocok.
 */
describe('FoundationDecisionService.votesOf — verifikasi ulang suara', () => {
  it('membuang suara dengan pilihan yang tidak cocok dengan digest tertanda tangan', () => {
    const d = decisionRow();
    const authentic = signedVoteRow(d, 'user-1', 'APPROVE');
    // Admin basis data mengganti pilihan menjadi APPROVE tanpa memalsukan
    // tanda tangan: digest masih milik suara REJECT, jadi tak boleh dihitung.
    const tampered = { ...signedVoteRow(d, 'user-2', 'REJECT'), choice: 'APPROVE' };

    const counted = FoundationDecisionService.votesOf({
      ...d,
      votes: [authentic, tampered],
    } as never);
    expect(counted).toEqual([{ choice: 'APPROVE' }]);
  });

  it('membuang baris suara yang disisipkan tanpa tanda tangan yang sah', () => {
    const d = decisionRow();
    const forged = {
      ...signedVoteRow(d, 'user-2', 'APPROVE'),
      signature: Buffer.from('bukan tanda tangan asli').toString('base64'),
    };
    const counted = FoundationDecisionService.votesOf({ ...d, votes: [forged] } as never);
    expect(counted).toEqual([]);
  });

  it('membuang suara dari userId yang bukan anggota snapshot', () => {
    const d = decisionRow();
    const outsider = signedVoteRow(d, 'user-9', 'APPROVE');
    const counted = FoundationDecisionService.votesOf({ ...d, votes: [outsider] } as never);
    expect(counted).toEqual([]);
  });

  it('keputusan TIDAK APPROVED saat satu-satunya suara setuju telah diubah', async () => {
    const d = decisionRow({
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 1,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    // Satu suara palsu (pilihan diganti) — satu-satunya baris di basis data.
    dm.foundationDecisionVote.findMany.mockResolvedValue([
      { ...signedVoteRow(d, 'user-1', 'REJECT'), choice: 'APPROVE' },
    ]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findMany.mockResolvedValue([]);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'REJECT', note: 'alasan yang cukup', passphrase: PASS }
    );

    // Ringkasan hanya memuat suara yang sah, dan e-seal tidak dibubuhkan.
    expect(result.outcome.outcome).not.toBe('APPROVED');
    expect(dm.foundationDecisionDocument.create).not.toHaveBeenCalled();
    expect(result.voteSummary.approve).toBe(0);
  });

  it('PDF final tidak mencetak baris suara palsu, walau kuorum tetap tuntas', async () => {
    // `renderPdf` langsung diuji: baris PALSU (pilihan diganti tanpa
    // tanda tangan ulang) tidak boleh ikut dicetak ke risalah yang di-e-seal.
    const d = decisionRow();
    const authentic = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'APPROVE'),
    ];
    const tampered = { ...signedVoteRow(d, 'user-2', 'REJECT'), choice: 'APPROVE' };
    const spy = vi.spyOn(pdfModule, 'generateDecisionPdf');

    await FoundationDecisionService.renderPdf({
      ...d,
      votes: [...authentic, tampered],
    } as never);

    const printed = spy.mock.calls[0][0].votes;
    expect(printed.map((v) => `${v.userId}:${v.choice}`)).toEqual([
      'user-0:APPROVE',
      'user-1:APPROVE',
    ]);
    // Bukti bahwa barisnya benar-benar sampai ke PDF, bukan hilang karena hal
    // lain: anggota ketiga tetap ada di daftar anggota.
    expect(spy.mock.calls[0][0].members.map((m) => m.userId)).toContain('user-2');
  });

  /**
   * Regresi audit #4 — identitas pemilih berasal dari SNAPSHOT, bukan profil
   * hidup.
   *
   * `renderPdf` dulu memakai `v.user.name`. Mengganti nama profil setelah
   * keputusan dibuat karena itu mengubah nama yang dicetak pada risalah yang
   * sudah di-e-seal, sehingga identitas di PDF bertentangan dengan roster
   * anggota yang justru dijanjikan immutable.
   */
  it('PDF memakai nama SNAPSHOT walau profil pengguna sudah diganti nama', async () => {
    const d = decisionRow({
      members: [
        {
          id: 'm0',
          userId: 'user-0',
          name: 'Nama Saat Keputusan',
          roleCode: 'YAYASAN_PEMBINA',
          user: { id: 'user-0', name: 'Nama Sudah Diganti' },
        },
      ],
    });
    const vote = signedVoteRow(d, 'user-0', 'APPROVE');
    // Relasi `user` membawa nama profil LIVE yang sudah berubah.
    vote.user = { id: 'user-0', name: 'Nama Sudah Diganti' };
    const spy = vi.spyOn(pdfModule, 'generateDecisionPdf');

    await FoundationDecisionService.renderPdf({ ...d, votes: [vote] } as never);

    const printed = spy.mock.calls[0][0].votes;
    expect(printed).toHaveLength(1);
    expect(printed[0].name).toBe('Nama Saat Keputusan');
    expect(printed[0].name).not.toBe('Nama Sudah Diganti');
  });
});

/**
 * Regresi item review #4 — audit `create` di dalam transaksi.
 *
 * Dulu keputusan di-commit lebih dulu, lalu `auditLog.create` dipanggil di
 * luar transaksi. Bila auditnya gagal, keputusan sudah ada tetapi request
 * melempar galat — dan retry membuat keputusan DUPLIKAT (token verifikasinya
 * acak, tidak ada unique yang mencegahnya).
 */
/**
 * Regresi BUG — concurrent role changes corrupt member snapshot.
 *
 * `create` membaca penugasan calon anggota SEBELUM transaksi. Bila peran
 * ditambah/dicabut/diubah setelah pembacaan itu tetapi sebelum komit, snapshot
 * immutable dapat membekukan himpunan anggota yang tidak sah — atau, untuk
 * pengangkatan baru, menghilangkan anggota yang sah dari kuorum — dan orang itu
 * memperoleh (atau kehilangan) hak suara pada keputusan yang ditandatangani
 * e-seal.
 *
 * Perbaikannya: di dalam transaksi, SELURUH himpunan penugasan aktif organ
 * dibaca ULANG di bawah kunci tabel `SHARE ROW EXCLUSIVE` (yang berbenturan
 * dengan `ROW EXCLUSIVE` milik setiap INSERT/UPDATE/DELETE, termasuk baris
 * baru); hasil susutannya dibandingkan dengan snapshot pra-transaksi, dan
 * perbedaan membatalkan seluruh operasi secara atomik dengan conflict.
 *
 * Test ini GAGAL pada implementasi lama: `userRoleAssignment.findMany` hanya
 * dipanggil sekali (pra-transaksi), `$queryRaw` tidak pernah dipakai, snapshot
 * basi ditulis, dan tidak ada conflict.
 */
describe('FoundationDecisionService.create — snapshot vs perubahan peran konkuren', () => {
  const input = {
    organType: 'PEMBINA' as const,
    kind: 'CIRCULAR' as const,
    subject: 'Subjek Keputusan',
    body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
    decisionType: 'pengesahan-rencana-kerja' as const,
  };
  const actor = { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' };

  it('memvalidasi ulang snapshot DI DALAM transaksi (baca ulang di bawah kunci tabel)', async () => {
    dm.userRoleAssignment.findMany
      .mockResolvedValueOnce(memberAssignments(3)) // pra-transaksi
      .mockResolvedValueOnce(memberAssignments(3)); // pasca-lock, tidak berubah
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await FoundationDecisionService.create(actor, input);

    // Sumber assignment dibaca ULANG setelah dibaca pertama kali, di bawah
    // kunci tabel yang menyerialkan INSERT/UPDATE/DELETE penugasan. Yang
    // dihitung hanya pembacaan SNAPSHOT (tanpa filter `userId`); pembacaan
    // peran aktor F4 memakai `where.userId` dan bukan bagian dari klaim ini.
    const snapshotReads = dm.userRoleAssignment.findMany.mock.calls.filter(
      (c: any[]) => !c[0]?.where?.userId
    );
    expect(snapshotReads).toHaveLength(2);
    const lockSql = dm.$executeRaw.mock.calls
      .map((c: any[]) => (c[0] as string[]).join('?'))
      .join('|');
    expect(lockSql).toContain('SHARE ROW EXCLUSIVE MODE');
    expect(lockSql).toContain('user_role_assignments');
    // Kunci baris `users` anggota diambil lewat JOIN (bukan daftar id hasil
    // baca awal) supaya himpunan kunci stabil dan tidak ada jendela antara
    // pembacaan dan penguncian. Deaktivasi akun menyentuh `users` saja, jadi
    // kunci tabel penugasan tidak menahannya.
    const memberLockSql = dm.$queryRaw.mock.calls
      .map((c: any[]) => (c[0] as string[]).join('?'))
      .join('|');
    expect(memberLockSql).toContain('FOR SHARE');
    expect(memberLockSql).toContain('users');

    const data = dm.foundationDecision.create.mock.calls[0][0].data;
    expect(data.members.create.map((m: any) => m.userId)).toEqual(['user-0', 'user-1', 'user-2']);
  });

  /**
   * Regresi BUG SEVERE — pengangkatan konkuren hilang dari snapshot.
   *
   * Sebelum perbaikan, `create` hanya mengunci ID penugasan hasil pembacaan
   * awal (`FOR UPDATE`), sehingga penugasan BARU yang commit di sela pembacaan
   * dan komit tidak pernah terlihat: snapshot memuat lebih sedikit anggota
   * daripada yang sah, kuorum dihitung di atas angka itu, dan keputusan dapat
   * disahkan beserta e-seal. Sekarang baca ulang memakai predikat penuh di
   * bawah kunci tabel, sehingga anggota baru muncul dan memicu konflik.
   */
  it('membatalkan bila penugasan BARU muncul di baca ulang (anggota tak boleh hilang)', async () => {
    dm.userRoleAssignment.findMany
      .mockResolvedValueOnce(memberAssignments(2)) // pra-transaksi: 2 anggota
      .mockResolvedValueOnce(memberAssignments(3)); // pasca-lock: user-2 diangkat
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await expect(FoundationDecisionService.create(actor, input)).rejects.toThrow(
      /Keanggotaan organ .* berubah/
    );

    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });

  it('membatalkan atomik bila assignment dicabut antara query awal dan commit', async () => {
    dm.userRoleAssignment.findMany
      .mockResolvedValueOnce(memberAssignments(3)) // pra-transaksi: 3 anggota
      // pasca-lock: user-2 sudah dicabut (baris tidak lagi aktif).
      .mockResolvedValueOnce(memberAssignments(2));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await expect(FoundationDecisionService.create(actor, input)).rejects.toThrow(
      /Keanggotaan organ .* berubah/
    );

    // Tidak ada keputusan, tidak ada audit: pembatalan benar-benar atomik.
    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });

  it('snapshot TIDAK menyimpan anggota yang dicabut, dan ia tidak dapat memberi suara', async () => {
    // Setelah conflict, pemanggil mengulang dengan daftar yang sudah segar
    // (2 anggota). Snapshot akhir hanya boleh memuat anggota yang sah.
    dm.userRoleAssignment.findMany
      .mockResolvedValueOnce(memberAssignments(2))
      .mockResolvedValueOnce(memberAssignments(2));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await FoundationDecisionService.create(actor, input);

    const members = dm.foundationDecision.create.mock.calls[0][0].data.members.create;
    const userIds = members.map((m: any) => m.userId);
    expect(userIds).toEqual(['user-0', 'user-1']);
    expect(userIds).not.toContain('user-2');

    // Anggota yang dicabut juga TIDAK dapat memberi suara pada keputusan yang
    // tak memuatnya. Keanggotaan diperiksa terhadap snapshot, jadi ini mengikat
    // bahkan bila peran hari ini masih tampak seperti anggota organ.
    const snapshot = decisionRow({
      members: userIds.map((userId: string, i: number) => ({
        id: `m${i}`,
        userId,
        name: `Anggota ${i}`,
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: userId, name: `Anggota ${i}` },
      })),
    });
    dm.foundationDecision.findUnique.mockResolvedValue(snapshot);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-2', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/bukan anggota organ/);
    expect(dm.foundationDecisionVote.create).not.toHaveBeenCalled();
  });

  it('mengganti jabatan anggota yang berubah juga membatalkan operasi', async () => {
    // user-1 berubah dari YAYASAN_PEMBINA menjadi YAYASAN_KETUA antara kedua
    // pembacaan (masih organ yang sama, tetapi jabatan snapshot berbeda).
    const before = memberAssignments(2);
    const after = [
      before[0],
      { ...before[1], user: { id: 'user-1', name: 'Anggota 1' }, role: { code: 'YAYASAN_KETUA' } },
    ];
    dm.userRoleAssignment.findMany.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await expect(FoundationDecisionService.create(actor, input)).rejects.toThrow(
      /Keanggotaan organ .* berubah/
    );
    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('FoundationDecisionService.create — audit dalam transaksi', () => {
  it('audit gagal → create melempar tanpa meninggalkan keputusan ter-commit', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(3));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });
    dm.auditLog.create.mockRejectedValueOnce(new Error('audit down'));

    // Transaksi tiruan yang benar-benar rollback: efek `create` hanya dianggap
    // commit bila callback selesai tanpa melempar.
    let decisionCommitted = false;
    dm.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        ...prisma,
        foundationDecision: prisma.foundationDecision,
        auditLog: prisma.auditLog,
      };
      const result = await cb(tx);
      decisionCommitted = true;
      return result;
    });

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
    ).rejects.toThrow(/audit down/);

    // Audit dipanggil DI DALAM transaksi yang sama dengan pembuatan.
    expect(dm.auditLog.create).toHaveBeenCalledTimes(1);
    expect(decisionCommitted).toBe(false);
  });
});

/**
 * Regresi item review #3 — anggota snapshot tetap boleh MEMBACA.
 *
 * Rute detail dulu memakai `authorize(...READ)`, sehingga anggota snapshot
 * yang rolenya sudah berubah ditolak membaca keputusan yang masih berhak ia
 * tanda tangani (rute vote sengaja hanya `authenticate`).
 */
describe('FoundationDecisionService.detail — akses baca anggota snapshot', () => {
  it('mengizinkan anggota snapshot walau roleCode-nya di luar READ', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    const detail = await FoundationDecisionService.detail(
      { id: 'user-1', roleCode: 'GURU' },
      'dec-1'
    );
    expect(detail.id).toBe('dec-1');
  });

  it('menolak pihak luar tanpa hubungan', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(decisionRow());
    await expect(
      FoundationDecisionService.detail({ id: 'outsider', roleCode: 'GURU' }, 'dec-1')
    ).rejects.toThrow(/tidak berhak/);
  });
});

/**
 * Finding 7 (INVESTIGATION) — seluruh angka resmi memakai suara AUTENTIK.
 *
 * `votedCount`, `votes[]`, `hasVoted`/`canVote`, dan rekap pada DTO pernah
 * dihitung dari baris MENTAH, sehingga baris `foundation_decision_votes` yang
 * disisipkan atau diubah langsung di basis data membuat "3 dari 3" pada layar
 * bertentangan dengan angka yang benar-benar mengesahkan keputusan (kuorum,
 * PDF, verifikasi publik). Uji ini mengunci bahwa baris tidak sah tidak
 * muncul di angka resmi, dan hanya SUPER_ADMIN yang melihat diagnostiknya.
 */
describe('FoundationDecisionService.toDetailDTO — hanya suara autentik dihitung', () => {
  const snapshot = {
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    activeCount: 3,
    presentMode: 'MUTLAK',
    presentValue: 1,
    decisionMode: 'MUTLAK',
    decisionValue: 1,
  } as never;

  function dtoFor(d: any, myId: string, myRoleCodes: readonly string[]) {
    const authentic = FoundationDecisionService.authenticatedVotesOf(d);
    return FoundationDecisionService.toDetailDTO(
      d,
      snapshot,
      d.voteSummary,
      true,
      false,
      false,
      false,
      false,
      authentic.find((v) => v.userId === myId)?.choice ?? null,
      myId,
      myRoleCodes
    );
  }

  it('votedCount & votes[] hanya memuat suara bertanda tangan sah', () => {
    const d = decisionRow();
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      { ...signedVoteRow(d, 'user-1', 'REJECT'), choice: 'APPROVE' },
      {
        ...signedVoteRow(d, 'user-2', 'APPROVE'),
        signature: Buffer.from('palsu').toString('base64'),
      },
    ];
    const dto = dtoFor(d, 'outsider', ['YAYASAN_PEMBINA']);
    expect(dto.votedCount).toBe(1);
    expect(dto.votes.map((v) => v.userId)).toEqual(['user-0']);
  });

  it('hasVoted/canVote tidak menganggap suara tidak sah sebagai suara pemilih', () => {
    const d = decisionRow();
    // Baris mentah atas nama user-1, tanpa ikatan kunci → TIDAK autentik.
    d.votes = [
      {
        ...signedVoteRow(d, 'user-1', 'APPROVE'),
        signingKeyId: null,
        signingKey: null,
      },
    ];
    const dto = dtoFor(d, 'user-1', ['YAYASAN_PEMBINA']);
    expect(dto.votedCount).toBe(0);
    expect(dto.myVote).toBeNull();
  });

  it('invalidVoteCount hanya diisi untuk SUPER_ADMIN', () => {
    const d = decisionRow();
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      { ...signedVoteRow(d, 'user-1', 'REJECT'), choice: 'APPROVE' },
    ];
    const asMember = dtoFor(d, 'user-1', ['YAYASAN_PEMBINA']);
    expect(asMember.invalidVoteCount).toBeUndefined();
    const asSuper = dtoFor(d, 'super', ['SUPER_ADMIN']);
    expect(asSuper.invalidVoteCount).toBe(1);
    // Angka resmi TIDAK berubah karena diagnostik: tetap hanya suara autentik.
    expect(asSuper.votedCount).toBe(1);
  });
});

/**
 * Regresi item review #8 — render PDF + e-seal DI LUAR kunci baris.
 *
 * `castVote` dulu merender PDF, menandatangani e-seal, menulis dokumen, dan
 * meng-update status semuanya selagi `SELECT … FOR UPDATE` dipegang, sehingga
 * satu finalisasi menahan suara anggota lain selama scrypt berlangsung.
 * Sekarang artefak mahal disiapkan SEBELUM kunci diambil, dan di dalam kunci
 * hanya penulisan status yang tersisa.
 */
describe('FoundationDecisionService.castVote — kerja mahal di luar kunci', () => {
  it('merender PDF sebelum kunci baris diambil', async () => {
    const d = decisionRow({
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 1,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    const sealMaterialRow = createSealMaterial(config.foundation.esealPassphrase);
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-1', 'APPROVE')]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'APPROVED' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
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

    const order: string[] = [];
    // Catat kapan kunci baris benar-benar diambil.
    dm.$executeRaw.mockImplementation(async (strings: any) => {
      if ((strings as string[]).join('?').includes('FOR UPDATE')) order.push('lock');
      return 1;
    });

    // Simpan implementasi asli SEBELUM di-spy; `vi.spyOn` mengganti properti,
    // sehingga `FoundationDecisionService.renderPdf` sesudahnya adalah mock
    // itu sendiri dan `originalRender` akan berrekursi tanpa akhir.
    const originalRender = FoundationDecisionService.renderPdf;
    const lockSpy = vi
      .spyOn(FoundationDecisionService, 'renderPdf')
      .mockImplementation(async (decision: any) => {
        order.push('render');
        return originalRender.call(FoundationDecisionService, decision);
      });

    try {
      const result = await FoundationDecisionService.castVote(
        { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
        'dec-1',
        { choice: 'APPROVE', passphrase: PASS }
      );
      // Render terjadi, dan ia mendahului pengambilan kunci.
      expect(order).toContain('render');
      expect(order.indexOf('render')).toBeLessThan(order.indexOf('lock'));
      expect(result.voteId).toBe('vote-1');
    } finally {
      lockSpy.mockRestore();
    }
  });

  /**
   * Regresi D → INVESTIGATION E (stale-preview path).
   *
   * `applyLocked` dulu merender ulang PDF (dan `ensureSeal` → scrypt) DI DALAM
   * transaksi ketika artefak preview basi — persis jalur yang lomba dengan
   * pemilih paralel. Sekarang jalur itu melempar `StaleArtifactError`, transaksi
   * dibatalkan, dan `castVote` mengulang dari luar dengan baris segar. Yang
   * diperiksa di sini: `renderPdf` TIDAK dipanggil saat kunci dipegang, dan
   * percobaan kedua memakai baris yang dimuat ulang (1 suara sudah ada).
   *
   * `decisionRow()` memakai `activeCount: 3` + `MUTLAK 1`, sehingga satu suara
   * langsung mencapai mufakat dan artefak disiapkan pada tiap percobaan.
   */
  it('artefak basi: tidak merender di dalam lock dan mengulang dari luar', async () => {
    const d = decisionRow({
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 1,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    const existing = signedVoteRow(d, 'user-2', 'APPROVE');
    // Pemilihan-pemilih yang berarti: baris di luar kunci selalu tidak memuat
    // suara baru buatan kita (transaksi basi di-rollback), sementara di dalam
    // kunci himpunannya sudah berubah karena pemilih paralel. Sidik jari preview
    // tidak pernah cocok, jadi jalur basi terpicu.
    let n = 0;
    dm.foundationDecision.findUnique.mockImplementation(async () => {
      n += 1;
      return n === 1 ? d : { ...d, votes: [existing] };
    });
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([existing]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'APPROVED' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findMany.mockResolvedValue([
      {
        id: 'seal-1',
        ...createSealMaterial(config.foundation.esealPassphrase),
        revokedAt: null,
        activatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });

    const order: string[] = [];
    // `inTx` menandai "kode sedang berada di dalam transaksi interaktif".
    // Penanda di-reset saat transaksi selesai, jadi render pada percobaan
    // BERIKUTNYA (yang sah di luar lock) tidak salah terbaca sebagai
    // "render di dalam lock".
    let inTx = false;
    dm.$executeRaw.mockImplementation(async (strings: any) => {
      if ((strings as string[]).join('?').includes('FOR UPDATE')) order.push('lock');
      return 1;
    });
    const baseTransaction = dm.$transaction.getMockImplementation();
    dm.$transaction.mockImplementation((cb: any) => {
      inTx = true;
      const result = baseTransaction(cb);
      return Promise.resolve(result).finally(() => {
        inTx = false;
      });
    });

    const originalRender = FoundationDecisionService.renderPdf;
    const renderSpy = vi
      .spyOn(FoundationDecisionService, 'renderPdf')
      .mockImplementation(async (decision: any) => {
        order.push(inTx ? 'render-under-lock' : 'render-outside-lock');
        return originalRender.call(FoundationDecisionService, decision);
      });

    let thrown: unknown;
    try {
      await FoundationDecisionService.castVote(
        { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
        'dec-1',
        { choice: 'APPROVE', passphrase: PASS }
      );
    } catch (err) {
      thrown = err;
    } finally {
      renderSpy.mockRestore();
    }

    // Inti finding E: jalur yang memegang kunci TIDAK pernah merender PDF
    // (atau `ensureSeal` → scrypt). Sebelum perbaikan, artefak basi memicu
    // `prepareApprovalArtifact` DI DALAM transaksi dan baris ini gagal.
    expect(order).not.toContain('render-under-lock');
    // Minimal dua percobaan: render luar-lock sekali per percobaan, dan baris
    // dimuat ulang di antara percobaan.
    expect(order.filter((x) => x === 'render-outside-lock').length).toBeGreaterThanOrEqual(2);
    expect(dm.$transaction.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Karena mock tidak pernah memasukkan suara baru ke baris `fresh`,
    // sidik jari tak pernah cocok dan operasi berakhir dengan sinyal basi yang
    // dikonversi menjadi galat — bukan diam-diam menyegel state basi.
    expect(thrown).toBeInstanceOf(Error);
  });

  it('melempar di dalam lock, bukan merender, ketika pemanggil melewati persiapan', async () => {
    const d = decisionRow();
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
    const renderSpy = vi.spyOn(FoundationDecisionService, 'renderPdf');
    try {
      await expect(
        FoundationDecisionService.applyLocked(
          { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
          d,
          evaluation as never,
          dm as never,
          undefined
        )
      ).rejects.toThrow(/stale approval artifact/);
      expect(renderSpy).not.toHaveBeenCalled();
    } finally {
      renderSpy.mockRestore();
    }
  });

  /**
   * Sisi `finalize` dari finding E: percobaan ulang harus menghitung artefak
   * dari baris yang DIMUAT ULANG, bukan mengulang dengan artefak basi. Sebelum
   * perbaikan kedua, `finalize` menyiapkan artefak sekali dari `d` lalu
   * mengulang dengan `previewArtifact` yang sama, sehingga sidik jarinya tak
   * pernah cocok dan pemanggil selalu mendapat `StaleArtifactError` setelah
   * lock diambil. Di sini percobaan 1 melihat himpunan suara yang berbeda,
   * percobaan 2 melihat himpunan final — dan finalisasi harus BERHASIL.
   */
  it('finalize: mengulang dengan baris segar dan menyegel, bukan gagal karena artefak basi', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 3,
        decisionMode: 'MUTLAK',
        decisionValue: 3,
      },
    });
    const v0 = signedVoteRow(d, 'user-0', 'APPROVE');
    const v1 = signedVoteRow(d, 'user-1', 'APPROVE');
    const v2 = signedVoteRow(d, 'user-2', 'APPROVE');
    // Muat awal: 2 suara (belum mufakat). Penguncian percobaan 1: 3 suara,
    // sehingga artefak percobaan 1 basi. Percobaan 2 memuat 3 suara di luar dan
    // di dalam → segel berhasil.
    let n = 0;
    dm.foundationDecision.findUnique.mockImplementation(async () => {
      n += 1;
      return n === 1 ? { ...d, votes: [v0, v1] } : { ...d, votes: [v0, v1, v2] };
    });
    dm.foundationDecisionVote.findMany.mockResolvedValue([v0, v1, v2]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'APPROVED' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findMany.mockResolvedValue([
      {
        id: 'seal-1',
        ...createSealMaterial(config.foundation.esealPassphrase),
        revokedAt: null,
        activatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });

    const order: string[] = [];
    let inTx = false;
    dm.$executeRaw.mockImplementation(async (strings: any) => {
      if ((strings as string[]).join('?').includes('FOR UPDATE')) order.push('lock');
      return 1;
    });
    const baseTransaction = dm.$transaction.getMockImplementation();
    dm.$transaction.mockImplementation((cb: any) => {
      inTx = true;
      return Promise.resolve(baseTransaction(cb)).finally(() => {
        inTx = false;
      });
    });
    const originalRender = FoundationDecisionService.renderPdf;
    const renderSpy = vi
      .spyOn(FoundationDecisionService, 'renderPdf')
      .mockImplementation(async (decision: any) => {
        order.push(inTx ? 'render-under-lock' : 'render-outside-lock');
        return originalRender.call(FoundationDecisionService, decision);
      });

    try {
      const res = await FoundationDecisionService.finalize(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        'dec-1'
      );
      expect(res.outcome).toBe('APPROVED');
      // Tidak ada render/scrypt di dalam kunci. Percobaan 1 tidak menyiapkan
      // artefak (baris awalnya belum mufakat) lalu basi di dalam kunci;
      // percobaan 2 menyiapkannya di luar dan menyegel.
      expect(order).not.toContain('render-under-lock');
      expect(order.filter((x) => x === 'render-outside-lock').length).toBeGreaterThanOrEqual(1);
      expect(dm.$transaction.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      renderSpy.mockRestore();
    }
  });
});

/**
 * PRIORITAS 0 audit #1 — ikatan public key suara tidak tepercaya.
 *
 * Sebelum perbaikan, `isVoteAuthentic` memverifikasi tanda tangan terhadap
 * `vote.publicKey` yang DISIMPAN PADA BARIS SUARA ITU SENDIRI. Seorang admin
 * basis data cukup membuat pasangan kunci baru, memakai `userId` anggota
 * snapshot, menandatangani digest kanonis dengan kunci karangannya, lalu
 * menyisipkan baris suara berisi public key dan tanda tangan yang saling
 * cocok. Suara palsu itu lolos verifikasi dan dapat memicu e-seal Yayasan.
 *
 * Perbaikannya mengikat suara ke rekaman `user_signing_key_history` milik
 * pemilih yang SAMA: `signingKeyId` + `publicKeyFingerprint` harus menunjuk
 * rekaman tepercaya, dan kunci yang dipakai memverifikasi adalah kunci PUBLIK
 * dari rekaman itu — bukan dari baris suara.
 */
describe('FoundationDecisionService.votesOf — ikatan kunci tepercaya (audit #1)', () => {
  /** Pasangan kunci milik PENYERANG, terpisah dari material anggota yang sah. */
  const attacker = createKeyMaterial('passphrase-penyerang-2026');

  /**
   * Baris suara karangan: `userId` anggota snapshot yang sah, tetapi
   * ditandatangani kunci penyerang, dan — inilah inti serangannya —
   * `publicKey` beserta tanda tangannya saling konsisten.
   */
  function attackerVote(d: any, userId: string): any {
    const attackerKey = {
      id: `kh-attacker-${userId}`,
      userId,
      algorithm: attacker.algorithm,
      publicKey: attacker.publicKey,
      fingerprint: publicKeyFingerprint(attacker.publicKey),
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      supersededAt: null,
      revokedAt: null,
    };
    const digest = canonicalDigestForVote(d, {
      userId,
      choice: 'APPROVE',
      signedAt: new Date('2026-01-02T00:00:00Z'),
    });
    return {
      id: `vote-forged-${userId}`,
      decisionId: d.id,
      userId,
      choice: 'APPROVE',
      canonicalDigest: digest,
      signature: signPdfHash(attacker, 'passphrase-penyerang-2026', digest),
      publicKey: attacker.publicKey,
      algorithm: attacker.algorithm,
      note: null,
      signedAt: new Date('2026-01-02T00:00:00Z'),
      signingKeyId: attackerKey.id,
      publicKeyFingerprint: attackerKey.fingerprint,
      user: { id: userId, name: 'Anggota palsu' },
      signingKey: attackerKey,
    };
  }

  it('menolak suara karangan meski public key-nya cocok dengan tanda tangannya sendiri', () => {
    const d = decisionRow();
    const forged = attackerVote(d, 'user-1');
    // Baris disisipkan langsung ke basis data: ia menunjuk `signingKeyId`
    // karangan yang TIDAK ada di `user_signing_key_history`, jadi relasinya
    // kosong saat dibaca.
    forged.signingKey = null;
    // Bukti bahwa serangan ini NYATA pada head lama: tanda tangannya sah untuk
    // public key yang dibawanya sendiri, dan digest-nya cocok.
    expect(forged.signature).toBeTruthy();
    expect(new Set(d.members.map((m: { userId: string }) => m.userId)).has(forged.userId)).toBe(
      true
    );

    const counted = FoundationDecisionService.votesOf({ ...d, votes: [forged] } as never);
    // Yang membedakan tepercaya dari karangan adalah rekaman riwayat kunci:
    // baris suara yang tidak menunjuk rekaman tepercaya TIDAK dihitung.
    expect(counted).toEqual([]);
  });

  it('menolak suara yang menunjuk rekaman kunci milik ORANG LAIN', () => {
    const d = decisionRow();
    const forged = attackerVote(d, 'user-1');
    // Rekaman ada dan fingerprint-nya cocok dengan kuncinya, tetapi milik
    // user-2 — bukan pemilik baris suara.
    forged.signingKey = { ...forged.signingKey, userId: 'user-2' };
    const counted = FoundationDecisionService.votesOf({ ...d, votes: [forged] } as never);
    expect(counted).toEqual([]);
  });

  it('menolak suara yang fingerprint-nya tidak cocok dengan rekamannya', () => {
    const d = decisionRow();
    const forged = attackerVote(d, 'user-1');
    // fingerprint ditulis ulang agar tampak menunjuk rekaman lain.
    forged.publicKeyFingerprint = publicKeyFingerprint(material.publicKey);
    const counted = FoundationDecisionService.votesOf({ ...d, votes: [forged] } as never);
    expect(counted).toEqual([]);
  });

  it('menolak suara yang tidak memuat relasi rekaman kunci sama sekali', () => {
    const d = decisionRow();
    const forged = attackerVote(d, 'user-1');
    delete (forged as any).signingKey;
    const counted = FoundationDecisionService.votesOf({ ...d, votes: [forged] } as never);
    expect(counted).toEqual([]);
  });

  it('suara palsu tidak dihitung ke kuorum, jadi e-seal tidak dapat dipicu', async () => {
    const d = decisionRow({
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    // Basis data hanya berisi suara karangan.
    dm.foundationDecisionVote.findMany.mockResolvedValue([attackerVote(d, 'user-1')]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-2', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    // Suara penyerang tidak pernah masuk rekap...
    expect(result.voteSummary.approve).toBe(1);
    // ...dan tidak memicukan finalisasi/e-seal.
    expect(dm.foundationEseal.create).not.toHaveBeenCalled();
    expect(dm.foundationDecisionDocument.create).not.toHaveBeenCalled();
  });

  /**
   * Suara lama harus tetap terverifikasi setelah kunci dirotasi/dicabut.
   *
   * Inilah alasan `user_signing_key_history` append-only ada: `UserSigningKey`
   * satu baris per pengguna dan diganti saat penerbitan ulang. Bila riwayatnya
   * tidak hidup di tabel sendiri, memperbaiki lubang di atas justru akan
   * membatalkan setiap keputusan yang sudah sah.
   */
  it('suara lama tetap sah walau rekaman kuncinya sudah superseded/revoked', () => {
    const d = decisionRow();
    const old: any = signedVoteRow(d, 'user-1', 'APPROVE');
    // Rotasi: rekaman lama ditandai superseded dan revoked, tetapi TETAP ada.
    old.signingKey = {
      ...old.signingKey,
      supersededAt: new Date('2026-06-01T00:00:00Z'),
      revokedAt: new Date('2026-06-01T00:00:00Z'),
    };

    const counted = FoundationDecisionService.votesOf({ ...d, votes: [old] } as never);
    expect(counted).toEqual([{ choice: 'APPROVE' }]);
  });
});

/**
 * Flag Investigation (E) — stempel waktu daur hidup kunci harus MENGIKAT.
 *
 * `issuedAt`, `supersededAt`, dan `revokedAt` sudah lama dimuat tetapi tidak
 * pernah dibaca, sehingga kunci yang dicabut atau digantikan tetap dianggap
 * sah untuk setiap suara yang menunjuk rekamannya — pencabutan dan rotasi
 * tidak mengikat apa pun. Aturan yang dipaku: tanda tangan harus berada DI
 * DALAM masa berlaku kunci, dipandang dari `vote.signedAt`.
 *
 * Semua helper di bawah menandatangani ulang digest dengan `signedAt` yang
 * diberikan, karena `signedAt` termasuk payload kanonis.
 */
describe('FoundationDecisionService — stempel waktu daur hidup kunci (E)', () => {
  function voteSignedAt(d: any, userId: string, signedAt: Date, choice: 'APPROVE' = 'APPROVE') {
    const digest = canonicalDigestForVote(d, { userId, choice, signedAt });
    const key = keyHistoryRow(userId);
    return {
      id: `vote-ts-${userId}`,
      decisionId: d.id,
      userId,
      choice,
      canonicalDigest: digest,
      signature: signPdfHash(material, PASS, digest),
      publicKey: material.publicKey,
      algorithm: material.algorithm,
      note: null,
      signedAt,
      signingKeyId: key.id,
      publicKeyFingerprint: key.fingerprint,
      user: { id: userId, name: `Anggota ${userId}` },
      signingKey: key,
    };
  }

  it('menolak tanda tangan SEBELUM kunci diterbitkan', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2025-12-31T00:00:00Z'));
    vote.signingKey = { ...vote.signingKey, issuedAt: new Date('2026-01-01T00:00:00Z') };
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([]);
  });

  it('menolak tanda tangan pada/di setelah pencabutan', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2026-06-01T00:00:00Z'));
    vote.signingKey = { ...vote.signingKey, revokedAt: new Date('2026-06-01T00:00:00Z') };
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([]);
  });

  it('menolak tanda tangan pada/di setelah kunci digantikan', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2026-06-01T00:00:00Z'));
    vote.signingKey = { ...vote.signingKey, supersededAt: new Date('2026-06-01T00:00:00Z') };
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([]);
  });

  it('menerima tanda tangan tepat SEBELUM pencabutan (historis tetap sah)', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2026-05-31T23:59:59Z'));
    vote.signingKey = { ...vote.signingKey, revokedAt: new Date('2026-06-01T00:00:00Z') };
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([
      { choice: 'APPROVE' },
    ]);
  });

  it('menerima tanda tangan tepat SEBELUM penggantian (historis tetap sah)', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2026-05-31T23:59:59Z'));
    vote.signingKey = { ...vote.signingKey, supersededAt: new Date('2026-06-01T00:00:00Z') };
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([
      { choice: 'APPROVE' },
    ]);
  });

  it('menerima tanda tangan setelah issuedAt dan tanpa pencabutan/penggantian', () => {
    const d = decisionRow();
    const vote: any = voteSignedAt(d, 'user-1', new Date('2026-01-02T00:00:00Z'));
    expect(FoundationDecisionService.votesOf({ ...d, votes: [vote] } as never)).toEqual([
      { choice: 'APPROVE' },
    ]);
  });

  /**
   * Bukti bahwa aturan ini benar-benar baru: tanpa pembacaan stempel waktu,
   * tanda tangan SETELAH pencabutan akan dihitung. Uji ini menegaskan hasilnya
   * berbeda dari sekadar "rekaman ada dan fingerprint cocok".
   */
  it('pencabutan tidak memengaruhi suara yang dibuat sebelum pencabutan, tetapi menolak yang sesudahnya', () => {
    const d = decisionRow();
    const revokedAt = new Date('2026-06-01T00:00:00Z');
    const before: any = voteSignedAt(d, 'user-1', new Date('2026-05-01T00:00:00Z'));
    before.signingKey = { ...before.signingKey, revokedAt };
    const after: any = voteSignedAt(d, 'user-1', new Date('2026-07-01T00:00:00Z'));
    after.signingKey = { ...after.signingKey, revokedAt };

    expect(FoundationDecisionService.votesOf({ ...d, votes: [before] } as never)).toEqual([
      { choice: 'APPROVE' },
    ]);
    expect(FoundationDecisionService.votesOf({ ...d, votes: [after] } as never)).toEqual([]);
  });
});

/**
 * PRIORITAS 1 audit #2 — rekap suara yang dicetak PDF harus mencakup suara
 * penentu.
 *
 * `prepareApprovalArtifact` merender PDF dari `previewDecision` yang memuat
 * `previewVote`, tetapi mempertahankan `voteSummary` LAMA. `approvalFingerprint`
 * juga tidak mengikat `voteSummary`. Akibatnya artefak preview yang dirender
 * SEBELUM suara penentu dinyatakan masih cocok ketika suara itu masuk, lalu
 * PDF final mencetak rekap sebelum suara penentu — sementara basis data
 * menyimpan rekap yang sudah memuatnya.
 */
describe('feature: artefak approval mengikat rekap suara (audit #2)', () => {
  it('rekap pada PDF memuat suara terakhir yang menentukan', async () => {
    const d = decisionRow({
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        activeCount: 1,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
      members: [
        {
          id: 'm0',
          userId: 'user-0',
          name: 'Anggota 0',
          roleCode: 'YAYASAN_PEMBINA',
          user: { id: 'user-0', name: 'Anggota 0' },
        },
      ],
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({ id: 'vote-1' });
    dm.foundationDecisionVote.findMany.mockResolvedValue([signedVoteRow(d, 'user-0', 'APPROVE')]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'APPROVED' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.userSigningKey.update.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue({
      id: 'seal-1',
      algorithm: material.algorithm,
      publicKey: material.publicKey,
      encryptedPrivateKey: material.encryptedPrivateKey,
      kdfSalt: material.kdfSalt,
      kdfParams: material.kdfParams,
      iv: material.iv,
      authTag: material.authTag,
      activatedAt: new Date(),
      revokedAt: null,
    });
    const renderSpy = vi.spyOn(FoundationDecisionService, 'renderPdf');

    await FoundationDecisionService.castVote(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', passphrase: PASS }
    );

    expect(renderSpy).toHaveBeenCalled();
    // Setiap render (preview maupun final) harus memuat rekap dengan SATU
    // suara setuju — bukan rekap kosong dari snapshot pra-suara.
    for (const call of renderSpy.mock.calls) {
      const summary = (call[0] as any).voteSummary;
      expect(summary.approve).toBe(1);
      expect(summary.present).toBe(1);
    }
    renderSpy.mockRestore();
  });
});

/**
 * Flag D — tampilan kuorum legacy harus sama dengan yang DITEGAKKAN.
 *
 * Mesin kuorum mengabaikan `value` yang tersimpan dan memakai
 * `quorumValueForMode(mode)` (mode mengikat). Skema upsert menolak nilai yang
 * menyimpang, tetapi baris LAMA — ditulis sebelum refinement ada, atau
 * disisipkan langsung ke basis data — dapat memuat `TWO_THIRDS` dengan value
 * 0.5. Tanpa normalisasi, API menampilkan 0.5 sementara yang dievaluasi 2/3:
 * halaman pengelolaan aturan berbohong tentang ambang yang mengikat.
 *
 * Regresi ini GAGAL pada `loadRule`/`listRules` yang mengembalikan baris apa
 * adanya, dan LULUS setelah `normalizeRule`.
 */
describe('FoundationDecisionService.loadRule / listRules — normalisasi kuorum legacy (Flag D)', () => {
  const legacyRule = {
    id: 'rule-legacy',
    organType: 'PENGAWAS',
    decisionKind: 'MEETING',
    // Kontradiksi yang disengaja: label menjanjikan dua pertiga, nilai menulis
    // setengah.
    quorumPresentMode: 'TWO_THIRDS',
    quorumPresentValue: 0.5,
    quorumDecisionMode: 'THREE_QUARTERS',
    quorumDecisionValue: 0.5,
    updatedById: 'user-admin',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('loadRule menampilkan nilai yang mengikuti MODE, bukan value legacy', async () => {
    dm.foundationDecisionRule.findUnique.mockResolvedValue(legacyRule);

    const rule = await FoundationDecisionService.loadRule('PENGAWAS', 'MEETING');

    expect(rule.quorumPresentMode).toBe('TWO_THIRDS');
    expect(rule.quorumPresentValue).toBeCloseTo(2 / 3, 6);
    expect(rule.quorumDecisionMode).toBe('THREE_QUARTERS');
    expect(rule.quorumDecisionValue).toBeCloseTo(3 / 4, 6);
  });

  it('snapshot keputusan memakai nilai yang sudah dinormalisasi (tampil = ditegakkan)', async () => {
    dm.foundationDecisionRule.findUnique.mockResolvedValue(legacyRule);

    const rule = await FoundationDecisionService.loadRule('PENGAWAS', 'MEETING');

    // Ambang yang benar-benar dievaluasi untuk kolam 12: ceil(12 * 2/3) = 8.
    // Bila value legacy 0.5 dipakai, hasilnya akan 7 — perbedaan yang mengubah
    // hasil kuorum.
    expect(requiredCount(rule.quorumPresentMode, rule.quorumPresentValue, 12)).toBe(8);
    expect(requiredCount(rule.quorumDecisionMode, rule.quorumDecisionValue, 12)).toBe(9);
  });

  it('listRules menormalkan SETIAP baris legacy', async () => {
    dm.foundationDecisionRule.findMany.mockResolvedValue([legacyRule]);

    const rules = await FoundationDecisionService.listRules();

    expect(rules).toHaveLength(1);
    expect(rules[0].quorumPresentValue).toBeCloseTo(2 / 3, 6);
    expect(rules[0].quorumDecisionValue).toBeCloseTo(3 / 4, 6);
  });
});

/**
 * Regresi BUG — unordered members abort finalization.
 *
 * `decisionInclude.members` tidak memakai `orderBy`, sedangkan
 * `approvalFingerprint` mengikat urutan `userId` anggota dan `renderPdf`
 * mencetak roster dalam urutan baca. Dua pembacaan relasi yang setara dapat
 * kembali dalam urutan fisik berbeda, sehingga sidik jari artefak preview tidak
 * cocok dengan sidik jari baris terkunci — finalisasi lalu gagal basi berulang
 * kali (retry habis) padahal tidak ada pemilih lain yang menyela.
 *
 * Test ini memasok anggota yang SAMA dalam urutan yang BERBEDA pada pembacaan
 * luar-kunci dan dalam-kunci. Dengan kanonikalisasi (orderBy + sort di
 * `approvalFingerprint`/`renderPdf`), sidik jarinya identik dan finalisasi
 * berhasil. Test GAGAL pada implementasi lama.
 */
describe('feature: urutan anggota deterministik (unordered members)', () => {
  function reorderMembers(rows: any): any {
    return {
      ...rows,
      members: [...rows.members].reverse(),
      votes: [...rows.votes].reverse(),
    };
  }

  it('finalisasi APPROVED berhasil walau relasi anggota dibaca dalam urutan berbeda', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MUTLAK',
        presentValue: 1,
        decisionMode: 'MUTLAK',
        decisionValue: 1,
      },
    });
    d.votes = [
      signedVoteRow(d, 'user-0', 'APPROVE'),
      signedVoteRow(d, 'user-1', 'APPROVE'),
      signedVoteRow(d, 'user-2', 'APPROVE'),
    ];
    // Pembacaan luar-kunci dan dalam-kunci mengembalikan himpunan yang sama
    // tetapi urutan relasi terbalik.
    let read = 0;
    dm.foundationDecision.findUnique.mockImplementation(async () => {
      read += 1;
      return read === 1 ? d : reorderMembers(d);
    });

    const sealMat = createSealMaterial(config.foundation.esealPassphrase);
    dm.foundationEseal.findMany.mockResolvedValue([
      {
        id: 'seal-1',
        ...sealMat,
        kdfParams: sealMat.kdfParams as never,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'APPROVED' });
    dm.foundationDecisionDocument.create.mockResolvedValue({ id: 'doc-1' });
    const pdfSpy = vi
      .spyOn(pdfModule, 'generateDecisionPdf')
      .mockResolvedValue(Buffer.from('%PDF-1.4 deterministic'));
    const renderSpy = vi.spyOn(FoundationDecisionService, 'renderPdf');

    try {
      const res = await FoundationDecisionService.finalize(
        { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
        'dec-1'
      );
      expect(res.outcome).toBe('APPROVED');
      // Tidak ada stale retry: satu transaksi cukup (satu `findUnique`
      // pra-transaksi + satu di dalam kunci).
      expect(dm.$transaction).toHaveBeenCalledTimes(1);

      // Byte PDF yang dirender identik lintas urutan relasi: roster anggota
      // dicetak dalam urutan kanonis.
      const rosterOrders = renderSpy.mock.calls.map((call) =>
        (call[0] as any).members.map((m: any) => m.userId)
      );
      expect(rosterOrders.length).toBeGreaterThan(0);
      for (const order of rosterOrders) {
        expect(order).toEqual(['user-0', 'user-1', 'user-2']);
      }
    } finally {
      renderSpy.mockRestore();
      pdfSpy.mockRestore();
    }
  });

  it('byte PDF identik ketika anggota yang sama dibaca dalam urutan berbeda', async () => {
    const d = decisionRow();
    const pdfSpy = vi
      .spyOn(pdfModule, 'generateDecisionPdf')
      .mockResolvedValue(Buffer.from('%PDF-1.4 fingerprint'));
    try {
      await FoundationDecisionService.renderPdf(d);
      const reversed = { ...d, members: [...d.members].reverse() };
      await FoundationDecisionService.renderPdf(reversed);
      // Roster yang dirender selalu dalam urutan kanonis yang SAMA, apa pun
      // urutan relasi masukannya.
      const [firstCall, secondCall] = pdfSpy.mock.calls;
      expect((firstCall[0] as any).members.map((m: any) => m.userId)).toEqual(
        (secondCall[0] as any).members.map((m: any) => m.userId)
      );
      expect((firstCall[0] as any).members.map((m: any) => m.userId)).toEqual([
        'user-0',
        'user-1',
        'user-2',
      ]);
    } finally {
      pdfSpy.mockRestore();
    }
  });
});

/**
 * F4 (SECURITY critical) — otorisasi peran dibuktikan ULANG DI DALAM transaksi.
 *
 * `refreshActorRoles` berjalan di luar transaksi, dan token akses stateless
 * tidak membawa pencabutan peran. Tanpa pembacaan ulang di dalam transaksi,
 * aktor yang perannya dicabut/dinonaktifkan/kedaluwarsa secara konkuren tetap
 * dapat menuliskan tindakan tata kelola (create/finalize/cancel/publication/
 * rules) — inilah celah yang ditutup `assertActorAuthorizedInTx`.
 */
describe('FoundationDecisionService — otorisasi peran ulang di dalam transaksi (F4)', () => {
  const input = {
    organType: 'PEMBINA' as const,
    kind: 'MEETING' as const,
    subject: 'Subjek Keputusan',
    body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
    decisionType: 'pengesahan-rencana-kerja' as const,
  };

  it('create DITOLAK bila peran organ aktor sudah dicabut di dalam transaksi', async () => {
    // Aktor lolos pemeriksaan pra-transaksi (peran masih di klaim token), lalu
    // pembacaan ulang di dalam transaksi menunjukkan tidak ada peran organ lagi.
    dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
      args?.where?.userId ? [] : memberAssignments(3)
    );
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    await expect(
      FoundationDecisionService.create({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, input)
    ).rejects.toThrow(/tidak berwenang memutus/);

    // Tidak ada keputusan maupun audit yang tertulis: penolakan benar-benar
    // membatalkan transaksi.
    expect(dm.foundationDecision.create).not.toHaveBeenCalled();
    expect(dm.auditLog.create).not.toHaveBeenCalled();
  });

  it('finalize DITOLAK bila peran finalisasi aktor sudah dicabut di dalam transaksi', async () => {
    const d = decisionRow({
      kind: 'MEETING',
      quorumSnapshot: {
        organType: 'PEMBINA',
        kind: 'MEETING',
        activeCount: 3,
        presentMode: 'MAJORITY',
        presentValue: 0.5,
        decisionMode: 'MAJORITY',
        decisionValue: 0.5,
      },
    });
    d.votes = [signedVoteRow(d, 'user-0', 'APPROVE'), signedVoteRow(d, 'user-1', 'APPROVE')];
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
      args?.where?.userId ? [{ role: { code: 'YAYASAN_BENDAHARA' } }] : []
    );

    await expect(
      FoundationDecisionService.finalize({ id: 'user-0', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1')
    ).rejects.toThrow(/tidak berhak memfinalisasi/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  it('setPublication DITOLAK bila SUPER_ADMIN sudah dicabut di dalam transaksi', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(
      decisionRow({ status: 'VOTING', publication: 'PRIVATE' })
    );
    dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
      args?.where?.userId ? [{ role: { code: 'YAYASAN_KETUA' } }] : []
    );

    await expect(
      FoundationDecisionService.setPublication(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        'dec-1',
        'PRIVATE'
      )
    ).rejects.toThrow(/Hanya Super Admin/);
    expect(dm.foundationDecision.update).not.toHaveBeenCalled();
  });

  it('upsertRule DITOLAK bila SUPER_ADMIN sudah dicabut di dalam transaksi', async () => {
    dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
      args?.where?.userId ? [{ role: { code: 'YAYASAN_KETUA' } }] : []
    );

    await expect(
      FoundationDecisionService.upsertRule(
        { id: 'super', roleCode: 'SUPER_ADMIN' },
        {
          organType: 'PEMBINA',
          decisionKind: 'MEETING',
          quorumPresentMode: 'MAJORITY',
          quorumPresentValue: 0.5,
          quorumDecisionMode: 'MAJORITY',
          quorumDecisionValue: 0.5,
        }
      )
    ).rejects.toThrow(/Hanya Super Admin/);
    expect(dm.foundationDecisionRule.upsert).not.toHaveBeenCalled();
  });

  /**
   * Aktor yang tetap memegang peran yang sah TIDAK terpengaruh: perbaikan ini
   * menambah pembuktian, bukan mempersempit siapa yang boleh bertindak.
   */
  it('create tetap lolos bila peran organ masih aktif di dalam transaksi', async () => {
    dm.userRoleAssignment.findMany.mockImplementation(async (args: any) =>
      args?.where?.userId ? [{ role: { code: 'YAYASAN_PEMBINA' } }] : memberAssignments(3)
    );
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    const id = await FoundationDecisionService.create(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      input
    );
    expect(id).toBe('dec-new');
  });
});
