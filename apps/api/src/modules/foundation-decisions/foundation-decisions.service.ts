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
 * Tidak mengambil "seal tertua" (mungkin sudah dicabut), dan menyaring kandidat
 * dengan probe kemampuan menandatangani memakai passphrase SEKARANG — pasca
 * rotasi passphrase, seal lama masih aktif tetapi kuncinya tersegel dengan
 * passphrase lama. **Invariant satu seal aktif ditegakkan basis data** lewat
 * indeks unik parsial `foundation_eseals_single_active_key`; find-then-create di
 * bawah memiliki balapan nyata (dua approval paralel). Lihat §7.4 dokumen review.
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
 */
async function lockDecision(client: DbClient, id: string): Promise<void> {
  await client.$executeRaw`SELECT id FROM foundation_decisions WHERE id = ${id} FOR UPDATE`;
}

/**
 * Kunci baris penugasan organ yang menjadi dasar snapshot, lalu baca ULANG.
 *
 * `create` membaca penugasan SEBELUM transaksi untuk menyusun snapshot. Antara
 * pembacaan itu dan komit, `roles.service` dapat mencabut atau mengubah
 * penugasan tersebut. Tanpa kunci, snapshot immutable dapat membekukan anggota
 * yang sudah tidak sah beserta hak suaranya.
 *
 * `FOR UPDATE` di sini membuat pencabutan/penggantian yang menyentuh baris yang
 * SAMA menunggu sampai transaksi ini selesai; pencabutan yang menimpa baris
 * lain tetap tertangkap karena baris dibaca ULANG di dalam transaksi dan
 * dibandingkan. Baris yang dihapus tidak lagi muncul di hasil baca ulang —
 * itulah yang membuat `assertSnapshotStillMatches` menolaknya.
 */
async function lockAndRereadOrganAssignments(
  client: DbClient,
  organType: FoundationOrganType,
  assignmentIds: string[]
): Promise<
  Array<{
    id: string;
    userId: string;
    isPrimary: boolean;
    user: { id: string; name: string };
    role: { code: string };
  }>
> {
  if (assignmentIds.length === 0) return [];
  // `Prisma.join` menyusun daftar parameter yang aman (bukan interpolasi teks).
  await client.$queryRaw`
    SELECT "id" FROM "user_role_assignments"
    WHERE "id" IN (${Prisma.join(assignmentIds)})
    FOR UPDATE`;
  return client.userRoleAssignment.findMany({
    where: {
      id: { in: assignmentIds },
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
 * Bandingkan SNAPSHOT tersusut pra-transaksi dengan hasil baca ulang pasca-lock.
 *
 * Yang dibandingkan adalah hasil penyusutan `selectSnapshotAssignments` —
 * himpunan (userId, roleCode) yang benar-benar masuk ke baris anggota — bukan
 * daftar penugasan mentah. Perbandingan pada penugasan mentah akan menandai
 * "berubah" ketika hanya peran ganda yang kalah disusutkan yang dicabut,
 * padahal roster anggota tidak berubah; membandingkan hasil susutan mengukur
 * invariant yang tepat. Bila berbeda, `create` membatalkan transaksinya dengan
 * conflict: menulis snapshot basi berarti membekukan anggota yang telah dicabut
 * dan memberinya hak suara pada keputusan yang ditandatangani e-seal.
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
  return {
    ...rule,
    quorumPresentValue: quorumValueForMode(rule.quorumPresentMode),
    quorumDecisionValue: quorumValueForMode(rule.quorumDecisionMode),
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
    // Snapshot hanya memuat anggota yang benar-benar berhak HARI INI: peran
    // aktif, penugasan belum kedaluwarsa, dan akunnya sendiri masih aktif.
    // Anggota yang sudah habis masa tugasnya tidak boleh menggelembungkan
    // kuorum yang terkunci selamanya.
    //
    // SATU orang dapat memegang lebih dari satu peran dalam organ yang sama
    // (Sekretaris merangkap Bendahara, dsb.), sedangkan snapshot menyimpan satu
    // jabatan per orang. Penyusutan memakai FUNGSI MURNI
    // `selectSnapshotAssignments`: penugasan `isPrimary` menang, lalu senioritas
    // jabatan per organ, lalu tie-break leksikografis. Urutannya harus
    // ditetapkan eksplisit — `distinct` tanpa kriteria tidak menjanjikan
    // jabatan mana yang bertahan, sehingga jabatan pada PDF ber-e-seal dapat
    // berubah mengikuti rencana query, bukan kebijakan organ.
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

    const rule = await this.loadRule(input.organType, input.kind);
    const snapshot: QuorumSnapshot = {
      organType: input.organType,
      kind: input.kind,
      activeCount: assignments.length,
      presentMode: rule.quorumPresentMode,
      presentValue: rule.quorumPresentValue,
      decisionMode: rule.quorumDecisionMode,
      decisionValue: rule.quorumDecisionValue,
    };
    const emptySummary: VoteSummary = {
      approve: 0,
      reject: 0,
      abstain: 0,
      present: 0,
      active: assignments.length,
      totalVotes: 0,
    };

    /**
     * Pembuatan keputusan dan baris auditnya berbagi SATU transaksi.
     *
     * Bila audit ditulis di luar transaksi dan gagal, keputusan sudah
     * ter-commit tetapi permintaan melempar galat — dan karena token
     * verifikasinya acak, tidak ada unique yang mencegah percobaan ulang
     * membuat keputusan DUPLIKAT (dua pemungutan suara, dua PDF, dua e-seal).
     * Di dalam transaksi, kegagalan audit membatalkan pembuatan sekaligus.
     *
     * Keanggotaan snapshot divalidasi ULANG di dalam transaksi: baris penugasan
     * dikunci (`FOR UPDATE`) dan dibaca lagi, sehingga pencabutan/penggantian
     * peran konkuren tidak dapat membekukan anggota tak sah ke dalam snapshot
     * beserta hak suaranya. Bila himpunan berubah, operasi dibatalkan atomik.
     */
    const decisionId = await prisma.$transaction(async (tx) => {
      const lockedRows = await lockAndRereadOrganAssignments(
        tx,
        input.organType,
        assignmentRows.map((a) => a.id)
      );
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
    kind: FoundationDecisionKind
  ): Promise<FoundationDecisionRule> {
    const found = await prisma.foundationDecisionRule.findUnique({
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
          _count: { select: { members: true, votes: true } },
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
      memberCount: r._count.members,
      votedCount: r._count.votes,
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
    const hasVoted = d.votes.some((v) => v.userId === actor.id);
    const canVote =
      d.status === FoundationDecisionStatus.VOTING &&
      !hasVoted &&
      d.members.some((m) => m.userId === actor.id);
    // Eligibility finalisasi dihitung dengan definisi yang SAMA dengan
    // `finalize` — bukan dari role saja. UI tidak boleh menawarkan tombol yang
    // peladen pasti tolak (Pengawas membuka keputusan organ lain).
    const canFinalize =
      d.status === FoundationDecisionStatus.VOTING && canFinalizeDecision(actor, d.members);
    // Syarat publikasi dihitung dengan definisi yang SAMA dengan
    // `setPublication`, sehingga UI tidak menawarkan "Terbitkan" pada
    // draf/VOTING yang peladen tolak.
    const publishable =
      d.status === FoundationDecisionStatus.APPROVED &&
      !!d.finalPdfDigest &&
      !!d.finalPdfSealSignature &&
      !!d.esealId &&
      !!d.document;
    const mine = d.votes.find((v) => v.userId === actor.id);
    return this.toDetailDTO(
      d,
      snapshot,
      summary,
      canVote,
      canFinalize,
      publishable,
      mine?.choice ?? null,
      actor.id
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
    if (d.votes.some((v) => v.userId === actor.id)) {
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
      if (locked.votes.some((v) => v.userId === actor.id)) {
        throw Errors.badRequest('Anda sudah memberikan suara pada keputusan ini.');
      }

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
        if (!(err instanceof StaleArtifactError) || attempt >= 2) throw err;
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
   * Finalisasi manual oleh pimpinan/kepala rapat.
   *
   * Finalisasi **menutup** rapat: hasil dihitung SEKALI dengan `closed: true`.
   * Kuorum hadir tetap wajib; setelah terpenuhi pimpinan bebas memilih APPROVED
   * atau REJECTED tanpa menunggu anggota absen.
   *
   * **CIRCULAR: tidak ada penutupan dini.** `closed` sengaja tidak diteruskan
   * (`closed: d.kind !== 'CIRCULAR'`) karena sirkuler tidak punya rapat untuk
   * ditutup — hasilnya hanya bergantung pada himpunan suara. Sirkuler baru
   * APPROVED saat ambang mufakat tercapai, REJECTED saat mufakat terbukti
   * mustahil, dan selama masih mungkin statusnya tetap VOTING. Lihat §7.6
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
    const runFinalize = async (bound: RichDecision) => {
      // Evaluasi + artefak dihitung dari baris `bound` yang segar SETIAP
      // percobaan, di luar kunci. Memakai artefak lama pada percobaan ulang
      // akan selamanya basi dan berujung pada kegagalan.
      const boundEvaluation = evaluateQuorum(
        bound.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(bound),
        { closed: bound.kind !== 'CIRCULAR' }
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
      const evaluation = evaluateQuorum(
        locked.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(locked),
        { closed: locked.kind !== 'CIRCULAR' }
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
      const saved = await tx.foundationDecisionRule.upsert({
        where: {
          organType_decisionKind: { organType: input.organType, decisionKind: input.decisionKind },
        },
        create: { ...input, updatedById: actor.id },
        update: {
          quorumPresentMode: input.quorumPresentMode,
          quorumPresentValue: input.quorumPresentValue,
          quorumDecisionMode: input.quorumDecisionMode,
          quorumDecisionValue: input.quorumDecisionValue,
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
          newValues: { organType: input.organType, decisionKind: input.decisionKind },
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
    myVote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | null,
    myId: string
  ) {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
    // Nama pemilih diambil dari SNAPSHOT anggota, bukan profil pengguna hidup —
    // sama dengan `renderPdf`. DTO ini menggambarkan keputusan yang sudah
    // terjadi, jadi mengganti nama profil setelahnya tidak boleh mengubah
    // identitas yang tercatat di dalamnya.
    const nameByUserId = new Map(d.members.map((m) => [m.userId, m.name]));
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
      votedCount: d.votes.length,
      canVote,
      canFinalize,
      publishable,
      myVote,
      members: d.members.map((m) => ({ userId: m.userId, name: m.name, roleCode: m.roleCode })),
      votes: d.votes.map((v) => ({
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
