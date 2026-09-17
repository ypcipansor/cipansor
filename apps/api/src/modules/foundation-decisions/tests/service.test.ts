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
    userRoleAssignment: { findMany: vi.fn() },
    userSigningKey: { findUnique: vi.fn(), update: vi.fn() },
    userSigningKeyHistory: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
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
    // update terpisah yang dapat berjalan terbalik.
    const rawSql = (dm.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(rawSql).toContain('"failed_attempts" = "failed_attempts" + 1');
    expect(rawSql).toContain('locked_until');
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
    const rawSql = (dm.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(rawSql).toContain('"failed_attempts" + 1 >=');
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
    dm.foundationEseal.create
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValue({
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
    const d = decisionRow({ status: 'APPROVED' });
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
});

describe('FoundationDecisionService.getFinalDocument', () => {
  const reader = { id: 'u-reader', roleCode: 'YAYASAN_KETUA' };

  it('mengembalikan dokumen untuk keputusan APPROVED', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'APPROVED', members: [{ userId: reader.id }] },
    });
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
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'APPROVED', members: [{ userId: 'u-alumni' }] },
    });
    const doc = await FoundationDecisionService.getFinalDocument(
      { id: 'u-alumni', roleCode: 'GURU' },
      'dec-1'
    );
    expect(doc.id).toBe('doc-1');
  });

  it('menolak pihak luar tanpa hubungan dari mengunduh dokumen', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'APPROVED', members: [{ userId: 'u-member' }] },
    });
    await expect(
      FoundationDecisionService.getFinalDocument({ id: 'u-outsider', roleCode: 'GURU' }, 'dec-1')
    ).rejects.toThrow(/tidak berhak/);
  });

  it('melempar 404 bila dokumen belum final', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      bytes: new Uint8Array(Buffer.from('%PDF')),
      decision: { status: 'VOTING', members: [] },
    });
    await expect(
      FoundationDecisionService.getFinalDocument(reader, 'dec-1')
    ).rejects.toThrow(/belum final/);
  });

  it('melempar 404 bila dokumen tidak ada', async () => {
    dm.foundationDecisionDocument.findUnique.mockResolvedValue(null);
    await expect(
      FoundationDecisionService.getFinalDocument(reader, 'dec-1')
    ).rejects.toThrow(/tidak ditemukan/);
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
    expect(new Set(d.members.map((m) => m.userId)).has(forged.userId)).toBe(true);

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
