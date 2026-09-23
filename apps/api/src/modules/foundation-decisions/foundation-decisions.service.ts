import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  FoundationDecision,
  FoundationDecisionMember,
  FoundationDecisionPublication,
  FoundationDecisionRule,
  FoundationDecisionStatus,
  FoundationDecisionVote,
  FoundationEseal,
  Prisma,
  RoleCode,
  UserSigningKeyHistory,
} from '@prisma/client';
import type {
  CastFoundationVoteInput,
  CreateFoundationDecisionInput,
  FoundationCreateOptionsDTO,
  FoundationDecisionKind,
  FoundationDecisionVerificationDTO,
  FoundationOrganType,
  ListFoundationDecisionsQuery,
  QuorumSnapshot,
  UpsertFoundationRuleInput,
  VoteSummary,
} from '@cipansor/shared';
import {
  DEFAULT_FOUNDATION_RULE,
  decisionTypesForOrgan,
  FoundationQuorumMode,
  quorumValueForMode,
} from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { config } from '@/config';
import { evaluateQuorum, type QuorumEvaluation } from '@/utils/foundation-quorum';
import {
  organMayDecide,
  roleCodesForOrgan,
  rolePriorityForOrgan,
  selectSnapshotAssignments,
  canFinalizeDecision,
  allowedCreateOrgansForRole,
} from '@/utils/foundation-authority';
import {
  canReadFoundationDecision,
  foundationDecisionListWhere,
} from '@/utils/foundation-decision-access';
import {
  EsignError,
  LOCKOUT_MINUTES,
  MAX_PASSPHRASE_ATTEMPTS,
  publicKeyFingerprint,
  signPdfHash,
  verifyPdfHashSignature,
  type EncryptedKeyMaterial,
  type ScryptParams,
} from '@/utils/esign';
import { assertCanSign } from '@/utils/esign-lifecycle';
import {
  createSealMaterial,
  sealCanSign,
  signSeal,
  toSealMaterial,
} from '@/utils/foundation-eseal';
import { decisionVerificationUrl } from '@/utils/verification-url';
import { generateDecisionPdf } from '@/utils/generate-decision-pdf';
import type { DecisionPdfVoteRow, DecisionPdfMemberRow } from '@/utils/generate-decision-pdf';

// Default legal hidup di `@cipansor/shared` supaya halaman pengelolaan aturan
// menampilkan nilai yang benar-benar berlaku, bukan salinan yang bisa basi.
const DEFAULT_RULE = DEFAULT_FOUNDATION_RULE;

/** Hash teks kanonis (payload suara, dsb). Selalu UTF-8. */
export function sha256hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Hash byte mentah — untuk arsip PDF.
 *
 * Memisahkan ini dari `sha256hex` bukan urusan kerapian: sebuah PDF adalah
 * biner, dan `sha256hex(buf.toString('utf8'))` lebih dulu menafsirkan ulang
 * byte-nya sebagai teks. Setiap byte yang bukan UTF-8 sah digantikan U+FFFD,
 * sehingga dua berkas berbeda dapat menghasilkan digest yang sama — dan yang
 * ditandatangani e-seal bukan lagi byte yang benar-benar diarsipkan.
 */
export function sha256bytes(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Payload kanonis yang menjabarkan pokok keputusan + suara yang ditandatangani.
 * Menyertakan ringkasan isi (hash body) dan snapshot kuorum, sehingga tanda
 * tangan mengikat ISI keputusan — mengubah satu karakter pun membatalkannya.
 */
export function canonicalDecisionPayload(params: {
  decisionId: string;
  organType: string;
  kind: string;
  decisionType: string;
  subject: string;
  body: string;
  createdAt: Date;
  activeCount: number;
  voterId: string;
  choice: string;
  signedAt: Date;
}): string {
  return [
    'CIPANSOR-FOUNDATION-V1',
    params.decisionId,
    params.organType,
    params.kind,
    params.decisionType,
    params.subject,
    sha256hex(params.body),
    params.createdAt.toISOString(),
    String(params.activeCount),
    params.voterId,
    params.choice,
    params.signedAt.toISOString(),
  ].join('|');
}

/** Baris `userSigningKey` → bahan kriptografi yang dimengerti utils/esign. */
export function signingKeyToMaterial(key: {
  algorithm: string;
  publicKey: string;
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfParams: Prisma.JsonValue;
  iv: string;
  authTag: string;
}): EncryptedKeyMaterial {
  return {
    algorithm: key.algorithm,
    publicKey: key.publicKey,
    encryptedPrivateKey: key.encryptedPrivateKey,
    kdfSalt: key.kdfSalt,
    kdfParams: key.kdfParams as unknown as ScryptParams,
    iv: key.iv,
    authTag: key.authTag,
  };
}

/**
 * Catat kunci publik yang dipakai menandatangani ke riwayat append-only, dan
 * kembalikan rekamannya.
 *
 * `UserSigningKey` dihapus saat kunci diterbitkan ulang, sehingga riwayat inilah
 * satu-satunya tempat tepercaya untuk memverifikasi suara setelah rotasi.
 * `upsert` pada `(userId, fingerprint)` membuatnya idempoten. Pencabutan berlaku
 * untuk masa depan: rekaman lama TIDAK dicabut di sini agar suara yang sudah sah
 * tetap terverifikasi; hak menandatangani baru sudah ditegakkan `assertCanSign`.
 */
export async function ensureSigningKeyHistory(
  client: DbClient,
  key: { userId: string; algorithm: string; publicKey: string }
): Promise<UserSigningKeyHistory> {
  const fingerprint = publicKeyFingerprint(key.publicKey);
  return client.userSigningKeyHistory.upsert({
    where: { userId_fingerprint: { userId: key.userId, fingerprint } },
    create: {
      userId: key.userId,
      algorithm: key.algorithm,
      publicKey: key.publicKey,
      fingerprint,
    },
    update: {},
  });
}

/** Alasan penolakan suara karena kunci bergerak di tengah penandatanganan. */
export const SIGNING_KEY_CONTENDED =
  'Kunci tanda tangan Anda berubah atau tidak lagi berlaku saat suara diproses. Silakan coba lagi dengan kunci terkini.';

/**
 * Buktikan ULANG, di dalam transaksi suara, bahwa kunci yang benar-benar
 * menandatangani masih kunci yang berlaku bagi pemiliknya.
 *
 * TOCTOU: antara pembacaan kunci oleh `castVote` dan `INSERT` suara, jalur lain
 * dapat merotasi/mencabut kunci (di transaksi terpisah). Bila rotasi menang,
 * suara yang terlanjur ditulis ditolak `isVoteAuthentic` — ia tidak masuk rekap
 * tetapi barisnya tetap ada, dan percobaan ulang ditolak "sudah memberikan
 * suara". Ini cukup tanpa lock baru karena segmen kritis rotasi/pencabutan
 * masing-masing satu transaksi, sehingga pembacaan ulang melihat keadaan SEBELUM
 * atau SESUDAH, bukan di tengah. `signedAt` ditetapkan sebelum penandatanganan
 * agar cap rotasi yang datang kemudian tidak mendahuluinya. Lihat §7.2 dokumen
 * review untuk rationale lengkap.
 */
async function assertSigningKeyStillCurrent(
  tx: DbClient,
  userId: string,
  material: { publicKey: string; algorithm: string },
  signedAt: Date
): Promise<void> {
  const current = await tx.userSigningKey.findUnique({ where: { userId } });
  if (!current) throw Errors.conflict(SIGNING_KEY_CONTENDED);

  // Kunci pada baris kunci harus kunci yang SAMA dengan yang menandatangani.
  if (
    signingKeyToMaterial(current).publicKey !== material.publicKey ||
    current.algorithm !== material.algorithm
  ) {
    throw Errors.conflict(SIGNING_KEY_CONTENDED);
  }

  // Riwayat tepercaya: barisnya harus sudah ada (kita baru meng-upsert di luar
  // transaksi), dimiliki pemilih yang sama, fingerprint-nya cocok, dan kunci
  // masih berlaku pada `signedAt`. Rotasi/pencabutan yang commit di sela-sela
  // membuat salah satu syarat ini gagal.
  const fingerprint = publicKeyFingerprint(material.publicKey);
  const record = await tx.userSigningKeyHistory.findUnique({
    where: { userId_fingerprint: { userId, fingerprint } },
  });
  if (!record) throw Errors.conflict(SIGNING_KEY_CONTENDED);
  if (!keyUsableAt(record, signedAt)) throw Errors.conflict(SIGNING_KEY_CONTENDED);
}

/**
 * Hitung ulang digest kanonis yang SEHARUSNYA untuk sebuah suara.
 *
 * Dipakai dua arah: saat suara ditulis (castVote) dan saat suara diperiksa
 * ulang sebelum dihitung ke kuorum. Satu definisi, supaya pemeriksaan tidak
 * pernah bisa menyimpang dari penulisan.
 */
export function canonicalDigestForVote(
  d: DecisionSignatureContext,
  vote: { userId: string; choice: string; signedAt: Date }
): string {
  const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
  return sha256hex(
    canonicalDecisionPayload({
      decisionId: d.id,
      organType: d.organType,
      kind: d.kind,
      decisionType: d.decisionType,
      subject: d.subject,
      body: d.body,
      createdAt: d.createdAt,
      activeCount: snapshot.activeCount,
      voterId: vote.userId,
      choice: vote.choice,
      signedAt: vote.signedAt,
    })
  );
}

/**
 * Benarkah baris suara ini benar-benar ditandatangani anggota tersebut?
 *
 * Mengikat sekaligus: pemilih adalah anggota organ pada SNAPSHOT terkunci;
 * `canonicalDigest` tersimpan sama dengan digest yang dihitung ULANG dari isi
 * keputusan + pilihan + waktu tanda tangan; kunci yang memverifikasi menunjuk
 * rekaman `user_signing_key_history` milik pemilih yang SAMA dengan fingerprint
 * yang cocok; dan `signature` benar atas digest itu menurut kunci tepercaya
 * tersebut. Butir ketiga adalah intinya — memakai `vote.publicKey` sebagai kunci
 * yang memverifikasi membuat siapa pun yang dapat menulis langsung ke tabel suara
 * dapat menyisipkan pasangan kunci karangan dan meloloskan suara palsu hingga
 * memicu e-seal (lihat §7.1 dokumen review). Baris yang gagal TIDAK dihitung ke
 * kuorum.
 */
export function isVoteAuthentic(d: DecisionSignatureContext, vote: VoteSignatureRecord): boolean {
  if (!d.members.some((m) => m.userId === vote.userId)) return false;
  if (!vote.canonicalDigest || !vote.signature || !vote.publicKey) return false;
  // `signedAt` termasuk dalam payload kanonis; baris tanpa waktu tanda tangan
  // tidak dapat diverifikasi dan karena itu tidak dihitung.
  if (!vote.signedAt) return false;

  const trusted = trustedKeyForVote(d, vote);
  if (!trusted) return false;
  // Kunci yang tercatat pada baris suara harus kunci yang sama dengan rekaman
  // tepercaya. Baris dengan fingerprint yang tidak cocok dengan kuncinya
  // sendiri (mis. fingerprint ditulis ulang) tertangkap di sini.
  if (trusted.publicKey !== vote.publicKey) return false;

  let expected: string;
  try {
    expected = canonicalDigestForVote(d, vote);
  } catch {
    return false;
  }
  if (expected !== vote.canonicalDigest) return false;
  return verifyPdfHashSignature(trusted.publicKey, vote.canonicalDigest, vote.signature);
}

/**
 * Apakah rekaman kunci berhak menandatangani pada `at`?
 *
 * Tiga aturan terhadap `vote.signedAt` (bukan hari ini), lihat §7.3 dokumen
 * review: tanda tangan sebelum `issuedAt` mustahil; pada/di setelah `revokedAt`
 * atau `supersededAt` ditolak sebagai tanda tangan BARU. Suara historis tetap
 * sah; `signedAt` termasuk payload kanonis sehingga penyerang tidak dapat
 * memindah-mundurkannya tanpa memalsukan tanda tangan.
 */
function keyUsableAt(record: UserSigningKeyHistory, at: Date): boolean {
  if (at < record.issuedAt) return false;
  if (record.revokedAt && at >= record.revokedAt) return false;
  if (record.supersededAt && at >= record.supersededAt) return false;
  return true;
}

/**
 * Apakah rekaman kunci berhak menandatangani pada `at`? Diekspor untuk test.
 */
export const keyUsableAtForTest = keyUsableAt;

/**
 * Rekaman kunci tepercaya yang berhak menandatangani atas nama pemilih ini.
 *
 * Pencocokan dilakukan pada TIGA hal sekaligus — id rekaman, pemiliknya, dan
 * fingerprint-nya — supaya baris yang menunjuk rekaman orang lain, atau
 * rekaman yang fingerprint-nya tidak cocok dengan kuncinya, tidak pernah lolos.
 * Mengembalikan `null` bila tidak ada yang cocok; pemanggil memperlakukannya
 * sebagai TIDAK sah (fail closed), termasuk untuk suara lama sebelum migrasi
 * yang `signingKeyId`-nya masih kosong.
 */
export function trustedKeyForVote(
  d: DecisionSignatureContext,
  vote: VoteSignatureRecord
): UserSigningKeyHistory | null {
  if (!vote.signingKeyId || !vote.publicKeyFingerprint) return null;
  // Relasi inilah satu-satunya sumber kunci: kunci pada baris suara tidak
  // pernah dipercaya sebelum cocok dengan rekaman ini. Belum dimuat / tidak
  // ada → TIDAK sah (fail closed).
  const record = vote.signingKey;
  if (!record || record.id !== vote.signingKeyId) return null;
  if (record.userId !== vote.userId) return null;
  if (record.fingerprint !== vote.publicKeyFingerprint) return null;
  if (publicKeyFingerprint(record.publicKey) !== vote.publicKeyFingerprint) return null;
  // Daur hidup kunci: tanda tangan harus berada DI DALAM masa berlaku rekaman.
  // Tanpa ini, kunci yang dicabut/digantikan tetap dianggap sah untuk setiap
  // suara yang menunjuknya, sehingga pencabutan dan rotasi tidak mengikat.
  if (!keyUsableAt(record, vote.signedAt)) return null;
  return record;
}

type VoteWithUser = FoundationDecisionVote & { user: { id: string; name: string } };
type MemberWithUser = FoundationDecisionMember & { user: { id: string; name: string } };

/**
 * Urutkan anggota snapshot secara DETERMINISTIK, apa pun urutan relasi yang
 * dikembalikan Prisma/PostgreSQL.
 *
 * Kebenaran sidik jari dan byte PDF tidak boleh bergantung pada urutan fisik
 * baris: dua pembacaan yang setara dapat datang dalam urutan berbeda, dan
 * urutan yang berbeda membuat `approvalFingerprint` berbeda sehingga artefak
 * yang sebenarnya masih sah ditolak sebagai basi. `decisionInclude` sudah
 * meminta `orderBy`; fungsi ini adalah jaring kedua di jalur digest. Tie-break
 * memakai jabatan, lalu `roleCode`, lalu `userId` yang unik — bukan nama.
 */
export function canonicalMembersOf<T extends { userId: string; roleCode: string }>(
  organType: FoundationOrganType,
  members: readonly T[]
): T[] {
  return [...members].sort((a, b) => {
    const roleRank = (roleCode: string) => rolePriorityForOrgan(organType, roleCode);
    const rank = roleRank(a.roleCode) - roleRank(b.roleCode);
    if (rank !== 0) return rank;
    if (a.roleCode !== b.roleCode) return a.roleCode < b.roleCode ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

/**
 * Bentuk ringkas suara yang sah, untuk evaluasi kuorum.
 *
 * Dipakai bersama oleh jalur suara (castVote) dan jalur finalisasi/verifikasi
 * supaya keduanya menghitung rekap dari himpunan suara yang sama persis —
 * inilah yang mencegah PDF final mencetak rekap yang berbeda dari basis data.
 */
function voteSummaryOf(
  authentic: ReadonlyArray<{ choice: string }>,
  activeCount: number
): VoteSummary {
  return {
    approve: authentic.filter((v) => v.choice === 'APPROVE').length,
    reject: authentic.filter((v) => v.choice === 'REJECT').length,
    abstain: authentic.filter((v) => v.choice === 'ABSTAIN').length,
    present: authentic.length,
    active: activeCount,
    totalVotes: authentic.length,
  };
}

/**
 * Sidik jari isi yang DICETAK ke PDF final: naskah, anggota, dan suara yang
 * sah. Dipakai untuk memastikan artefak yang dirender di luar kunci masih
 * cocok ketika kunci diperoleh — bila seorang pemilih lain menyisipkan suara
 * di sela-selanya, sidik jarinya berbeda, artefak dibuang, dan seluruh
 * percobaan diulang dengan artefak yang dihitung dari baris segar.
 *
 * Rekap suara (`voteSummary`) ikut diikat, bukan hanya daftar suara. Tanpa itu,
 * artefak preview yang dirender SEBELUM suara penentu dapat dinyatakan masih
 * cocok ketika suara itu masuk — sidik jarinya sama, tetapi PDF-nya mencetak
 * rekap yang sudah usang, sedangkan basis data menyimpan rekap yang baru.
 */
function approvalFingerprint(d: RichDecision): string {
  const authentic = d.votes.filter((v) => isVoteAuthentic(d, v));
  const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
  // Anggota DAN suara dikanonikalisasi sebelum diikat: urutan relasi bukan
  // bagian dari isi keputusan, jadi dua pembacaan ekuivalen harus menghasilkan
  // sidik jari yang sama. Suara diurutkan lewat kunci `userId` yang unik.
  const members = canonicalMembersOf(d.organType, d.members).map((m) => m.userId);
  return sha256hex(
    JSON.stringify({
      id: d.id,
      subject: d.subject,
      body: d.body,
      decisionType: d.decisionType,
      members,
      votes: authentic.map((v) => `${v.userId}:${v.canonicalDigest}`).sort(),
      voteSummary: voteSummaryOf(authentic, snapshot.activeCount),
    })
  );
}

/**
 * Sinyal internal: artefak persetujuan yang disiapkan di luar kunci sudah tidak
 * cocok dengan baris terkunci (pemilih lain menyisipkan suara, atau rekapnya
 * berubah), sehingga transaksi dibatalkan dan pemanggil mengulang dengan baris
 * segar.
 *
 * Ini yang memindahkan render PDF + scrypt (e-seal) keluar dari
 * `SELECT … FOR UPDATE`: jalur yang memegang kunci melempar, bukan merender.
 */
class StaleArtifactError extends Error {
  constructor() {
    super('stale approval artifact');
  }
}

/** Bagian keputusan yang dibutuhkan untuk memeriksa keaslian sebuah suara. */
interface DecisionSignatureContext {
  id: string;
  organType: string;
  kind: string;
  decisionType: string;
  subject: string;
  body: string;
  createdAt: Date;
  quorumSnapshot: unknown;
  members: Array<{ userId: string }>;
}

/** Baris suara yang diperiksa keasliannya. */
interface VoteSignatureRecord {
  userId: string;
  choice: string;
  canonicalDigest: string;
  signature: string;
  publicKey: string;
  signedAt: Date;
  /** Rekaman kunci tepercaya yang menandatangani suara ini. */
  signingKeyId: string | null;
  /** SHA-256(publicKey) yang tercatat pada baris suara. */
  publicKeyFingerprint: string | null;
  /**
   * Relasi `user_signing_key_history` yang dimuat bersama baris suara.
   *
   * Rekaman ini datang dari basis data lewat relasi, sama tepercayanya dengan
   * query apa pun; parameternya opsional supaya pemanggil yang tidak memuat
   * relasi tetap aman — absennya berarti TIDAK sah.
   */
  signingKey?: UserSigningKeyHistory | null;
}

/**
 * Artefak persetujuan yang MAHAL: PDF final, hash byte-nya, dan e-seal atas
 * hash itu.
 *
 * Dipisahkan dari penulisan status supaya pembuatan PDF + pembukaan kunci
 * e-seal (scrypt) dapat dikerjakan DI LUAR kunci baris keputusan — scrypt di
 * dalam kunci memperpanjang lockout baris dan memblokir suara anggota lain.
 * `fingerprint` mengikat artefak ke isi keputusan + himpunan suara yang
 * dirender; bila di dalam kunci ternyata himpunannya berbeda (pemilih lain
 * masuk di sela-sela), `applyLocked` melempar `StaleArtifactError` dan
 * pemanggil mengulang di luar kunci — jadi pemisahan ini tidak melonggarkan
 * jaminan apa pun tanpa menahan kunci selama render/scrypt.
 */
interface ApprovalArtifact {
  fingerprint: string;
  buf: Buffer;
  finalPdfDigest: string;
  seal: FoundationEseal;
  sealSignature: string;
  decidedAt: Date;
}
type RichDecision = FoundationDecision & {
  members: MemberWithUser[];
  votes: VoteWithTrustedKey[];
  createdBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
  document: { id: string } | null;
};

/** Relasi kunci tepercaya yang ikut dimuat bersama setiap baris suara. */
const trustedKeySelect = {
  id: true,
  userId: true,
  algorithm: true,
  publicKey: true,
  fingerprint: true,
  issuedAt: true,
  supersededAt: true,
  revokedAt: true,
} satisfies Prisma.UserSigningKeyHistorySelect;

type VoteWithTrustedKey = VoteWithUser & { signingKey: UserSigningKeyHistory | null };
/** Suara apa adanya dari query verifikasi: relasi kunci ada, relasi `user` tidak perlu. */
type VoteWithTrustedKeyOnly = FoundationDecisionVote & {
  signingKey: UserSigningKeyHistory | null;
};

const decisionInclude = {
  members: {
    include: { user: { select: { id: true, name: true } } },
    // Urutan DETERMINISTIK. `approvalFingerprint` mengikat urutan `userId`
    // anggota dan `renderPdf` mencetak roster dalam urutan ini; tanpa
    // `orderBy`, rencana query PostgreSQL bebas mengembalikannya dalam urutan
    // fisik berbeda antar-pembacaan, sehingga sidik jari berubah dan finalisasi
    // gagal basi. Tie-break `userId` unik menstabilkan jabatan yang sama.
    orderBy: [{ roleCode: 'asc' as const }, { userId: 'asc' as const }],
  },
  votes: {
    include: {
      user: { select: { id: true, name: true } },
      signingKey: { select: trustedKeySelect },
    },
    // `id` adalah tie-break: `signedAt` dapat kembar (dua suara pada milidetik
    // yang sama) dan urutan relasi yang tidak stabil akan mengubah PDF.
    orderBy: [{ signedAt: 'asc' as const }, { id: 'asc' as const }],
  },
  createdBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  // Keberadaan arsip PDF final menentukan `publishable` (dan syarat publish
  // di `setPublication`). Hanya `id` yang dipilih — byte PDF tidak pernah
  // ikut ke DTO detail.
  document: { select: { id: true } },
} satisfies Prisma.FoundationDecisionInclude;

type Actor = { id: string; roleCode: string };
/** Klien Prisma di dalam transaksi interaktif (atau prisma itu sendiri). */
type DbClient = Prisma.TransactionClient;

/**
 * Peran yang boleh MEM-FINALISASI keputusan organ MANA PUN hidup di
 * `utils/foundation-authority.ts` (`FOUNDATION_FINALIZE_ANY_ROLES`) bersama
 * `canFinalizeDecision`, satu definisi untuk route, service, dan DTO detail.
 */

/**
 * Bentuk DTO verifikasi saat tidak ada yang dapat dinyatakan.
 *
 * Fungsi, bukan konstanta: sebuah objek yang dibagikan lalu disebar oleh
 * pemanggil akan tetap terlihat sama, tetapi nilai `null`-nya mudah tertukar
 * dengan "belum diperiksa" pada pemakaian berikutnya.
 */
function emptyVerification(reason: string | null = null): FoundationDecisionVerificationDTO {
  return {
    found: false,
    isValid: false,
    decisionId: null,
    publication: null,
    subject: null,
    organType: null,
    kind: null,
    status: null,
    decidedAt: null,
    digest: null,
    archiveDigest: null,
    digestOk: null,
    sealVerified: null,
    reason,
    voteCount: 0,
    approveCount: 0,
    rejectCount: 0,
    abstainCount: 0,
  };
}

const SEAL_PASSPHRASE = config.foundation.esealPassphrase;

function sealMaterial(seal: FoundationEseal): EncryptedKeyMaterial {
  return toSealMaterial(seal);
}

/**
 * Pastikan e-seal Yayasan yang AKTIF dan DAPAT DIPAKAI tersedia; buat satu
 * baris bila belum ada.
 *
 * Kandidat disaring dengan probe kemampuan menandatangani memakai passphrase
 * SEKARANG: pasca rotasi, seal lama masih `revokedAt: null` tetapi kuncinya
 * tersegel dengan passphrase lama. **Invariant satu seal aktif ditegakkan basis
 * data** lewat indeks unik parsial `foundation_eseals_single_active_key`;
 * find-then-create di bawah memiliki balapan nyata (dua approval paralel).
 * Lihat §7.4 dokumen review.
 */
async function ensureSeal(client: DbClient = prisma): Promise<FoundationEseal> {
  const candidates = await client.foundationEseal.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const usable = candidates.find((seal) => sealCanSign(sealMaterial(seal), SEAL_PASSPHRASE));
  if (usable) return usable;

  // Tidak ada seal aktif yang dapat dipakai: setelah rotasi passphrase, seal
  // lama masih `revokedAt: null` tetapi kunci privatnya tersegel dengan
  // passphrase lama. Seal itu harus DICABUT lebih dulu — bukan sekadar
  // dilewati. Indeks unik parsial hanya mengizinkan SATU baris aktif, jadi
  // membiarkannya aktif membuat `create` di bawah selalu ditolak P2002 dan
  // jalur "baca ulang pemenangnya" mengembalikan seal yang tak dapat
  // ditandatangani — approval baru gagal 500 selamanya setelah rotasi.
  // Pencabutan di sini tidak merusak keputusan lama: verifikasi memakai kunci
  // PUBLIK yang tercatat di baris keputusan, bukan seal aktif.
  if (candidates.length > 0) {
    await client.foundationEseal.updateMany({
      where: { id: { in: candidates.map((s) => s.id) }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const material = createSealMaterial(SEAL_PASSPHRASE);
  try {
    return await client.foundationEseal.create({
      data: {
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        encryptedPrivateKey: material.encryptedPrivateKey,
        kdfSalt: material.kdfSalt,
        kdfParams: material.kdfParams as unknown as Prisma.InputJsonValue,
        iv: material.iv,
        authTag: material.authTag,
        activatedAt: new Date(),
      },
    });
  } catch (err) {
    // Balapan dengan approval paralel: pemenangnya sudah menulis seal aktif,
    // sehingga insert ini ditolak indeks unik parsial. Baca ulang pemenangnya
    // dan pakai itu — jangan menerbitkan seal kedua. Bila pemenangnya justru
    // tidak dapat dipakai (mis. ia seal lama yang baru saja lolos dari
    // pencabutan), ulangi sekali: cabut lalu terbitkan.
    if (isUniqueConstraintError(err)) {
      const winner = await client.foundationEseal.findFirst({
        where: { revokedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (winner && sealCanSign(sealMaterial(winner), SEAL_PASSPHRASE)) return winner;
      if (winner) {
        await client.foundationEseal.updateMany({
          where: { id: winner.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return client.foundationEseal.create({
          data: {
            algorithm: material.algorithm,
            publicKey: material.publicKey,
            encryptedPrivateKey: material.encryptedPrivateKey,
            kdfSalt: material.kdfSalt,
            kdfParams: material.kdfParams as unknown as Prisma.InputJsonValue,
            iv: material.iv,
            authTag: material.authTag,
            activatedAt: new Date(),
          },
        });
      }
    }
    throw err;
  }
}

/** Benarkah galat ini pelanggaran keunikan Prisma (P2002)? */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/**
 * Kunci baris keputusan selama transaksi.
 *
 * Tanpa ini, dua permintaan suara paralel dapat sama-sama membaca status
 * VOTING, lalu salah satunya menutup keputusan setelah yang lain menghitung
 * kuorum — sehingga suara yang sah tidak pernah masuk ke PDF final.
 *
 * URUTAN KUNCI (global, mencegah deadlock): (1) tabel
 * `foundation_decision_rules`, (2) baris `foundation_decisions` di sini,
 * (3) `user_role_assignments` → `roles` → `users` saat snapshot, (4) baris
 * `users` aktor. Semua jalur foundation memakai urutan ini; `upsertRule`
 * (1→4) dan `create` (1→3→4) tidak pernah berputar, dan mengambil 4 sebelum 1
 * DILARANG. Rinciannya di dokumen review §7.11.
 */
async function lockDecision(client: DbClient, id: string): Promise<void> {
  await client.$executeRaw`SELECT id FROM foundation_decisions WHERE id = ${id} FOR UPDATE`;
}

/**
 * Kunci baris `users` aktor (`FOR SHARE`), lalu PASTIKAN akunnya masih aktif
 * dan belum dihapus — DI DALAM transaksi, sebelum aksi tata kelola ditulis.
 *
 * Snapshot immutable menjawab "siapa yang berhak saat keputusan dibuka", bukan
 * "siapa yang masih boleh bertindak sekarang": anggota yang dinonaktifkan atau
 * dihapus tetap tercatat pada snapshot dan tanpa pemeriksaan ini masih dapat
 * menandatangani suara serta memicu e-seal Yayasan.
 *
 * `FOR SHARE`, bukan `FOR UPDATE`: kunci bersama sudah menahan `UPDATE users`
 * milik deaktivasi/soft-delete, sedangkan `FOR UPDATE` membuka deadlock karena
 * `create` sudah memegang `FOR SHARE` atas baris seluruh anggota. Token akses
 * stateless tak dapat dicabut, jadi pemeriksaan inilah yang menutupnya (§7.10).
 */
async function assertUserActiveInTx(client: DbClient, userId: string): Promise<void> {
  const rows = await client.$queryRaw<Array<{ is_active: boolean; deleted_at: Date | null }>>`
    SELECT "is_active", "deleted_at" FROM "users" WHERE "id" = ${userId} FOR SHARE`;
  const row = rows[0];
  if (!row || !row.is_active || row.deleted_at !== null) {
    throw Errors.forbidden(
      'Akun Anda tidak aktif atau telah dihapus, sehingga tidak dapat melakukan tindakan tata kelola ini.'
    );
  }
}

/**
 * Buktikan, DI DALAM transaksi dan di bawah kunci yang SAMA dengan mutasi
 * penugasan, bahwa aktor masih memegang penugasan organ yang SAAT INI aktif.
 *
 * Snapshot immutable menjawab "siapa yang berhak saat keputusan dibuka",
 * BUKAN "siapa yang masih berhak memilih sekarang". Mantan anggota yang
 * perannya dicabut/dinonaktifkan/kedaluwarsa, atau akunnya dinonaktifkan/
 * dihapus, tetap tercatat pada snapshot — tanpa pemeriksaan ini mereka masih
 * dapat menandatangani suara yang terhitung ke kuorum dan memicu e-seal.
 *
 * Urutan kunci sama dengan `create`/`castVote` (tabel penugasan → baris
 * `roles` → baris `users`): pencabutan peran konkuren ditunggu sampai
 * transaksi ini melihat hasil finalnya, jadi tidak ada TOCTOU.
 */
async function assertActorHasCurrentOrganAssignmentInTx(
  client: DbClient,
  userId: string,
  organType: FoundationOrganType
): Promise<void> {
  // Urutan kunci mengikuti protokol global (lihat `LOCK ORDER` di `lockDecision`):
  // tabel penugasan → baris `roles` → baris `users`. `create` memakai urutan
  // yang sama, jadi keduanya tidak dapat saling menunggu.
  await lockAssignmentTableForSnapshot(client);
  await lockOrganRoleRowsForSnapshot(client, organType);
  // Sekaligus mengunci baris `users` aktor (`FOR SHARE`) dan menolak akun yang
  // tidak aktif/di-soft-delete — pemeriksaan hidup akun yang sama dengan
  // tindakan tata kelola lain, kini selalu menyertai hak suara.
  await assertUserActiveInTx(client, userId);

  const current = await client.userRoleAssignment.findFirst({
    where: {
      userId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      role: { isActive: true, code: { in: roleCodesForOrgan(organType) } },
    },
    select: { id: true },
  });
  if (!current) {
    throw Errors.forbidden(
      'Anda tidak lagi memegang peran organ yang aktif pada keputusan ini, sehingga tidak dapat memberikan suara.'
    );
  }
}

/**
 * Serialisasi pembuatan keputusan terhadap SETIAP perubahan aturan kuorum.
 *
 * Bila `upsertRule` commit di sela antara pembacaan aturan dan commit `create`,
 * keputusan membekukan ambang yang SUDAH DIGANTI — dan ambang itulah yang
 * mengesahkan keputusan ber-e-seal. `LOCK TABLE … SHARE ROW EXCLUSIVE`
 * berbenturan dengan `ROW EXCLUSIVE` milik setiap INSERT/UPDATE/DELETE,
 * termasuk baris aturan yang BELUM ada (yang tak dapat ditahan `FOR UPDATE`
 * mana pun); `upsertRule` mengambil kunci yang sama sehingga kedua jalur
 * memakai satu protokol. `lock_timeout` membuat penunggu yang kehabisan waktu
 * gagal `55P03` → 409, bukan menggantung.
 */
export async function lockRuleTableForSnapshot(client: DbClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
  await client.$executeRaw`LOCK TABLE "foundation_decision_rules" IN SHARE ROW EXCLUSIVE MODE`;
}

/**
 * Serialisasi seluruh mutasi penugasan peran, lalu baca ULANG himpunan anggota
 * organ secara LENGKAP.
 *
 * `create` membaca penugasan SEBELUM transaksi; di sela itu penugasan dapat
 * ditambah, dicabut, atau diubah. `FOR UPDATE` atas ID hasil pembacaan awal
 * TIDAK cukup — ia tidak mengunci baris yang belum ada, sehingga pengangkatan
 * yang commit di sela lolos dan kuorum dihitung di atas anggota yang terlalu
 * sedikit. Kunci LEVEL TABEL `SHARE ROW EXCLUSIVE` berbenturan dengan
 * `ROW EXCLUSIVE` milik setiap INSERT/UPDATE/DELETE (termasuk baris BARU),
 * sehingga semua mutasi konkuren menunggu dan snapshot selalu linier. Baca
 * ulang memakai predikat penuh agar anggota baru ikut dibandingkan. Detail:
 * `docs/REVIEW_GEMINI_RISALAH_DIGITAL_SIGNATURE.md` §7.9.
 */
async function lockAndRereadOrganAssignments(
  client: DbClient,
  organType: FoundationOrganType
): Promise<
  Array<{
    id: string;
    userId: string;
    isPrimary: boolean;
    user: { id: string; name: string };
    role: { code: string };
  }>
> {
  await lockAssignmentTableForSnapshot(client);
  // Peran yang dinonaktifkan juga mengeluarkan anggotanya, dan `roles.isActive`
  // tidak tersentuh kunci tabel penugasan. Kunci baris peran organ `FOR SHARE`
  // agar perubahan `isActive` menunggu sampai snapshot commit — baca ulang di
  // bawah akan melihat nilai terbaru, bukan nilai sebelum lock.
  await lockOrganRoleRowsForSnapshot(client, organType);
  // Kunci baris `users` anggota organ `FOR SHARE`, LANGSUNG dari penugasan yang
  // sah (satu query, bukan baca-lalu-kunci). Deaktivasi/soft-delete akun TIDAK
  // menyentuh `user_role_assignments`, jadi kunci tabel di atas melewatkannya:
  // tanpa kunci baris ini, anggota yang dinonaktifkan tepat sebelum commit
  // tetap membeku di snapshot beserta hak suaranya. `FOR SHARE` membuat
  // `UPDATE users` menunggu, dan baca ulang di bawah melihat status terbaru —
  // perbedaannya ditangkap `assertSnapshotStillMatches`.
  await lockOrganMemberRowsForSnapshot(client, organType);
  return client.userRoleAssignment.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      role: { code: { in: roleCodesForOrgan(organType) }, isActive: true },
      user: { isActive: true, deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      isPrimary: true,
      user: { select: { id: true, name: true } },
      role: { select: { code: true } },
    },
  });
}

/**
 * Ambil kunci serialisasi tabel penugasan peran, menyerialkan `create` terhadap
 * SETIAP mutasi `user_role_assignments` (INSERT, UPDATE, DELETE).
 *
 * `SHARE ROW EXCLUSIVE` berbenturan dengan `ROW EXCLUSIVE` yang dipegang
 * otomatis oleh setiap penulisan baris — termasuk `INSERT` baris yang belum ada
 * — sehingga tidak ada penugasan baru yang dapat commit di sela pembacaan
 * snapshot dan komitnya; `FOR UPDATE` atas baris hasil pembacaan awal tidak
 * sanggup itu. `lock_timeout` 5 detik dipasang lokal ke transaksi: penunggu yang
 * kehabisan waktu gagal 55P03 (dipetakan ke 409) alih-alih menggantung.
 * `lock_timeout` tidak membatalkan transaksi, berbeda dengan
 * `statement_timeout`. Terverifikasi di PostgreSQL nyata: kunci yang ditahan 20
 * detik tetap berakhir dengan 55P03, bukan timeout transaksi Prisma.
 */
export async function lockAssignmentTableForSnapshot(client: DbClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
  await client.$executeRaw`LOCK TABLE "user_role_assignments" IN SHARE ROW EXCLUSIVE MODE`;
}

/**
 * Kunci baris `roles` organ `FOR SHARE` selama snapshot dibentuk.
 *
 * `roles.isActive` dapat dimatikan kapan saja lewat `PUT /roles/:id`, dan itu
 * mengeluarkan seluruh pemegang peran tersebut dari daftar anggota organ —
 * namun perubahan itu TIDAK menyentuh `user_role_assignments`, sehingga kunci
 * tabel penugasan tidak menahannya. `FOR SHARE` membuat `UPDATE roles` yang
 * konkuren menunggu sampai transaksi snapshot commit, lalu baca ulang di
 * `lockAndRereadOrganAssignments` melihat `is_active = false` dan membatalkan
 * pembuatan dengan konflik yang dapat diulang. `FOR SHARE` (bukan `FOR UPDATE`)
 * karena snapshot hanya perlu menahan penulis.
 */
async function lockOrganRoleRowsForSnapshot(
  client: DbClient,
  organType: FoundationOrganType
): Promise<void> {
  const codes = roleCodesForOrgan(organType);
  if (codes.length === 0) return;
  await client.$queryRaw`
    SELECT id FROM "roles" WHERE code IN (${Prisma.join(codes)}) ORDER BY id FOR SHARE`;
}

/**
 * Kunci baris `users` anggota organ `FOR SHARE` selama snapshot dibentuk.
 *
 * Deaktivasi (`is_active = false`) dan soft-delete (`deleted_at`) TIDAK
 * menyentuh `user_role_assignments`, sehingga kunci tabel penugasan di atas
 * melewatkannya: anggota yang dinonaktifkan tepat sebelum `create` commit tetap
 * membeku di snapshot beserta hak suaranya. `FOR SHARE` membuat `UPDATE users`
 * menunggu, dan baca ulang setelah kunci melihat status terbaru. Urutan id
 * eksplisit (`ORDER BY id`) mencegah deadlock antar dua snapshot organ yang
 * beririsan. Penugasan non-aktif sengaja diikutkan demi himpunan kunci stabil.
 */
async function lockOrganMemberRowsForSnapshot(
  client: DbClient,
  organType: FoundationOrganType
): Promise<void> {
  const codes = roleCodesForOrgan(organType);
  if (codes.length === 0) return;
  await client.$queryRaw`
    SELECT u.id FROM "users" u
    JOIN "user_role_assignments" a ON a."user_id" = u.id
    JOIN "roles" r ON r.id = a."role_id"
    WHERE r.code IN (${Prisma.join(codes)})
    ORDER BY u.id FOR SHARE OF u`;
}

/**
 * True bila galat adalah lock_timeout atau deadlock PostgreSQL.
 *
 * SQLSTATE-nya TIDAK selalu di `err.code`: dengan driver adapter
 * (`@prisma/adapter-pg`) Prisma membungkus galat PostgreSQL menjadi
 * `PrismaClientKnownRequestError` berkode `P2010` dan menyimpan kode aslinya di
 * `meta.driverAdapterError.cause.originalCode`. Memeriksa `err.code` saja
 * membuat lock_timeout lolos sebagai 500, bukan 409. Pohon galatnya ditelusuri
 * (dengan batas kedalaman) agar kedua bentuk tertangkap.
 */
const LOCK_CONFLICT_SQLSTATES = new Set(['55P03', '40P01']);

export function isLockConflictError(err: unknown): boolean {
  const seen = new Set<unknown>();
  const scan = (node: unknown, depth: number): boolean => {
    if (depth > 6 || !node || typeof node !== 'object' || seen.has(node)) return false;
    seen.add(node);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        (key === 'code' || key === 'originalCode') &&
        typeof value === 'string' &&
        LOCK_CONFLICT_SQLSTATES.has(value)
      ) {
        return true;
      }
      if (scan(value, depth + 1)) return true;
    }
    return false;
  };
  return scan(err, 0);
}

/**
 * Bandingkan hasil susutan pra-transaksi dengan hasil baca ulang pasca-lock.
 *
 * Dibandingkan hasil `selectSnapshotAssignments` — himpunan (userId, roleCode)
 * yang benar-benar masuk baris anggota — bukan penugasan mentah: mencabut peran
 * ganda yang kalah tidak mengubah roster, jadi membandingkan penugasan mentah
 * akan menghasilkan konflik palsu. Bila berbeda, `create` membatalkan
 * transaksinya: menulis snapshot basi berarti membekukan anggota yang telah
 * dicabut, atau menghilangkan anggota baru dari kuorum, pada keputusan
 * ber-e-seal.
 */
function assertSnapshotStillMatches(
  organType: FoundationOrganType,
  before: ReadonlyArray<{ userId: string; roleCode: string }>,
  after: ReadonlyArray<{ userId: string; roleCode: string }>
): void {
  const key = (a: { userId: string; roleCode: string }) => `${a.userId}\u0000${a.roleCode}`;
  const beforeKeys = before.map(key).sort();
  const afterKeys = after.map(key).sort();
  const same =
    beforeKeys.length === afterKeys.length && beforeKeys.every((k, i) => k === afterKeys[i]);
  if (!same) {
    throw Errors.conflict(
      `Keanggotaan organ ${organType} berubah saat keputusan dibuat. Silakan ulangi; snapshot anggota harus mencerminkan susunan yang sah saat pemungutan suara dibuka.`
    );
  }
}

/**
 * Catat percobaan passphrase gagal; dikunci setelah ambang esign tercapai.
 *
 * Penaikan dan penghitungan `locked_until` terjadi dalam SATU pernyataan SQL.
 * Bila keduanya dua pernyataan terpisah, pada kegagalan paralel penulis dengan
 * hitungan lebih rendah dapat menimpa lockout dengan `null` — kunci justru
 * terbuka tepat ketika ia seharusnya terkunci, dan tebakan passphrase kembali
 * gratis. Menghitung `locked_until` dari `failed_attempts + 1` di dalam basis
 * data menutup celah itu, karena setiap penulis memakai nilai barisnya sendiri,
 * bukan nilai yang dibaca sebelumnya.
 */
async function recordFailedAttempt(keyId: string): Promise<number> {
  await prisma.$executeRaw`
    UPDATE "user_signing_keys"
    SET "failed_attempts" = "failed_attempts" + 1,
        "locked_until" = CASE
          WHEN "failed_attempts" + 1 >= ${MAX_PASSPHRASE_ATTEMPTS}
            THEN NOW() + (${LOCKOUT_MINUTES} * INTERVAL '1 minute')
          ELSE "locked_until"
        END
    WHERE "id" = ${keyId}`;
  // Baca ulang nilai pasca-increment: pemanggil memakainya untuk memberi tahu
  // sisa percobaan, dan nilai itu harus yang benar-benar tersimpan.
  const updated = await prisma.userSigningKey.findUnique({ where: { id: keyId } });
  return updated?.failedAttempts ?? MAX_PASSPHRASE_ATTEMPTS;
}

/** Buka blokir setelah passphrase benar — penghitung kembali ke nol. */
async function clearFailedAttempts(keyId: string, client: DbClient = prisma): Promise<void> {
  await client.userSigningKey.update({
    where: { id: keyId },
    data: { failedAttempts: 0, lockedUntil: null, lastUsedAt: new Date() },
  });
}

/**
 * Selaraskan `value` sebuah aturan dengan `mode`-nya.
 *
 * `requiredCount` mengabaikan nilai pecahan tersimpan dan memakai
 * `quorumValueForMode(mode)`, tetapi halaman pengelolaan aturan menampilkan
 * `quorum*Value` apa adanya. Baris lama (atau yang disisipkan langsung ke basis
 * data) dapat memuat mode TWO_THIRDS dengan value 0.5. Normalisasi ini membuat
 * yang ditampilkan sama dengan yang dievaluasi, tanpa menyentuh basis data.
 */
export function normalizeRule(rule: FoundationDecisionRule): FoundationDecisionRule {
  // Sirkuler wajib mufakat: baris lama (atau sisipan langsung ke basis data)
  // yang menyimpan mode mayoritas untuk CIRCULAR ditampilkan DAN dievaluasi
  // sebagai MUTLAK. Penegakan ini sejalan dengan kontrak Zod
  // (`upsertFoundationRuleSchema`) dan migrasi normalisasi, sehingga tidak ada
  // jalur yang membuat aturan sirkuler non-mufakat tetap berlaku.
  if (rule.decisionKind === 'CIRCULAR') {
    return {
      ...rule,
      quorumPresentMode: FoundationQuorumMode.MUTLAK,
      quorumPresentValue: 1,
      quorumDecisionMode: FoundationQuorumMode.MUTLAK,
      quorumDecisionValue: 1,
    };
  }
  return {
    ...rule,
    quorumPresentMode: rule.quorumPresentMode,
    quorumPresentValue: quorumValueForMode(rule.quorumPresentMode),
    quorumDecisionMode: rule.quorumDecisionMode,
    quorumDecisionValue: quorumValueForMode(rule.quorumDecisionMode),
  };
}

/**
 * Paksa aturan sirkuler menjadi mufakat sebelum disimpan.
 *
 * Kontrak Zod sudah menolak mode non-MUTLAK untuk CIRCULAR di edge, tetapi
 * service juga harus aman bila dipanggil internal tanpa validasi edge.
 */
function normalizeRuleInput(input: UpsertFoundationRuleInput): UpsertFoundationRuleInput {
  if (input.decisionKind !== 'CIRCULAR') return input;
  return {
    ...input,
    quorumPresentMode: FoundationQuorumMode.MUTLAK,
    quorumPresentValue: 1,
    quorumDecisionMode: FoundationQuorumMode.MUTLAK,
    quorumDecisionValue: 1,
  };
}

/**
 * Mesin keputusan organ yayasan. Prisma hanya disentuh di sini.
 *
 * Audit ditulis langsung ke `auditLog` — BUKAN lewat eventBus — dan itu
 * disengaja. Aturan eventBus di AGENTS.md mengatur komunikasi ANTAR-MODUL;
 * `auditLog` adalah tabel bersama yang ditulis di tempat oleh setiap modul
 * (esign, finance, procurement), dan baris audit harus IKUT ROLLBACK bersama
 * transaksi yang dicatatnya. Emit event bersifat fire-and-forget: suara yang
 * gagal commit dapat meninggalkan baris audit yang mengaku sukses, dan audit
 * yang tidak sesuai kenyataan lebih buruk daripada tidak ada audit. Yang perlu
 * melewati eventBus adalah notifikasi/pemberitahuan ke modul lain.
 */
export const FoundationDecisionService = {
  /** Buat keputusan: snapshot anggota organ & kuorum, lalu buka voting. */
  async create(actor: Actor, input: CreateFoundationDecisionInput) {
    // Kewenangan organ diperiksa lebih dulu: membuka voting atas keputusan
    // yang bukan wewenang organ ini adalah kesalahan yang tidak bisa diperbaiki
    // setelah suara mulai masuk.
    if (
      !organMayDecide(input.organType, input.decisionType, actor.roleCode, {
        allowSuperAdmin: true,
      })
    ) {
      throw Errors.forbidden(
        `Organ ${input.organType} tidak berwenang memutus "${input.decisionType}".`
      );
    }

    const now = new Date();
    // Snapshot hanya memuat anggota yang berhak HARI INI: peran aktif,
    // penugasan belum kedaluwarsa, akun masih aktif — anggota yang habis masa
    // tugasnya tidak boleh menggelembungkan kuorum yang terkunci selamanya.
    //
    // SATU orang dapat memegang beberapa peran di organ yang sama, sedangkan
    // snapshot menyimpan satu jabatan per orang. Penyusutan memakai
    // `selectSnapshotAssignments`: `isPrimary` menang, lalu senioritas jabatan,
    // lalu tie-break leksikografis. Urutannya harus eksplisit — `distinct`
    // tanpa kriteria tidak menjanjikan baris mana yang bertahan, sehingga
    // jabatan pada PDF ber-e-seal dapat berubah mengikuti rencana query.
    const assignmentRows = await prisma.userRoleAssignment.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { code: { in: roleCodesForOrgan(input.organType) }, isActive: true },
        user: { isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        userId: true,
        isPrimary: true,
        user: { select: { id: true, name: true } },
        role: { select: { code: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }, { id: 'asc' }],
    });
    const assignments = selectSnapshotAssignments(
      input.organType,
      assignmentRows.map((a) => ({
        id: a.id,
        userId: a.userId,
        isPrimary: a.isPrimary,
        roleCode: a.role.code,
        user: a.user,
      }))
    );

    if (assignments.length === 0) {
      throw Errors.badRequest(
        `Tidak ada anggota aktif pada organ ${input.organType}. Lengkapi keanggotaan organ sebelum membuka keputusan.`
      );
    }

    /**
     * Pembuatan keputusan dan baris auditnya berbagi SATU transaksi: kegagalan
     * audit harus membatalkan pembuatan, atau retry menghasilkan keputusan
     * DUPLIKAT (token verifikasi acak, tidak ada unique penahan).
     *
     * Snapshot anggota divalidasi ULANG di dalam transaksi di bawah kunci
     * serialisasi tabel, sehingga penambahan/pencabutan/penggantian peran yang
     * konkuren tidak dapat membekukan himpunan anggota yang salah beserta hak
     * suaranya. Snapshot KUORUM dibaca di sini juga, di bawah kunci tabel
     * aturan, supaya ambang yang dibekukan tidak dapat digantikan oleh
     * `upsertRule` yang commit di sela. Bila himpunan anggota berubah, operasi
     * dibatalkan atomik.
     */
    const decisionId = await prisma
      .$transaction(async (tx) => {
        // URUTAN KUNCI (lihat `LOCK ORDER` di atas `lockDecision`): tabel aturan
        // lebih dulu, baru penugasan/peran/pengguna. `upsertRule` mengambil
        // kunci tabel aturan lalu baris `users` aktornya; bila `create` mengambil
        // `users` lebih dulu dan baru tabel aturan, keduanya dapat saling
        // menunggu (deadlock) ketika aktor `upsertRule` adalah anggota organ.
        // Satu urutan global menutupnya.
        await lockRuleTableForSnapshot(tx);
        const lockedRows = await lockAndRereadOrganAssignments(tx, input.organType);
        // Susutkan ulang dengan fungsi produksi yang SAMA, lalu bandingkan hasil
        // susutan — bukan daftar penugasan mentah.
        const lockedAssignments = selectSnapshotAssignments(
          input.organType,
          lockedRows.map((a) => ({
            id: a.id,
            userId: a.userId,
            isPrimary: a.isPrimary,
            roleCode: a.role.code,
            user: a.user,
          }))
        );
        assertSnapshotStillMatches(input.organType, assignments, lockedAssignments);

        // Aktor yang dinonaktifkan/dihapus setelah login masih memegang token
        // akses stateless. Membuka keputusan adalah tindakan tata kelola:
        // status hidup akun diperiksa DI DALAM transaksi, di bawah kunci baris
        // `users`, sehingga deaktivasi yang konkuren tidak dapat menyelinap.
        await assertUserActiveInTx(tx, actor.id);

        // Aturan kuorum dibaca DI DALAM transaksi, di bawah kunci tabel aturan
        // yang sudah diambil di awal (sama dengan `upsertRule`), lalu snapshot
        // dibentuk dari nilai itu. Membaca aturan di luar transaksi (seperti
        // sebelumnya) membuat ambang yang mengesahkan keputusan ber-e-seal
        // dapat berasal dari aturan yang sudah diganti.
        const lockedRule = await this.loadRule(input.organType, input.kind, tx);
        const snapshot: QuorumSnapshot = {
          organType: input.organType,
          kind: input.kind,
          activeCount: lockedAssignments.length,
          presentMode: lockedRule.quorumPresentMode,
          presentValue: lockedRule.quorumPresentValue,
          decisionMode: lockedRule.quorumDecisionMode,
          decisionValue: lockedRule.quorumDecisionValue,
        };
        const emptySummary: VoteSummary = {
          approve: 0,
          reject: 0,
          abstain: 0,
          present: 0,
          active: lockedAssignments.length,
          totalVotes: 0,
        };

        const decision = await tx.foundationDecision.create({
          data: {
            organType: input.organType,
            kind: input.kind,
            subject: input.subject,
            body: input.body,
            decisionType: input.decisionType,
            quorumSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            voteSummary: emptySummary as unknown as Prisma.InputJsonValue,
            status: FoundationDecisionStatus.VOTING,
            createdById: actor.id,
            verificationToken: randomBytes(20).toString('hex'),
            members: {
              // Dari hasil baca ULANG pasca-lock, bukan salinan pra-transaksi:
              // yang lolos `assertSnapshotStillMatches` adalah himpunan yang sah
              // saat transaksi commit.
              create: lockedAssignments.map((a) => ({
                userId: a.user.id,
                name: a.user.name,
                roleCode: a.roleCode,
              })),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'CREATE',
            entity: 'FoundationDecision',
            entityId: decision.id,
            newValues: {
              organType: input.organType,
              kind: input.kind,
              subject: input.subject,
              decisionType: input.decisionType,
              activeCount: snapshot.activeCount,
            },
          },
        });

        return decision.id;
      })
      .catch((err) => {
        // Pembuatan keputusan serial terhadap SEMUA mutasi penugasan dan
        // perubahan aturan kuorum. Bila salah satunya menahan kunci lebih lama
        // dari `lock_timeout`, ini dilaporkan sebagai konflik yang dapat
        // diulang — bukan 500.
        if (isLockConflictError(err)) {
          throw Errors.conflict(
            'Keanggotaan organ atau aturan kuorum sedang berubah saat keputusan dibuat. Silakan ulangi.'
          );
        }
        throw err;
      });

    return decisionId;
  },

  /**
   * Organ yang boleh DIBUAT aktor + jenis yang berwenang, dihitung dari
   * matriks yang sama dengan `create`.
   *
   * Form create membutuhkannya SEBELUM submit. Menyalin kebijakan ini ke web
   * berarti form dapat menawarkan organ yang peladen tolak (Pengawas mengisi
   * form organ Pembina lalu 403). Daftar dibatasi `CREATE` di rute, jadi aktor
   * read-only tidak pernah sampai ke sini.
   */
  async createOptions(actor: Actor): Promise<FoundationCreateOptionsDTO> {
    const organs = allowedCreateOrgansForRole(actor.roleCode, { allowSuperAdmin: true });
    return {
      allowedOrgans: organs.map((organType) => ({
        organType,
        decisionTypes: decisionTypesForOrgan(organType),
      })),
    };
  },

  /** Aturan kuorum untuk (organ × cara), dengan default legal bila tak diset. */
  async loadRule(
    organType: FoundationOrganType,
    kind: FoundationDecisionKind,
    client: DbClient = prisma
  ): Promise<FoundationDecisionRule> {
    const found = await client.foundationDecisionRule.findUnique({
      where: { organType_decisionKind: { organType, decisionKind: kind } },
    });
    if (found) return normalizeRule(found);
    const d = DEFAULT_RULE[kind];
    return {
      id: 'default',
      organType,
      decisionKind: kind,
      quorumPresentMode: d.quorumPresentMode as FoundationDecisionRule['quorumPresentMode'],
      quorumPresentValue: d.quorumPresentValue,
      quorumDecisionMode: d.quorumDecisionMode as FoundationDecisionRule['quorumDecisionMode'],
      quorumDecisionValue: d.quorumDecisionValue,
      updatedById: null,
      updatedAt: new Date(),
    };
  },

  /** Daftar keputusan (paginated). */
  async list(actor: Actor, query: ListFoundationDecisionsQuery) {
    // Filter akses diletakkan DI QUERY, bukan di middleware: anggota snapshot
    // yang rolenya sudah berubah berhak membaca keputusan yang memuat dirinya
    // (detail sudah mengizinkannya), sehingga daftar tidak boleh menyembunyikan
    // keputusan tersebut. `authorize(...READ)` di rute melihat peran HARI INI
    // dan akan menolak orang itu sebelum service sempat melihat snapshot.
    const access = foundationDecisionListWhere(actor);
    const where: Prisma.FoundationDecisionWhereInput = { AND: [access] };
    if (query.organType) where.organType = query.organType;
    if (query.status) where.status = query.status as FoundationDecisionStatus;

    const [total, rows] = await Promise.all([
      prisma.foundationDecision.count({ where }),
      prisma.foundationDecision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          createdBy: { select: { id: true, name: true } },
          members: { select: { userId: true } },
          votes: {
            include: { signingKey: { select: trustedKeySelect } },
          },
        },
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      organType: r.organType,
      kind: r.kind,
      status: r.status,
      subject: r.subject,
      decisionType: r.decisionType,
      quorumSnapshot: r.quorumSnapshot as unknown as QuorumSnapshot,
      voteSummary: r.voteSummary as unknown as VoteSummary,
      finalPdfDigest: r.finalPdfDigest,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      createdByName: r.createdBy.name,
      memberCount: r.members.length,
      // `votedCount` pada daftar harus sama dengan `votedCount` pada detail dan
      // dengan angka yang mengesahkan keputusan: suara yang gagal verifikasi
      // tanda tangan TIDAK dihitung. `_count.votes` menghitung seluruh baris
      // mentah, sehingga daftar dapat menampilkan "3 dari 3" untuk keputusan
      // yang baru dua suaranya sah.
      votedCount: r.votes.filter((v) => isVoteAuthentic(r as unknown as RichDecision, v)).length,
    }));

    return { items, total, page: query.page, limit: query.limit };
  },

  /**
   * Detail keputusan untuk peminta (termasuk hak suara pribadi).
   *
   * Akses baca diperiksa DI SINI, bukan lewat `authorize(...READ)` di rute.
   * Alasannya ada pada `canReadFoundationDecision`: anggota snapshot yang
   * rolenya sudah berubah tetap berhak menandatangani keputusan ini (rute vote
   * sengaja hanya `authenticate`), dan menolaknya membaca dokumen yang boleh ia
   * tanda tangani adalah kontradiksi yang tak dapat diperbaiki dari middleware
   * — middleware melihat peran hari ini, sedangkan keanggotaannya terkunci pada
   * saat keputusan dibuat.
   */
  async detail(actor: Actor, decisionId: string) {
    const d = await this.loadWithRelations(decisionId);
    if (!canReadFoundationDecision(actor, d.members)) {
      throw Errors.forbidden('Anda tidak berhak membaca keputusan ini.');
    }
    const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
    const summary = d.voteSummary as unknown as VoteSummary;
    // Hak suara mengikuti SNAPSHOT anggota, bukan peran hari ini: orang yang
    // baru diangkat setelah keputusan dibuat bukan bagian dari badan yang
    // memutus saat itu.
    //
    // Anggota yang SUDAH memilih juga `canVote: false`: `castVote` menolak
    // suara ganda, jadi DTO yang tetap menawarkannya membuat UI meminta
    // tindakan yang peladen pasti tolak.
    const hasVoted = this.authenticatedVotesOf(d).some((v) => v.userId === actor.id);
    // Hak suara mengikuti SNAPSHOT anggota, bukan peran hari ini: orang yang
    // baru diangkat setelah keputusan dibuat bukan bagian dari badan yang
    // memutus saat itu.
    //
    // Tetapi snapshot saja TIDAK cukup untuk MENAWARKAN suara: `castVote`
    // (F1) juga mensyaratkan penugasan organ yang SAAT INI aktif di bawah
    // kunci. Menghitungnya di sini dengan predikat yang sama persis membuat UI
    // tidak pernah menawarkan tombol yang peladen pasti tolak — mantan anggota
    // yang seluruh peran organnya dicabut, atau yang perannya
    // dinonaktifkan/kedaluwarsa. Perbedaan kecil antara "tampil" dan "diterima"
    // adalah bug yang sulit terlihat, jadi keduanya memakai satu definisi.
    const isSnapshotMember = d.members.some((m) => m.userId === actor.id);
    const holdsCurrentAssignment = isSnapshotMember
      ? !!(await prisma.userRoleAssignment.findFirst({
          where: {
            userId: actor.id,
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { isActive: true, code: { in: roleCodesForOrgan(d.organType) } },
          },
          select: { id: true },
        }))
      : false;
    // Anggota yang SUDAH memilih juga `canVote: false`: `castVote` menolak
    // suara ganda, jadi DTO yang tetap menawarkannya membuat UI meminta
    // tindakan yang peladen pasti tolak.
    const canVote =
      d.status === FoundationDecisionStatus.VOTING && !hasVoted && holdsCurrentAssignment;
    // Eligibility finalisasi dihitung dengan definisi yang SAMA dengan
    // `finalize` — bukan dari role saja. UI tidak boleh menawarkan tombol yang
    // peladen pasti tolak (Pengawas membuka keputusan organ lain). Sirkuler
    // DIKECUALIKAN karena hasilnya tidak dapat dikunci manual, jadi `finalize`
    // selalu menolaknya — lihat `finalize`.
    const canFinalize =
      d.status === FoundationDecisionStatus.VOTING &&
      d.kind !== 'CIRCULAR' &&
      canFinalizeDecision(actor, d.members);
    // Pembatalan hanya masuk akal bila rapat masih VOTING, bukan sirkuler,
    // aktor berwenang, DAN kuorum hadir belum tercapai. Kuorum yang sudah
    // terpenuhi harus ditetapkan hasilnya, bukan dibatalkan — jadi tombolnya
    // juga tidak ditawarkan pada keadaan itu.
    const presentMet = evaluateQuorum(
      d.quorumSnapshot as unknown as QuorumSnapshot,
      this.votesOf(d),
      { closed: true }
    ).presentMet;
    const canCancel =
      d.status === FoundationDecisionStatus.VOTING &&
      d.kind !== 'CIRCULAR' &&
      !presentMet &&
      canFinalizeDecision(actor, d.members);
    // Syarat publikasi dihitung dengan definisi yang SAMA dengan
    // `setPublication`, sehingga UI tidak menawarkan "Terbitkan" pada
    // draf/VOTING yang peladen tolak.
    const publishable =
      d.status === FoundationDecisionStatus.APPROVED &&
      !!d.finalPdfDigest &&
      !!d.finalPdfSealSignature &&
      !!d.esealId &&
      !!d.document;
    const mine = this.authenticatedVotesOf(d).find((v) => v.userId === actor.id);
    return this.toDetailDTO(
      d,
      snapshot,
      summary,
      canVote,
      canFinalize,
      publishable,
      canCancel,
      mine?.choice ?? null,
      actor.id,
      actor.roleCode
    );
  },

  /** Ambil keputusan dengan relasi, atau 404. */
  async loadWithRelations(decisionId: string): Promise<RichDecision> {
    const d = await prisma.foundationDecision.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
    if (!d) throw Errors.notFound('Keputusan tidak ditemukan.');
    return d as unknown as RichDecision;
  },

  /**
   * Suara yang SAH untuk dihitung ke kuorum.
   *
   * Setiap baris suara yang gagal `isVoteAuthentic` dibuang, bukan sekadar
   * dikembalikan pilihannya. Tanpa saringan ini, baris
   * `foundation_decision_votes` yang diubah langsung di basis data (pilihan
   * diganti, atau baris disisipkan) tetap ikut evaluasi kuorum dan menerima
   * e-seal Yayasan yang sah — arsip permanen yang mengesahkan keputusan atas
   * dasar suara palsu.
   */
  authenticatedVotesOf(d: RichDecision) {
    return d.votes.filter((v) => isVoteAuthentic(d, v));
  },

  /** Bentuk ringkas suara yang sah, untuk evaluasi kuorum. */
  votesOf(d: RichDecision): Array<{ choice: 'APPROVE' | 'REJECT' | 'ABSTAIN' }> {
    return this.authenticatedVotesOf(d).map((v) => ({ choice: v.choice }));
  },

  /** Memberi suara + tanda tangan digital anggota, lalu evaluasi kuorum. */
  async castVote(actor: Actor, decisionId: string, input: CastFoundationVoteInput) {
    const { choice, note, passphrase } = input;
    const d = await this.loadWithRelations(decisionId);

    if (d.status !== FoundationDecisionStatus.VOTING) {
      throw Errors.badRequest(`Keputusan berstatus ${d.status} dan tidak lagi menerima suara.`);
    }
    // Duplikat diperiksa atas suara yang AUTENTIK: baris yang disisipkan
    // langsung ke basis data dan tidak lolos verifikasi tanda tangan tidak
    // boleh memblokir suara sah anggota. Bila baris mentah tetap ada, `INSERT`
    // akan ditolak indeks unik `(decisionId, userId)` dan dipetakan ke pesan
    // yang jelas — lihat penanganan P2002 di bawah.
    if (this.authenticatedVotesOf(d).some((v) => v.userId === actor.id)) {
      throw Errors.badRequest('Anda sudah memberikan suara pada keputusan ini.');
    }
    // Keanggotaan diperiksa terhadap SNAPSHOT yang terkunci, bukan peran saat
    // ini. Memakai peran hari ini berarti seseorang yang baru diangkat dapat
    // memutus keputusan yang dibuat sebelum ia menjadi anggota.
    if (!d.members.some((m) => m.userId === actor.id)) {
      throw Errors.forbidden('Anda bukan anggota organ yang berhak memutus keputusan ini.');
    }
    if (d.kind === 'CIRCULAR' && choice === 'REJECT' && (!note || note.trim().length < 5)) {
      throw Errors.badRequest(
        'Tidak setuju pada keputusan sirkuler wajib disertai alasan (min. 5 karakter).'
      );
    }

    // Muat kunci tanda tangan pemilih; pastikan masih sah (aktivasi, masa
    // berlaku, pencabutan, terkunci) lewat inti yang sama dengan alur surat.
    const signingKey = await prisma.userSigningKey.findUnique({ where: { userId: actor.id } });
    try {
      assertCanSign(signingKey as never);
    } catch (err) {
      throw Errors.badRequest((err as Error).message);
    }
    const material = signingKeyToMaterial(signingKey as never);
    // Catat kunci publik yang dipakai ke riwayat append-only, dan ikat suara
    // ini ke rekaman itu. Rekaman inilah yang dipercaya saat verifikasi ulang;
    // kunci pada baris suara hanya menjadi pembanding. Tanpa langkah ini, suara
    // yang disisipkan langsung ke basis data dengan kunci karangan akan lolos.
    const keyRecord = await ensureSigningKeyHistory(prisma, {
      userId: actor.id,
      algorithm: material.algorithm,
      publicKey: material.publicKey,
    });

    const signedAt = new Date();
    const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
    const payload = canonicalDecisionPayload({
      decisionId: d.id,
      organType: d.organType,
      kind: d.kind,
      decisionType: d.decisionType,
      subject: d.subject,
      body: d.body,
      createdAt: d.createdAt,
      activeCount: snapshot.activeCount,
      voterId: actor.id,
      choice,
      signedAt,
    });
    const digest = sha256hex(payload);

    // Perlindungan tebak-passphrase yang sama dengan modul esign: pencacah
    // dinaikkan ATOMIK di luar transaksi (supaya tetap bertambah walau operasi
    // utamanya dibatalkan), dan kunci yang terkunci ditolak sebelum
    // ditandatangani. Tanpa ini sesi yang dicuri dapat menebak passphrase
    // tanpa batas.
    let signature: string;
    try {
      signature = signPdfHash(material, passphrase, digest);
    } catch (error) {
      if (error instanceof EsignError) {
        const failed = await recordFailedAttempt(signingKey!.id);
        const left = MAX_PASSPHRASE_ATTEMPTS - failed;
        throw Errors.unauthorized(
          left > 0
            ? `Passphrase tanda tangan salah. Sisa percobaan: ${left}.`
            : 'Passphrase salah. Kunci tanda tangan dikunci sementara.'
        );
      }
      throw error;
    }

    // Baris suara sintetis untuk menghitung artefak SEBELUM kunci diambil.
    // `isVoteAuthentic` akan meloloskannya (tanda tangan ini sah), sehingga
    // render di sini menghasilkan PDF yang sama persis dengan yang akan dirender
    // di dalam kunci bila tidak ada pemilih lain yang menyela. Nama pemilih
    // diambil dari SNAPSHOT anggota — nama itulah yang tercetak di risalah.
    const previewVote: VoteWithTrustedKey = {
      id: 'preview',
      decisionId: d.id,
      userId: actor.id,
      choice,
      canonicalDigest: digest,
      signature,
      publicKey: material.publicKey,
      algorithm: material.algorithm,
      note: note?.trim() || null,
      signedAt,
      signingKeyId: keyRecord.id,
      publicKeyFingerprint: keyRecord.fingerprint,
      user: {
        id: actor.id,
        name: d.members.find((m) => m.userId === actor.id)?.name ?? '',
      },
      signingKey: keyRecord,
    };
    // Satu percobaan penuh. Semuanya membaca/menulis lewat `bound` — baris yang
    // dimuat SEGAR di luar kunci — bukan salinan permintaan pertama, sehingga
    // ulangan tidak pernah memakai himpunan suara yang sudah basi.
    const attemptCastVote = async (bound: RichDecision) => {
      // Baris suara sintetis untuk menghitung artefak SEBELUM kunci diambil.
      // `isVoteAuthentic` akan meloloskannya (tanda tangan ini sah), sehingga
      // render di sini menghasilkan PDF yang sama persis dengan yang akan
      // dirender di dalam kunci bila tidak ada pemilih lain yang menyela. Nama
      // pemilih diambil dari SNAPSHOT anggota — nama itulah yang tercetak di
      // risalah.
      const attemptVote: VoteWithTrustedKey = {
        ...previewVote,
        signedAt,
        note: note?.trim() || null,
      };
      // Ringkasan dihitung ULANG dari himpunan suara yang memuat `attemptVote`.
      // Mempertahankan `voteSummary` lama akan membuat artefak preview lolos
      // pemeriksaan sidik jari sementara PDF-nya mencetak rekap SEBELUM suara
      // penentu — selisih itu terlihat pada risalah final yang di-e-seal.
      const attemptDecision = {
        ...bound,
        votes: [...bound.votes, attemptVote],
      } as unknown as RichDecision;
      const attemptSummary = voteSummaryOf(
        this.authenticatedVotesOf(attemptDecision),
        (attemptDecision.quorumSnapshot as unknown as QuorumSnapshot).activeCount
      );
      attemptDecision.voteSummary = attemptSummary as unknown as Prisma.JsonValue;
      const previewEvaluation = evaluateQuorum(
        attemptDecision.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(attemptDecision)
      );
      // Kerja mahal (render PDF + buka kunci e-seal) dikerjakan DI LUAR kunci
      // baris, agar satu finalisasi tidak menahan suara anggota lain selama
      // kripto berlangsung.
      let previewArtifact: ApprovalArtifact | null = null;
      if (
        previewEvaluation.outcome === 'APPROVED' &&
        attemptDecision.status !== FoundationDecisionStatus.APPROVED
      ) {
        previewArtifact = await this.prepareApprovalArtifact(actor, attemptDecision);
      }

      const result = await prisma.$transaction(async (tx) => {
        // Kunci baris keputusan dan periksa ulang status DI DALAM transaksi.
        // Pembuatan suara, pembacaan ulang suara, evaluasi kuorum, dan
        // finalisasi berjalan atomik terhadap pemilih paralel.
        await lockDecision(tx, bound.id);
        const lockedRow = await tx.foundationDecision.findUnique({
          where: { id: bound.id },
          include: decisionInclude,
        });
        const locked = lockedRow as unknown as RichDecision | null;
        if (!locked) throw Errors.notFound('Keputusan tidak ditemukan.');
        if (locked.status !== FoundationDecisionStatus.VOTING) {
          throw Errors.badRequest(
            `Keputusan berstatus ${locked.status} dan tidak lagi menerima suara.`
          );
        }
        // Sama seperti pra-cek: duplikat dihitung dari suara AUTENTIK.
        if (this.authenticatedVotesOf(locked).some((v) => v.userId === actor.id)) {
          throw Errors.badRequest('Anda sudah memberikan suara pada keputusan ini.');
        }

        // Keanggotaan snapshot bersifat immutable, tetapi BUKAN berarti tetap
        // berhak selamanya: anggota yang dinonaktifkan/dihapus setelah
        // keputusan dibuka masih tercatat pada snapshot. Periksa status hidup
        // akun DI DALAM transaksi, di bawah kunci baris user, sehingga
        // deaktivasi yang konkuren tidak dapat menyelinap di antara pembacaan
        // dan `INSERT` suara.
        //
        // F1 (SECURITY): snapshot saja tidak cukup. Buktikan JUGA, di bawah
        // kunci penugasan yang sama dengan seluruh mutasi eligibility, bahwa
        // aktor masih memegang penugasan organ yang SAAT INI aktif — bukan
        // sekadar pernah tercatat. Pencabutan/penggantian/kedaluwarsa peran
        // yang konkuren menunggu kunci ini, sehingga tidak ada suara sah yang
        // ditulis setelah hak pilihnya hilang.
        await assertActorHasCurrentOrganAssignmentInTx(tx, actor.id, locked.organType);

        // TOCTOU: buktikan ULANG, DI DALAM transaksi dan SEBELUM `INSERT`, bahwa
        // kunci yang menandatangani masih berlaku. Bila rotasi/pencabutan commit
        // di sela-sela, transaksi ini dibatalkan sehingga TIDAK ada baris suara
        // yang tercommit — bukan baris yang ditolak `isVoteAuthentic` sekaligus
        // memblokir percobaan ulang.
        await assertSigningKeyStillCurrent(
          tx,
          actor.id,
          { publicKey: material.publicKey, algorithm: material.algorithm },
          signedAt
        );

        const vote = await tx.foundationDecisionVote.create({
          data: {
            decisionId: bound.id,
            userId: actor.id,
            choice,
            canonicalDigest: digest,
            signature,
            publicKey: material.publicKey,
            algorithm: material.algorithm,
            note: note?.trim() || null,
            signedAt,
            signingKeyId: keyRecord.id,
            publicKeyFingerprint: keyRecord.fingerprint,
          },
        });

        const votes = await tx.foundationDecisionVote.findMany({
          where: { decisionId: bound.id },
          include: { signingKey: { select: trustedKeySelect } },
        });
        // Ringkasan dihitung dari suara yang LOLOS verifikasi tanda tangan.
        // Baris suara yang disisipkan/diubah langsung di basis data tidak boleh
        // muncul di rekap maupun di PDF final yang di-e-seal.
        const authentic = votes.filter((v) =>
          isVoteAuthentic(locked, v as unknown as VoteSignatureRecord)
        );
        const summary: VoteSummary = voteSummaryOf(authentic, snapshot.activeCount);
        await tx.foundationDecision.update({
          where: { id: bound.id },
          data: { voteSummary: summary as unknown as Prisma.InputJsonValue },
        });

        // Evaluasi atas baris yang sudah memuat suara ini, masih di dalam kunci.
        const freshRow = await tx.foundationDecision.findUnique({
          where: { id: bound.id },
          include: decisionInclude,
        });
        const fresh = freshRow as unknown as RichDecision;
        const evaluation = evaluateQuorum(
          fresh.quorumSnapshot as unknown as QuorumSnapshot,
          this.votesOf(fresh)
        );
        // Artefak yang disiapkan di luar kunci hanya dipakai bila sidik jarinya
        // masih sama. Bila pemilih lain menyisipkan suara di sela-selanya,
        // `applyLocked` melempar `StaleArtifactError` dan percobaan ini
        // dibatalkan lalu diulang dengan artefak yang dihitung dari baris segar —
        // tidak ada render di dalam kunci.
        const artifact =
          previewArtifact && previewArtifact.fingerprint === approvalFingerprint(fresh)
            ? previewArtifact
            : null;
        const outcome = await this.applyLocked(actor, fresh, evaluation, tx, artifact ?? undefined);

        // Audit VOTE ditulis DI DALAM transaksi yang sama dengan suaranya. Bila
        // di luar, kegagalan `auditLog.create` membuat suara sudah tercommit
        // tetapi `castVote` melempar galat — retry ditolak sebagai suara ganda
        // dan suara sah kehilangan baris auditnya. Di sini keduanya rollback
        // bersama.
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'VOTE',
            entity: 'FoundationDecisionVote',
            entityId: vote.id,
            newValues: { decisionId: bound.id, choice },
          },
        });

        // Passphrase benar: buka hitungan gagal, juga di dalam transaksi agar
        // tidak ada pembaruan kunci yang lolos ketika suaranya gagal.
        await clearFailedAttempts(signingKey!.id, tx);

        return { vote, summary, outcome };
      });
      return result;
    };

    // Bila baris berubah antara penyiapan artefak dan pengambilan kunci,
    // `applyLocked` melempar `StaleArtifactError` alih-alih merender PDF/scrypt
    // di dalam kunci. Tangkap sinyal itu, muat ulang baris di LUAR kunci, dan
    // ulangi (terbatas) supaya penulis yang terus menyisipkan suara tidak
    // membuat loop tak berujung.
    let result: Awaited<ReturnType<typeof attemptCastVote>> | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await attemptCastVote(
          attempt === 0 ? d : await this.loadWithRelations(decisionId)
        );
        break;
      } catch (err) {
        if (!(err instanceof StaleArtifactError) || attempt >= 2) {
          // Indeks unik `(decisionId, userId)` menahan baris suara KEDUA untuk
          // pemilih yang sama. Pra-cek di atas hanya menghitung suara AUTENTIK,
          // sehingga bila baris lama yang tidak autentik (sisipan langsung ke
          // basis data) memakai slot pemilih ini, `INSERT` gagal P2002 di sini.
          // Laporkan sebagai konflik data yang dapat ditindak, bukan 500 —
          // baris itu harus direkonsiliasi administrator, bukan didiamkan.
          if (isUniqueConstraintError(err)) {
            throw Errors.conflict(
              'Ada baris suara lama yang tidak sah untuk akun ini pada keputusan tersebut. Hubungi administrator untuk merekonsiliasinya sebelum memberikan suara.'
            );
          }
          throw err;
        }
      }
    }

    return {
      voteId: result.vote.id,
      choice,
      voteSummary: result.summary,
      outcome: result.outcome,
    };
  },

  /**
   * Batalkan rapat yang kuorum HADIR-nya tidak pernah tercapai.
   *
   * **Kebijakan (finding 6).** Rapat yang gagal kuorum hadir TIDAK ditutup
   * sebagai `REJECTED`: itu menyatakan materi "ditolak" padahal rapat tidak
   * pernah memutus apa pun. UU 16/2001 jo. UU 28/2004 jo. PP 63/2008
   * mensyaratkan kuorum untuk keabsahan keputusan rapat, jadi hasil yang benar
   * saat kuorum tak tercapai adalah menunda/menjadwalkan ulang — `CANCELLED`
   * menutup rapat itu secara terminal tanpa memalsukan hasil.
   *
   * Hanya `MEETING` berstatus `VOTING` oleh aktor yang berhak memfinalisasi,
   * DAN kuorum hadir memang belum terpenuhi; rapat yang kuorumnya sudah
   * terpenuhi harus diselesaikan lewat `finalize`, bukan dibuang.
   */
  async cancel(actor: Actor, decisionId: string) {
    const d = await this.loadWithRelations(decisionId);
    if (!canFinalizeDecision(actor, d.members)) {
      throw Errors.forbidden('Anda tidak berhak membatalkan keputusan organ ini.');
    }
    if (d.kind === 'CIRCULAR') {
      throw Errors.badRequest(
        'Keputusan sirkuler tidak dibatalkan manual: keputusan terminalnya ditutup otomatis saat pemungutan suara.'
      );
    }

    const runCancel = async (bound: RichDecision) =>
      prisma.$transaction(async (tx) => {
        await lockDecision(tx, decisionId);
        const lockedRow = await tx.foundationDecision.findUnique({
          where: { id: decisionId },
          include: decisionInclude,
        });
        const locked = lockedRow as unknown as RichDecision | null;
        if (!locked) throw Errors.notFound('Keputusan tidak ditemukan.');
        if (locked.status !== FoundationDecisionStatus.VOTING) {
          throw Errors.badRequest(
            `Keputusan berstatus ${locked.status} dan tidak dapat dibatalkan.`
          );
        }
        // Pembatalan adalah tindakan tata kelola: status hidup aktor diperiksa
        // di dalam transaksi, di bawah kunci baris `users`.
        await assertUserActiveInTx(tx, actor.id);
        const evaluation = evaluateQuorum(
          locked.quorumSnapshot as unknown as QuorumSnapshot,
          this.votesOf(locked),
          { closed: true }
        );
        // Kuorum hadir TERPENUHI berarti rapat sah bersidang: hasilnya harus
        // ditetapkan lewat `finalize`, bukan dibuang lewat pembatalan.
        if (evaluation.presentMet) {
          throw Errors.badRequest(
            'Kuorum rapat sudah terpenuhi, sehingga tidak dapat dibatalkan — tetapkan hasilnya lewat finalisasi.'
          );
        }
        await tx.foundationDecision.update({
          where: { id: decisionId },
          data: {
            status: FoundationDecisionStatus.CANCELLED,
            decidedById: actor.id,
            decidedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'CANCEL',
            entity: 'FoundationDecision',
            entityId: decisionId,
            newValues: {
              reason: 'kuorum-hadir-tidak-tercapai',
              evaluation: { ...evaluation },
            },
          },
        });
        return { outcome: 'CANCELLED' as const, status: FoundationDecisionStatus.CANCELLED };
      });

    for (let attempt = 0; ; attempt++) {
      try {
        return await runCancel(attempt === 0 ? d : await this.loadWithRelations(decisionId));
      } catch (err) {
        if (!(err instanceof StaleArtifactError) || attempt >= 2) throw err;
      }
    }
  },

  /**
   * Finalisasi manual oleh pimpinan/kepala rapat.
   *
   * Finalisasi **menutup** rapat: hasil dihitung SEKALI dengan `closed: true`.
   * Kuorum hadir tetap wajib; setelah terpenuhi pimpinan bebas memilih APPROVED
   * atau REJECTED tanpa menunggu anggota absen. Rapat yang kuorum HADIR-nya
   * tidak pernah tercapai dibatalkan lewat `cancel` menjadi `CANCELLED`, bukan
   * dipaksa menjadi `REJECTED` (lihat `cancel`).
   *
   * **CIRCULAR tidak dapat difinalisasi manual:** hasilnya ditutup otomatis
   * oleh `castVote`, jadi aksi manual tak punya kondisi sukses yang sah dan
   * ditolak eksplisit; DTO detail mengirim `canFinalize=false`. Lihat §7.6
   * dokumen review.
   */
  async finalize(actor: Actor, decisionId: string) {
    const d = await this.loadWithRelations(decisionId);
    // Rute `FINALIZE` juga terbuka bagi Pengawas supaya ia dapat menutup rapat
    // organnya. Kewenangan itu diperketat DI SINI: selain pimpinan/Super Admin,
    // finalizer hanya boleh menutup keputusan yang memuatnya sebagai anggota
    // snapshot. Tanpa pemeriksaan ini, satu-satunya cara Pengawas memperoleh
    // hak buka rapat organnya adalah dengan sekaligus memperoleh hak menutup
    // rapat organ mana pun.
    //
    // Definisi ini adalah fungsi yang SAMA dengan yang mengisi `canFinalize`
    // pada DTO detail, sehingga tombol yang ditampilkan tidak dapat menyimpang
    // dari yang diterima peladen.
    if (!canFinalizeDecision(actor, d.members)) {
      throw Errors.forbidden('Anda tidak berhak menutup keputusan organ ini.');
    }
    // Otorisasi diperiksa lebih dulu supaya aktor terlarang tetap menerima 403
    // (bukan petunjuk bentuk keputusan). Setelah lolos, sirkuler ditolak
    // eksplisit: hasilnya tidak dapat dikunci manual, jadi aksi ini tidak punya
    // kondisi sukses yang sah.
    if (d.kind === 'CIRCULAR') {
      throw Errors.badRequest(
        'Keputusan sirkuler tidak difinalisasi manual: hasilnya ditutup otomatis saat pemungutan suara (APPROVED bila mufakat tercapai, REJECTED bila mufakat mustahil).'
      );
    }
    const runFinalize = async (bound: RichDecision) => {
      // Jalur ini MEETING-only (CIRCULAR sudah ditolak di atas), jadi menutup
      // rapat selalu tepat: hasil dihitung sekali terhadap himpunan suara tetap.
      const boundEvaluation = evaluateQuorum(
        bound.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(bound),
        { closed: true }
      );
      let artifactForAttempt: ApprovalArtifact | null = null;
      if (
        boundEvaluation.outcome === 'APPROVED' &&
        bound.status !== FoundationDecisionStatus.APPROVED
      ) {
        artifactForAttempt = await this.prepareApprovalArtifact(actor, bound);
      }
      return prisma.$transaction(async (tx) => {
        await lockDecision(tx, decisionId);
        const lockedRow = await tx.foundationDecision.findUnique({
          where: { id: decisionId },
          include: decisionInclude,
        });
        const locked = lockedRow as unknown as RichDecision | null;
        if (!locked) throw Errors.notFound('Keputusan tidak ditemukan.');
        if (locked.status !== FoundationDecisionStatus.VOTING) {
          throw Errors.badRequest(
            `Keputusan berstatus ${locked.status} dan tidak lagi menerima suara.`
          );
        }
        // Menutup rapat adalah tindakan tata kelola: aktor yang dinonaktifkan
        // atau dihapus setelah login tidak boleh lagi memicunya lewat token
        // akses stateless yang masih berlaku.
        await assertUserActiveInTx(tx, actor.id);
        const evaluation = evaluateQuorum(
          locked.quorumSnapshot as unknown as QuorumSnapshot,
          this.votesOf(locked),
          { closed: true }
        );
        if (evaluation.outcome === 'OPEN') {
          throw Errors.badRequest(
            `Kuorum belum terpenuhi (hadir ${evaluation.presentCount}/${evaluation.presentRequired}, butuh ${evaluation.neededToApprove} setuju lagi); rapat belum dapat ditutup.`
          );
        }
        const artifact =
          artifactForAttempt && artifactForAttempt.fingerprint === approvalFingerprint(locked)
            ? artifactForAttempt
            : null;
        return this.applyLocked(actor, locked, evaluation, tx, artifact ?? undefined);
      });
    };

    // Sama seperti `castVote`: sinyal basi dibatalkan dan diulang di luar kunci,
    // tidak pernah dengan merender ulang di dalam `SELECT … FOR UPDATE`.
    for (let attempt = 0; ; attempt++) {
      try {
        return await runFinalize(attempt === 0 ? d : await this.loadWithRelations(decisionId));
      } catch (err) {
        if (!(err instanceof StaleArtifactError) || attempt >= 2) throw err;
      }
    }
  },

  /**
   * Ubah klasifikasi publikasi metadata (SUPER_ADMIN).
   *
   * Terpisah dari finalisasi: memutuskan hasil dan menerbitkan judul + rekap ke
   * internet adalah dua keputusan berbeda. **`PUBLIC` hanya diterima bila status
   * `APPROVED` DAN artefak final lengkap** (`finalPdfDigest`, tanda tangan
   * e-seal, `esealId`, arsip); `REJECTED` tidak boleh diterbitkan; kembali ke
   * `PRIVATE` selalu boleh. **Serialisasi & audit:** baris keputusan dikunci
   * lebih dulu, `publication` dibaca setelah lock, audit memakai nilai
   * sebelum-update; no-op tidak menulis audit. Lihat §7.7 dokumen review.
   */
  async setPublication(
    actor: Actor,
    decisionId: string,
    publication: FoundationDecisionPublication
  ) {
    const d = await this.loadWithRelations(decisionId);

    if (publication === FoundationDecisionPublication.PUBLIC) {
      const artifactsComplete =
        !!d.finalPdfDigest && !!d.finalPdfSealSignature && !!d.esealId && !!d.document;
      if (d.status !== FoundationDecisionStatus.APPROVED || !artifactsComplete) {
        throw Errors.badRequest(
          'Hanya keputusan yang sudah disahkan dengan dokumen final dan e-seal lengkap yang dapat diterbitkan.'
        );
      }
    }

    const at = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // SERIALISASI: kunci baris keputusan lebih dulu, lalu baca `publication`
      // AKTUAL setelah lock. Membaca nilai itu di luar transaksi dan
      // menulisnya sebagai `oldValues` membuat dua request paralel mencatat
      // nilai sebelumnya yang sama — audit lalu memuat urutan yang tidak
      // pernah terjadi.
      await lockDecision(tx, decisionId);
      const locked = await tx.foundationDecision.findUnique({ where: { id: decisionId } });
      if (!locked) throw Errors.notFound('Keputusan tidak ditemukan.');

      // Mengubah klasifikasi publikasi adalah tindakan tata kelola: aktor yang
      // dinonaktifkan/dihapus setelah login tidak boleh lagi menerbitkan atau
      // menarik metadata lewat token akses stateless yang masih berlaku.
      await assertUserActiveInTx(tx, actor.id);

      // Syarat publication divalidasi terhadap STATE TERKUNCI, bukan snapshot
      // pra-lock. `updateMany` bersyarat tetap dipakai sebagai jaring kedua.
      if (publication === FoundationDecisionPublication.PUBLIC) {
        const lockedComplete =
          locked.status === FoundationDecisionStatus.APPROVED &&
          !!locked.finalPdfDigest &&
          !!locked.finalPdfSealSignature &&
          !!locked.esealId;
        if (!lockedComplete) {
          throw Errors.badRequest(
            'Hanya keputusan yang sudah disahkan dengan dokumen final dan e-seal lengkap yang dapat diterbitkan.'
          );
        }
      }

      // No-op semantics: publikasi yang TIDAK berubah bukan peristiwa audit.
      // Menulis baris audit `oldValues === newValues` akan mengisi jejak dengan
      // perubahan yang tidak pernah terjadi, dan justru menyamarkan perubahan
      // sungguhan di sekitarnya. Baris keputusan tetap "disentuh" (updatedAt
      // ikut berubah), jadi kembalikan tanggal itu.
      if (locked.publication === publication) {
        const touched = await tx.foundationDecision.update({
          where: { id: decisionId },
          data: { publication },
          select: { updatedAt: true },
        });
        return { noop: true, updatedAt: touched.updatedAt };
      }

      const previous = locked.publication;
      const updated = await tx.foundationDecision.update({
        where: { id: decisionId },
        data: { publication },
        select: { updatedAt: true },
      });
      // Audit berada di transaksi yang SAMA: kegagalan mencatat membatalkan
      // perubahan, sehingga tidak ada perubahan publikasi tanpa jejak.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'FoundationDecision',
          entityId: decisionId,
          oldValues: { publication: previous },
          newValues: { publication },
        },
      });
      return { noop: false, updatedAt: updated.updatedAt };
    });
    return { id: decisionId, publication, updatedAt: result.updatedAt.toISOString() };
  },

  /**
   * Terapkan hasil kuorum: APPROVED (render PDF + e-seal) atau REJECTED.
   *
   * `d` harus merupakan baris HASIL AKHIR ketika `outcome === 'APPROVED'`: PDF
   * yang di-e-seal mencetak status dan `decidedAt` dari sini, dan digest-nya
   * mengunci nilai itu selamanya. Pemisahan kerja mahal dari kunci ditangani
   * pemanggil: `applyLocked` memanggil DI DALAM kunci, sedangkan
   * `castVote`/`finalize` merender artefaknya di luar kunci lewat
   * `prepareApprovalArtifact` + `commitApproved`.
   */
  async applyOutcome(
    actor: Actor,
    d: RichDecision,
    evaluation: QuorumEvaluation,
    client: DbClient = prisma
  ) {
    // Artefak disiapkan DI LUAR transaksi sehingga tidak ada jalur yang
    // merender PDF/scrypt saat transaksi berjalan.
    let prepared: ApprovalArtifact | undefined;
    if (evaluation.outcome === 'APPROVED' && d.status !== FoundationDecisionStatus.APPROVED) {
      prepared = await this.prepareApprovalArtifact(actor, d, client);
    }
    const run = async (tx: DbClient) => this.applyLocked(actor, d, evaluation, tx, prepared);
    const ownTransaction = client === prisma;
    return ownTransaction ? prisma.$transaction(run) : run(client);
  },

  /**
   * Bentuk persetujuan saat baris keputusan terkunci.
   *
   * Hanya penulisan status yang terjadi di dalam kunci: `prepared.seal` DIREUSE
   * alih-alih memanggil `ensureSeal` (scrypt) lagi. Bila `prepared` tidak ada
   * atau sidik jarinya sudah berbeda, jalur ini melempar `StaleArtifactError`
   * — bukan merender ulang — sehingga pemanggil mengulang di luar lock.
   */
  async applyLocked(
    actor: Actor,
    d: RichDecision,
    evaluation: QuorumEvaluation,
    client: DbClient,
    prepared?: ApprovalArtifact
  ) {
    if (evaluation.outcome === 'APPROVED' && d.status !== FoundationDecisionStatus.APPROVED) {
      if (!prepared || prepared.fingerprint !== approvalFingerprint(d)) {
        throw new StaleArtifactError();
      }
      const artifact = prepared;

      // Arsip byte PDF apa adanya, lalu tandai keputusan sah + e-seal. Sekali
      // ditulis, `finalPdfDigest` dikunci (immutable) dan diverifikasi e-seal.
      // `esealId` menyimpan SEAL SPESIFIK ini agar verifikasi tidak terpengaruh
      // rotasi/pencabutan seal di kemudian hari.
      await client.foundationDecisionDocument.create({
        data: {
          decisionId: d.id,
          bytes: new Uint8Array(artifact.buf),
          sha256: artifact.finalPdfDigest,
          byteSize: artifact.buf.length,
        },
      });
      await client.foundationDecision.update({
        where: { id: d.id },
        data: {
          status: FoundationDecisionStatus.APPROVED,
          decidedById: actor.id,
          // Tanggal yang SAMA dengan yang tercetak di PDF — dua nilai berbeda
          // berarti arsip dan basis data menyebut waktu putusan yang berlainan.
          decidedAt: artifact.decidedAt,
          finalPdfDigest: artifact.finalPdfDigest,
          finalPdfByteSize: artifact.buf.length,
          finalPdfSealSignature: artifact.sealSignature,
          esealId: artifact.seal.id,
        },
      });

      await client.auditLog.create({
        data: {
          userId: actor.id,
          action: 'APPROVE',
          entity: 'FoundationDecision',
          entityId: d.id,
          newValues: {
            finalPdfDigest: artifact.finalPdfDigest,
            finalPdfByteSize: artifact.buf.length,
            evaluation: { ...evaluation },
          },
        },
      });
      return { outcome: 'APPROVED' as const, status: FoundationDecisionStatus.APPROVED };
    }

    if (evaluation.outcome === 'REJECTED' && d.status !== FoundationDecisionStatus.REJECTED) {
      await client.foundationDecision.update({
        where: { id: d.id },
        data: {
          status: FoundationDecisionStatus.REJECTED,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await client.auditLog.create({
        data: {
          userId: actor.id,
          action: 'REJECT',
          entity: 'FoundationDecision',
          entityId: d.id,
          newValues: { evaluation: { ...evaluation } },
        },
      });
      return { outcome: 'REJECTED' as const, status: FoundationDecisionStatus.REJECTED };
    }

    return { outcome: 'OPEN' as const, status: d.status };
  },

  /**
   * Hitung artefak persetujuan TANPA menyentuh kunci baris keputusan.
   *
   * Pembuatan PDF dan pembukaan kunci e-seal (scrypt) adalah bagian paling
   * mahal dari approval. Menjalankannya di dalam `SELECT … FOR UPDATE` berarti
   * setiap anggota lain yang hendak memberi suara menunggu kripto tersebut
   * selesai. Hasilnya diikat ke `fingerprint` himpunan suara, sehingga bila
   * pemilih lain menyisipkan suara di sela-sela, artefak ini dibuang dan
   * pemanggil mengulang di luar kunci dengan artefak yang baru dihitung.
   */
  async prepareApprovalArtifact(
    actor: Actor,
    d: RichDecision,
    client: DbClient = prisma
  ): Promise<ApprovalArtifact> {
    const decidedAt = new Date();
    const finalDecision: RichDecision = {
      ...d,
      status: FoundationDecisionStatus.APPROVED,
      decidedById: actor.id,
      decidedAt,
    };
    const buf = await this.renderPdf(finalDecision);
    // Hash BYTE PDF, bukan teksnya. Ini yang membolehkan arsip memeriksa
    // dirinya sendiri dan yang diikat e-seal.
    const finalPdfDigest = sha256bytes(buf);
    const seal = await ensureSeal(client);
    const sealSignature = signSeal(sealMaterial(seal), SEAL_PASSPHRASE, finalPdfDigest);
    return {
      fingerprint: approvalFingerprint(d),
      buf,
      finalPdfDigest,
      seal,
      sealSignature,
      decidedAt,
    };
  },

  /** Atur aturan kuorum (SUPER_ADMIN). */
  async upsertRule(actor: Actor, input: UpsertFoundationRuleInput) {
    return prisma.$transaction(async (tx) => {
      // Kunci yang SAMA dengan `create`: perubahan aturan menyerialkan dirinya
      // terhadap pembuatan keputusan, sehingga keputusan tidak dapat membekukan
      // ambang yang sudah diganti. `SHARE ROW EXCLUSIVE` juga menahan
      // `INSERT` baris aturan yang belum ada, yang tak dapat ditahan `FOR UPDATE`.
      await lockRuleTableForSnapshot(tx);
      // Sirkuler WAJIB mufakat — ditegakkan juga di kontrak Zod
      // (`upsertFoundationRuleSchema`); penegakan di sini menutup pemanggil
      // internal yang melewati validasi edge.
      const normalized = normalizeRuleInput(input);
      // Mengubah aturan kuorum adalah tindakan tata kelola: aktor yang
      // dinonaktifkan/dihapus setelah login tidak boleh lagi menulisnya.
      await assertUserActiveInTx(tx, actor.id);
      const saved = await tx.foundationDecisionRule.upsert({
        where: {
          organType_decisionKind: {
            organType: normalized.organType,
            decisionKind: normalized.decisionKind,
          },
        },
        create: { ...normalized, updatedById: actor.id },
        update: {
          quorumPresentMode: normalized.quorumPresentMode,
          quorumPresentValue: normalized.quorumPresentValue,
          quorumDecisionMode: normalized.quorumDecisionMode,
          quorumDecisionValue: normalized.quorumDecisionValue,
          updatedById: actor.id,
        },
      });
      // Audit ditulis DI DALAM transaksi yang sama dengan perubahannya: aturan
      // kuorum menentukan ambang yang mengesahkan keputusan, jadi perubahan
      // yang tak tercatat justru yang paling perlu tercatat. Kegagalan
      // `auditLog.create` harus membatalkan perubahannya bersamanya.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'UPSERT',
          entity: 'FoundationDecisionRule',
          entityId: saved.id,
          newValues: {
            organType: normalized.organType,
            decisionKind: normalized.decisionKind,
          },
        },
      });
      return saved;
    });
  },

  /** Daftar aturan kuorum (SUPER_ADMIN). */
  async listRules(): Promise<FoundationDecisionRule[]> {
    const rows = await prisma.foundationDecisionRule.findMany({
      orderBy: [{ organType: 'asc' }, { decisionKind: 'asc' }],
    });
    // Dinormalisasi dengan definisi yang SAMA seperti `loadRule`, supaya halaman
    // pengelolaan aturan tidak pernah menampilkan nilai yang berbeda dari ambang
    // yang benar-benar dievaluasi (mode mengikat, bukan value tersimpan).
    return rows.map(normalizeRule);
  },

  /**
   * Inti verifikasi yang dipakai BERSAMA oleh jalur token dan jalur unggahan.
   *
   * `checkedBytes` adalah byte yang benar-benar ada di tangan pemeriksa. Pada
   * jalur unggahan itu berkas yang dipegang pemindai; pada jalur token ia
   * `undefined` dan yang dibandingkan hanyalah arsip tersimpan di server.
   *
   * `digestReady` menyatakan bahwa byte-nya BENAR-BENAR kita periksa (jalur
   * unggahan) — pada jalur itu `finalPdfDigest` diambil dari hasil hash
   * unggahan, bukan dari server, sehingga sebuah PDF berisi token asli yang
   * isinya diganti tidak lagi lolos: digestnya berbeda dari yang di-e-seal.
   */
  async verifyDecisionCore(
    d: {
      id: string;
      subject: string;
      organType: string;
      kind: string;
      status: string;
      /** Klasifikasi publikasi — menentukan apakah metadata ditampilkan. */
      publication?: string;
      decidedAt: Date | null;
      finalPdfDigest: string | null;
      finalPdfSealSignature: string | null;
      esealId: string | null;
      /**
       * Konteks tanda tangan yang lengkap — naskah, anggota snapshot, dan
       * rekaman kunci tepercaya. Tanpa ini, rekap publik hanya dapat menghitung
       * baris suara apa adanya, termasuk baris palsu yang disisipkan langsung
       * ke basis data.
       */
      signatureContext: DecisionSignatureContext;
      votes: VoteWithTrustedKeyOnly[];
    },
    opts: { checkedBytes?: Buffer; uploaded?: boolean }
  ): Promise<FoundationDecisionVerificationDTO> {
    if (d.status === FoundationDecisionStatus.CANCELLED) {
      // Rapat yang gagal kuorum dibatalkan: formatnya sah, tetapi TIDAK ada
      // keputusan yang disahkan maupun ditolak. Ia dilaporkan sebagai
      // "ditemukan" dengan `isValid=false` dan sebab eksplisit, bukan
      // `not found` — supaya pemindai tahu dokumen ini memang ada dan apa
      // artinya, alih-alih menyimpulkan tokennya palsu.
      const cancelled = emptyVerification(
        'Rapat ini dibatalkan karena kuorum hadir tidak tercapai, sehingga tidak ada keputusan yang disahkan maupun ditolak.'
      );
      return {
        ...cancelled,
        found: true,
        decisionId: d.id,
        publication:
          (d.publication as FoundationDecisionPublication | undefined) ??
          FoundationDecisionPublication.PRIVATE,
      };
    }
    if (d.status !== FoundationDecisionStatus.APPROVED) {
      return emptyVerification();
    }

    /**
     * Verifikasi e-seal HANYA dengan kunci PUBLIK.
     *
     * Verifikasi memakai kunci publik yang tercatat bersama tanda tangan,
     * TIDAK mendekripsi kunci privat dengan passphrase yang berlaku sekarang.
     * Kalau ia menuntut passphrase sekarang, rotasi e-seal membuat setiap
     * keputusan lama gagal diverifikasi padahal dokumennya tidak berubah.
     * Kunci publik tidak pernah berubah oleh rotasi passphrase.
     */
    let sealVerified: boolean | null = null;
    if (d.finalPdfDigest && d.finalPdfSealSignature) {
      const seal = d.esealId
        ? await prisma.foundationEseal.findUnique({ where: { id: d.esealId } })
        : null;
      if (seal) {
        sealVerified = verifyPdfHashSignature(
          seal.publicKey,
          d.finalPdfDigest,
          d.finalPdfSealSignature
        );
      }
    }

    /**
     * Byte mana yang diperiksa, dan terhadap digest mana ia dibandingkan.
     *
     * Pada jalur unggahan, `bytes` adalah berkas pemindai dan `expected` adalah
     * digest hasil hash berkas ITU. Bila hash-nya tidak sama dengan
     * `finalPdfDigest` di server, `digestOk` menjadi false — inilah yang
     * menggagalkan PDF palsu yang mempertahankan token asli.
     */
    const archiveDigest = opts.checkedBytes ? sha256bytes(opts.checkedBytes) : null;
    const digestOk =
      archiveDigest === null || d.finalPdfDigest === null
        ? null
        : archiveDigest === d.finalPdfDigest;

    const checks: Array<boolean | null> = [digestOk, sealVerified];
    const isValid = checks.every((ok) => ok === true);

    /**
     * Rekap yang ditampilkan ke publik dihitung dari suara yang LOLOS
     * verifikasi tanda tangan — himpunan yang sama dengan yang dipakai
     * finalisasi. Menghitung seluruh baris `foundation_decision_votes` apa
     * adanya akan membuat suara palsu hasil sisipan langsung ke basis data
     * mengubah angka yang dilihat pengunjung, sekalipun suara itu tidak
     * pernah masuk ke PDF tersegel.
     */
    const authentic = d.votes.filter((v) =>
      isVoteAuthentic(d.signatureContext, v as unknown as VoteSignatureRecord)
    );

    // Sebab yang dibaca pengunjung, dengan urutan yang paling penting dulu: byte
    // yang tidak cocok adalah temuan paling keras (dokumen mungkin dipalsukan),
    // sedangkan e-seal yang belum diverifikasi bisa sekadar berarti rekamannya
    // belum lengkap.
    let reason: string | null = null;
    if (digestOk === false) {
      reason = opts.uploaded
        ? 'Isi berkas PDF ini TIDAK cocok dengan digest yang ditandatangani e-seal — dokumen telah diubah setelah disahkan, atau bukan berkas aslinya.'
        : 'Byte arsip server tidak cocok dengan digest yang ditandatangani — arsip telah berubah setelah disahkan.';
    } else if (sealVerified === false) {
      reason = 'Tanda tangan e-seal Yayasan tidak dapat diverifikasi terhadap kunci publiknya.';
    } else if (digestOk === null && sealVerified === null && d.finalPdfDigest) {
      reason =
        'Keputusan ini tercatat tetapi rekaman e-seal atau arsipnya tidak lengkap, sehingga keabsahannya tidak dapat dipastikan.';
    } else if (!d.finalPdfDigest) {
      reason = 'Keputusan ini belum memiliki arsip PDF yang di-e-seal.';
    }

    /**
     * Sensor metadata tata kelola untuk keputusan yang tidak diterbitkan.
     *
     * Endpoint ini anonim dan `subject`/organ/tanggal/rekap dapat mengungkap
     * personalia, jadi metadata hanya keluar bila `PUBLIC` — bawaannya PRIVATE
     * (fail closed). Bukti keabsahan (`isValid`, `digest`, `digestOk`,
     * `sealVerified`, `reason`, `decisionId`) tidak disensor; lihat §7.7 dokumen
     * review.
     */
    const isPublic = d.publication === FoundationDecisionPublication.PUBLIC;

    return {
      found: true,
      isValid,
      decisionId: d.id,
      publication:
        (d.publication as FoundationDecisionPublication | undefined) ??
        FoundationDecisionPublication.PRIVATE,
      subject: isPublic ? d.subject : null,
      organType: isPublic ? (d.organType as FoundationDecisionVerificationDTO['organType']) : null,
      kind: isPublic ? (d.kind as FoundationDecisionVerificationDTO['kind']) : null,
      status: isPublic ? (d.status as FoundationDecisionVerificationDTO['status']) : null,
      decidedAt: isPublic && d.decidedAt ? d.decidedAt.toISOString() : null,
      digest: d.finalPdfDigest,
      archiveDigest,
      digestOk,
      sealVerified,
      reason,
      voteCount: isPublic ? authentic.length : 0,
      approveCount: isPublic ? authentic.filter((v) => v.choice === 'APPROVE').length : 0,
      rejectCount: isPublic ? authentic.filter((v) => v.choice === 'REJECT').length : 0,
      abstainCount: isPublic ? authentic.filter((v) => v.choice === 'ABSTAIN').length : 0,
    };
  },

  /**
   * Verifikasi lewat token cetak (nomor rujukan), memeriksa arsip server.
   *
   * Token ini TIDAK datang dari QR — QR risalah hanya membawa alamat halaman
   * unggah tanpa token. Ia adalah nomor rujukan yang tercetak di kaki PDF.
   * Ini membuktikan bahwa arsip server belum berubah sejak disegel. Ia TIDAK
   * membuktikan apa pun tentang berkas yang dipegang pemindai — lihat
   * `verifyByPdfBuffer` untuk itu, yang membandingkan byte unggahan.
   */
  async verifyByToken(token: string): Promise<FoundationDecisionVerificationDTO> {
    const row = await prisma.foundationDecision.findUnique({
      where: { verificationToken: token },
      include: {
        votes: { include: { signingKey: { select: trustedKeySelect } } },
        members: { select: { userId: true } },
        document: { select: { bytes: true } },
      },
    });
    if (!row) {
      return emptyVerification('Token verifikasi tidak cocok dengan keputusan yang sah.');
    }
    return this.verifyDecisionCore(
      {
        id: row.id,
        subject: row.subject,
        organType: row.organType,
        kind: row.kind,
        status: row.status,
        publication: row.publication,
        decidedAt: row.decidedAt,
        finalPdfDigest: row.finalPdfDigest,
        finalPdfSealSignature: row.finalPdfSealSignature,
        esealId: row.esealId,
        votes: row.votes,
        signatureContext: row,
      },
      row.document ? { checkedBytes: Buffer.from(row.document.bytes) } : {}
    );
  },

  /**
   * Verifikasi lewat byte PDF yang DIUNGGAH pemindai.
   *
   * Mengikat keabsahan pada byte berkas yang dipegang pembaca, bukan pada
   * catatan server. Alur token saja akan meloloskan PDF palsu yang
   * mempertahankan token aslinya; di sini hash byte unggahan dihitung dan
   * dicocokkan dengan `finalPdfDigest` yang ditandatangani e-seal.
   *
   * Dicari lewat dua jalur: `finalPdfDigest` (indeks unik) dan `sha256` arsip.
   */
  async verifyByPdfBuffer(pdfBuffer: Buffer): Promise<FoundationDecisionVerificationDTO> {
    const uploadedDigest = sha256bytes(pdfBuffer);
    const select = {
      id: true,
      organType: true,
      kind: true,
      decisionType: true,
      subject: true,
      body: true,
      status: true,
      createdAt: true,
      quorumSnapshot: true,
      publication: true,
      decidedAt: true,
      finalPdfDigest: true,
      finalPdfSealSignature: true,
      esealId: true,
      members: { select: { userId: true } },
      votes: { include: { signingKey: { select: trustedKeySelect } } },
    } as const;

    const byFinal = await prisma.foundationDecision.findUnique({
      where: { finalPdfDigest: uploadedDigest },
      select,
    });
    const d =
      byFinal ??
      (await prisma.foundationDecision.findFirst({
        where: { document: { is: { sha256: uploadedDigest } } },
        select,
      }));

    if (!d) {
      // Tidak ada keputusan yang mengenal byte ini. Bentuk DTO tetap penuh,
      // sehingga halaman publik dapat menampilkan pesan yang benar alih-alih
      // galat bentuk.
      return emptyVerification(
        'Berkas PDF ini tidak terdaftar sebagai risalah/keputusan resmi Yayasan, atau isinya telah berubah sejak disahkan.'
      );
    }

    return this.verifyDecisionCore(
      {
        id: d.id,
        subject: d.subject,
        organType: d.organType,
        kind: d.kind,
        status: d.status,
        // Tanpa baris ini publikasi tidak sampai ke inti verifikasi, sehingga
        // keputusan yang sengaja diterbitkan tetap tampak PRIVATE di jalur
        // unggahan — kontrak yang sama harus berlaku di kedua jalur.
        publication: d.publication,
        decidedAt: d.decidedAt,
        finalPdfDigest: d.finalPdfDigest,
        finalPdfSealSignature: d.finalPdfSealSignature,
        esealId: d.esealId,
        votes: d.votes,
        signatureContext: d,
      },
      { checkedBytes: pdfBuffer, uploaded: true }
    );
  },

  /** Ambil dokumen PDF final untuk diunduh, atau 404 bila belum final. */
  async getFinalDocument(actor: Actor, decisionId: string) {
    const doc = await prisma.foundationDecisionDocument.findUnique({
      where: { decisionId },
      include: {
        decision: {
          select: {
            status: true,
            // Keanggotaan snapshot perlu ikut dibaca: unduhan diperlakukan sama
            // dengan pembacaan detail, dan anggota snapshot yang rolenya sudah
            // berubah tetap berhak mengunduh dokumen yang boleh ia tanda tangani.
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!doc || doc.decision.status !== FoundationDecisionStatus.APPROVED) {
      throw Errors.notFound('Dokumen final keputusan tidak ditemukan atau belum final.');
    }
    if (!canReadFoundationDecision(actor, doc.decision.members)) {
      throw Errors.forbidden('Anda tidak berhak mengunduh dokumen keputusan ini.');
    }
    return doc;
  },

  /** Render PDF risalah/keputusan final dari baris + relasinya. */
  async renderPdf(d: RichDecision): Promise<Buffer> {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
    // Nama diambil dari SNAPSHOT anggota (`FoundationDecisionMember.name`),
    // bukan dari profil pengguna hidup. Roster anggota adalah snapshot
    // immutable; memakai nama profil berarti mengganti nama setelah keputusan
    // dibuat akan mengubah PDF tersegel, sehingga identitas pada risalah
    // bertentangan dengan roster yang dijanjikan.
    const nameByUserId = new Map(d.members.map((m) => [m.userId, m.name]));
    const authenticVotes = this.authenticatedVotesOf(d);
    const votes: DecisionPdfVoteRow[] = authenticVotes.map((v) => ({
      userId: v.userId,
      name: nameByUserId.get(v.userId) ?? v.user.name,
      roleCode: roleByUserId.get(v.userId) ?? 'anggota',
      choice: v.choice,
      signedAt: v.signedAt,
      signatureShort: `${v.signature.slice(0, 16)}…`,
      note: v.note,
    }));
    const members: DecisionPdfMemberRow[] = canonicalMembersOf(d.organType, d.members).map((m) => ({
      userId: m.userId,
      name: m.name,
      roleCode: m.roleCode,
    }));
    // Rekap diturunkan LANGSUNG dari himpunan suara yang sedang dicetak, bukan
    // dari kolom `vote_summary` yang mungkin sudah usang. Himpunan suara yang
    // sama dengan yang diikat `approvalFingerprint` menghasilkan rekap yang
    // sama pula, sehingga PDF tidak pernah mencetak rekap yang berbeda dari
    // yang disahkan sidik jari.
    const summary = voteSummaryOf(
      authenticVotes,
      (d.quorumSnapshot as unknown as QuorumSnapshot).activeCount
    );

    return generateDecisionPdf({
      shortId: d.id.slice(0, 8).toUpperCase(),
      subject: d.subject,
      decisionType: d.decisionType,
      organType: d.organType,
      kind: d.kind,
      status: d.status,
      createdAt: d.createdAt,
      decidedAt: d.decidedAt,
      body: d.body,
      members,
      votes,
      voteSummary: summary,
      verificationToken: d.verificationToken,
      verificationUrl: d.verificationToken ? decisionVerificationUrl() : null,
    });
  },

  /** Bentuk DTO detail keputusan. */
  toDetailDTO(
    d: RichDecision,
    snapshot: QuorumSnapshot,
    summary: VoteSummary,
    canVote: boolean,
    canFinalize: boolean,
    publishable: boolean,
    canCancel: boolean,
    myVote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | null,
    myId: string,
    myRoleCode: string
  ) {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
    // Nama pemilih diambil dari SNAPSHOT anggota, bukan profil pengguna hidup —
    // sama dengan `renderPdf`. DTO ini menggambarkan keputusan yang sudah
    // terjadi, jadi mengganti nama profil setelahnya tidak boleh mengubah
    // identitas yang tercatat di dalamnya.
    const nameByUserId = new Map(d.members.map((m) => [m.userId, m.name]));
    // Tampilan resmi memakai suara AUTENTIK saja, himpunan yang sama dengan
    // yang dipakai kuorum, PDF, dan rekap verifikasi publik. Menampilkan baris
    // mentah membuat tabel di UI (dan `votedCount`) bertentangan dengan angka
    // yang benar-benar mengesahkan keputusan.
    const authenticVotes = this.authenticatedVotesOf(d);
    const invalidVoteCount = d.votes.length - authenticVotes.length;
    return {
      id: d.id,
      organType: d.organType,
      kind: d.kind,
      status: d.status,
      subject: d.subject,
      decisionType: d.decisionType,
      body: d.body,
      quorumSnapshot: snapshot,
      voteSummary: summary,
      finalPdfDigest: d.finalPdfDigest ?? null,
      verificationToken: d.verificationToken ?? null,
      publication: d.publication,
      decidedById: d.decidedById,
      decidedAt: d.decidedAt,
      createdAt: d.createdAt,
      createdByName: d.createdBy.name,
      decidedByName: d.decidedBy?.name ?? null,
      memberCount: d.members.length,
      votedCount: authenticVotes.length,
      canVote,
      canFinalize,
      publishable,
      canCancel,
      myVote,
      // Diagnostik manipulasi hanya untuk aktor berwenang; peran lain tidak
      // perlu tahu ada baris mentah yang tidak sah.
      invalidVoteCount: myRoleCode === RoleCode.SUPER_ADMIN ? invalidVoteCount : undefined,
      members: d.members.map((m) => ({ userId: m.userId, name: m.name, roleCode: m.roleCode })),
      votes: authenticVotes.map((v) => ({
        id: v.id,
        userId: v.userId,
        userName: nameByUserId.get(v.userId) ?? v.user.name,
        roleCode: roleByUserId.get(v.userId) ?? 'anggota',
        choice: v.choice,
        canonicalDigest: v.canonicalDigest,
        signature: v.signature,
        publicKey: v.publicKey,
        note: v.note,
        signedAt: v.signedAt,
      })),
      myUserId: myId,
    };
  },
};
