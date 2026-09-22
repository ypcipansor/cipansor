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
import { DEFAULT_FOUNDATION_RULE, decisionTypesForOrgan, quorumValueForMode } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { config } from '@/config';
import { evaluateQuorum, type QuorumEvaluation } from '@/utils/foundation-quorum';
import {
  organMayDecide,
  roleCodesForOrgan,
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
 * `UserSigningKey` dihapus saat kunci diterbitkan ulang, sehingga tanpa tabel
 * riwayat tidak ada tempat yang dapat dipercaya untuk memverifikasi suara
 * setelah rotasi. Rekaman dibuat idempoten lewat `upsert` pada
 * `(userId, fingerprint)`: menandatangani dua kali dengan kunci yang sama tidak
 * menciptakan baris ganda.
 *
 * Pencabutan kunci berlaku-untuk-masa-depan: rekaman lama TIDAK dicabut di
 * sini, sebab suara yang sudah sah harus tetap terverifikasi. Yang dicabut
 * hanyalah hak menandatangani baru, dan itu sudah ditegakkan `assertCanSign`
 * atas `UserSigningKey` sebelum sampai ke sini.
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
 * Empat hal yang diikat sekaligus, dan semuanya penting:
 *  - pemilihnya anggota organ pada SNAPSHOT yang terkunci (bukan peran hari
 *    ini), karena baris suara dapat disisipkan langsung ke basis data;
 *  - `canonicalDigest` tersimpan sama dengan digest yang dihitung ULANG dari
 *    isi keputusan + pilihan + waktu tanda tangan — mengubah `choice` di baris
 *    suara saja sudah cukup membuatnya berbeda;
 *  - kunci yang memverifikasi adalah kunci TEPERCAYA: baris suara harus
 *    menunjuk rekaman `user_signing_key_history` milik pemilih yang SAMA,
 *    dengan fingerprint yang cocok, dan byte kunci publik dari rekaman itulah
 *    yang memverifikasi tanda tangan;
 *  - `signature` benar-benar tanda tangan atas digest itu menurut kunci
 *    tepercaya tersebut, sehingga memalsukan pilihan menuntut kunci privat
 *    anggota.
 *
 * Pengikatan kunci (butir ketiga) adalah inti perbaikan audit #1. Sebelumnya
 * verifikasi memakai `vote.publicKey` — kunci yang ditulis pada baris suara itu
 * sendiri. Siapa pun yang dapat menulis langsung ke `foundation_decision_votes`
 * cukup membuat pasangan kunci baru, memakai `userId` seorang anggota snapshot,
 * menandatangani digest dengan kunci karangannya, lalu menyisipkan kunci publik
 * + tanda tangan yang cocok. Tanda tangan itu "sah" terhadap kuncinya sendiri,
 * sehingga suara palsu lolos dan memicu e-seal Yayasan. Sekarang `vote.publicKey`
 * hanya dipakai sebagai pembanding terhadap kunci tepercaya; kunci yang
 * benar-benar memverifikasi datang dari rekaman riwayat.
 *
 * Baris yang gagal di sini TIDAK boleh dihitung ke kuorum: tanpa pemeriksaan
 * ini, seorang admin basis data dapat menyisipkan suara "APPROVE" dan
 * keputusan memperoleh e-seal Yayasan yang sah atas dasar suara palsu.
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
 * Stempel waktu daur hidup dimuat dari awal (`issuedAt`, `supersededAt`,
 * `revokedAt`) tetapi sebelumnya tidak pernah DIBACA, sehingga kunci yang
 * dicabut atau diganti tetap tampak berlaku selamanya bagi setiap suara yang
 * menunjuk rekamannya. Tiga aturan, sengaja dibedakan:
 *
 *  - `issuedAt`: tanda tangan sebelum kunci diterbitkan mustahil secara
 *    kriptografis. Baris seperti itu tidak sah kapan pun.
 *  - `revokedAt`: tanda tangan pada/di setelah pencabutan ditolak. Pencabutan
 *    justru dimaksudkan menghentikan pemakaian BARU; tanpa batas ini, kunci
 *    yang bocor lalu dicabut tetap dapat dipakai menandatangani selamanya.
 *  - `supersededAt`: tanda tangan pada/di setelah kunci digantikan ditolak
 *    sebagai tanda tangan baru. Kunci pengganti sudah ada dan semestinya
 *    dipakai; menerima kunci lama akan membuat rotasi tidak bermakna.
 *
 * **Suara HISTORIS tetap dapat diverifikasi.** Acuan waktunya adalah
 * `vote.signedAt` — waktu tanda tangan itu dibuat — bukan hari ini. Tanda
 * tangan yang dibuat sebelum pencabutan/penggantian karena itu tetap sah; yang
 * ditolak hanyalah tanda tangan SETELAH peristiwa itu. Karena `signedAt`
 * termasuk payload kanonis yang diverifikasi terhadap tanda tangan, penyerang
 * tidak dapat memindah-mundurkan `signedAt` tanpa memalsukan tanda tangan.
 */
function keyUsableAt(record: UserSigningKeyHistory, at: Date): boolean {
  if (at < record.issuedAt) return false;
  if (record.revokedAt && at >= record.revokedAt) return false;
  if (record.supersededAt && at >= record.supersededAt) return false;
  return true;
}

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
 * di sela-selanya, sidik jarinya berbeda dan artefaknya dirender ulang.
 *
 * Rekap suara (`voteSummary`) ikut diikat, bukan hanya daftar suara. Tanpa itu,
 * artefak preview yang dirender SEBELUM suara penentu dapat dinyatakan masih
 * cocok ketika suara itu masuk — sidik jarinya sama, tetapi PDF-nya mencetak
 * rekap yang sudah usang, sedangkan basis data menyimpan rekap yang baru.
 */
function approvalFingerprint(d: RichDecision): string {
  const authentic = d.votes.filter((v) => isVoteAuthentic(d, v));
  const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
  return sha256hex(
    JSON.stringify({
      id: d.id,
      subject: d.subject,
      body: d.body,
      decisionType: d.decisionType,
      members: d.members.map((m) => m.userId),
      votes: authentic.map((v) => `${v.userId}:${v.canonicalDigest}`).sort(),
      voteSummary: voteSummaryOf(authentic, snapshot.activeCount),
    })
  );
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
 * e-seal (scrypt) dapat dikerjakan DI LUAR kunci baris keputusan. Dulu semuanya
 * berjalan selagi `SELECT … FOR UPDATE` dipegang, sehingga satu keputusan yang
 * sedang difinalkan memblokir suara anggota lain selama puluhan milidetik
 * kripto. `fingerprint` mengikat artefak ke isi keputusan + himpunan suara yang
 * dirender; bila di dalam kunci ternyata himpunannya berbeda (pemilih lain
 * masuk di sela-sela), artefak dibuang dan dirender ulang — jadi pemisahan ini
 * tidak melonggarkan jaminan apa pun.
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
  members: { include: { user: { select: { id: true, name: true } } } },
  votes: {
    include: {
      user: { select: { id: true, name: true } },
      signingKey: { select: trustedKeySelect },
    },
    orderBy: { signedAt: 'asc' as const },
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
 * Sengaja tidak mengambil "seal tertua": seal yang sudah dicabut bukan seal
 * yang boleh membubuhkan tanda tangan baru, dan mengambilnya akan menghasilkan
 * tanda tangan baru di bawah kunci yang sudah tidak berlaku.
 *
 * Sebuah seal `revokedAt: null` pun belum tentu dapat dipakai. Setelah
 * `FOUNDATION_ESEAL_PASSPHRASE` dirotasi, seal lama masih aktif tetapi kunci
 * privatnya tersegel dengan passphrase lama, sehingga `signSeal` melempar dan
 * transaksi approval rollback — keputusan tak pernah tertutup. Karena itu
 * kandidat disaring dengan probe kemampuan menandatangani memakai passphrase
 * SEKARANG; bila tak satu pun mampu, seal baru diterbitkan. Keputusan lama
 * tetap dapat diverifikasi karena verifikasi memakai kunci PUBLIK seal yang
 * tercatat di barisnya, bukan passphrase hari ini.
 *
 * **Invariant satu seal aktif ditegakkan basis data, bukan disiplin aplikasi.**
 * Pola find-then-create di bawah memiliki balapan yang nyata: dua approval
 * pertama yang berjalan paralel sama-sama membaca "tidak ada seal yang dapat
 * dipakai", lalu sama-sama membuat seal baru. Sebuah indeks unik parsial
 * (`foundation_eseals_single_active_key`, lihat migrasi
 * `20260917000000_foundation_decision_vote_key_binding`) membuat keadaan
 * "dua seal aktif" mustahil. Balapan aplikasi ditangani dengan menangkap
 * pelanggaran unik lalu membaca ulang pemenangnya — sehingga kedua permintaan
 * memakai seal yang SAMA, bukan dua seal berbeda.
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
 * Catat percobaan passphrase gagal; dikunci setelah ambang esign tercapai.
 *
 * Penaikan sekaligus penghitungan `locked_until` terjadi dalam SATU pernyataan
 * SQL atomik. Bentuk lama (`update` increment, lalu `update` KEDUA yang menulis
 * `lockedUntil` dari hasil bacaan) meninggalkan celah balapan: pada kegagalan
 * paralel, update kedua dapat berjalan terbalik — percobaan yang menembus
 * ambang menulis lockout lebih dulu, lalu percobaan lain yang hasil bacanya
 * lebih rendah menimpanya dengan `null`, sehingga kunci justru terbuka tepat
 * ketika ia seharusnya terkunci. Menghitung `locked_until` dari
 * `failed_attempts + 1` di dalam basis data menutup celah itu, karena setiap
 * penulis memakai nilai barisnya sendiri, bukan nilai yang dibaca sebelumnya.
 */
async function recordFailedAttempt(keyId: string): Promise<number> {
  // Satu pernyataan untuk keduanya. Dua `update` terpisah pernah membuat
  // `lockedUntil` ditulis dari luar urutan: percobaan yang increment-nya lebih
  // dulu menembus ambang menulis lockout, lalu percobaan lain — yang membaca
  // `failedAttempts` lebih rendah — menimpanya dengan `null`, sehingga lockout
  // hilang dan tebakan passphrase kembali gratis. Di sini `locked_until`
  // dihitung dari `failed_attempts + 1` DI DALAM basis data, jadi nilai yang
  // tersimpan selalu mencerminkan hitungan tertinggi yang pernah terjadi.
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
 * Mesin kuorum (`requiredCount`) mengabaikan nilai pecahan yang tersimpan dan
 * memakai `quorumValueForMode(mode)` — label mode adalah janji yang dibaca
 * orang. Skema penyimpanan (`upsertFoundationRuleSchema`) sudah menolak nilai
 * yang menyimpang, tetapi itu hanya menjaga penulisan BARU lewat API. Baris
 * yang ditulis sebelum refinement itu ada — atau disisipkan langsung ke basis
 * data — tetap dapat memuat mode TWO_THIRDS dengan value 0.5.
 *
 * Baris seperti itu tidak mengubah ambang yang DITEGAKKAN (mode yang menang),
 * tetapi membuat API MENAMPILKAN nilai yang berbeda dari yang benar-benar
 * dievaluasi: halaman pengelolaan aturan membaca `quorumPresentValue`/
 * `quorumDecisionValue` apa adanya. Normalisasi ini membuat yang ditampilkan
 * sama persis dengan yang dievaluasi, tanpa menyentuh basis data.
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
    // SATU orang dapat memegang lebih dari satu peran yang tergolong organ yang
    // sama (Sekretaris merangkap Bendahara, dsb.). Snapshot menyimpan satu
    // jabatan per orang, jadi penyusutan dilakukan FUNGSI MURNI
    // `selectSnapshotAssignments`: penugasan `isPrimary` menang, lalu senioritas
    // jabatan per organ, lalu tie-break leksikografis. `distinct: ['userId']`
    // yang lama TIDAK punya urutan yang dijanjikan, sehingga jabatan pada PDF
    // ber-e-seal dapat berubah mengikuti rencana query — bukan kebijakan organ.
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
     * Dulu `auditLog.create` dipanggil setelah `$transaction` selesai. Bila
     * auditnya gagal, keputusan sudah ter-commit tetapi permintaan melempar
     * galat — dan karena token verifikasinya acak, tidak ada unique yang
     * mencegah percobaan ulang membuat keputusan DUPLIKAT: dua keputusan
     * identik dengan dua pemungutan suara, dua PDF, dan dua e-seal. Di dalam
     * transaksi, kegagalan audit membatalkan pembuatan sekaligus, sehingga
     * pemanggil dapat mencoba lagi tanpa meninggalkan sisa.
     */
    const decisionId = await prisma.$transaction(async (tx) => {
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
            create: assignments.map((a) => ({
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
    const canVote =
      d.status === FoundationDecisionStatus.VOTING && d.members.some((m) => m.userId === actor.id);
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
    // Ringkasan dihitung ULANG dari himpunan suara yang memuat `previewVote`.
    // Sebelumnya `voteSummary` lama dipertahankan, sehingga artefak preview
    // dapat lolos pemeriksaan sidik jari sementara PDF-nya mencetak rekap
    // SEBELUM suara penentu — sedangkan basis data menyimpan rekap yang sudah
    // memuatnya. Selisih itu terlihat pada risalah final yang di-e-seal.
    const previewDecision = {
      ...d,
      votes: [...d.votes, previewVote],
    } as unknown as RichDecision;
    const previewSummary = voteSummaryOf(
      this.authenticatedVotesOf(previewDecision),
      (previewDecision.quorumSnapshot as unknown as QuorumSnapshot).activeCount
    );
    previewDecision.voteSummary = previewSummary as unknown as Prisma.JsonValue;
    const previewEvaluation = evaluateQuorum(
      previewDecision.quorumSnapshot as unknown as QuorumSnapshot,
      this.votesOf(previewDecision)
    );
    // Kerja mahal (render PDF + buka kunci e-seal) dikerjakan DI LUAR kunci
    // baris. Sebelumnya semua ini berjalan selagi `SELECT … FOR UPDATE`, jadi
    // satu finalisasi menahan suara anggota lain selama kripto berlangsung.
    let previewArtifact: ApprovalArtifact | null = null;
    if (
      previewEvaluation.outcome === 'APPROVED' &&
      previewDecision.status !== FoundationDecisionStatus.APPROVED
    ) {
      previewArtifact = await this.prepareApprovalArtifact(actor, previewDecision);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Kunci baris keputusan dan periksa ulang status DI DALAM transaksi.
      // Pembuatan suara, pembacaan ulang suara, evaluasi kuorum, dan
      // finalisasi berjalan atomik terhadap pemilih paralel.
      await lockDecision(tx, d.id);
      const lockedRow = await tx.foundationDecision.findUnique({
        where: { id: d.id },
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

      const vote = await tx.foundationDecisionVote.create({
        data: {
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
        },
      });

      const votes = await tx.foundationDecisionVote.findMany({
        where: { decisionId: d.id },
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
        where: { id: d.id },
        data: { voteSummary: summary as unknown as Prisma.InputJsonValue },
      });

      // Evaluasi atas baris yang sudah memuat suara ini, masih di dalam kunci.
      const freshRow = await tx.foundationDecision.findUnique({
        where: { id: d.id },
        include: decisionInclude,
      });
      const fresh = freshRow as unknown as RichDecision;
      const evaluation = evaluateQuorum(
        fresh.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(fresh)
      );
      // Artefak yang disiapkan di luar kunci hanya dipakai bila sidik jarinya
      // masih sama. Bila pemilih lain menyisipkan suara di sela-selanya, PDF
      // dirender ulang di sini supaya himpunan suara yang dicetak tetap benar.
      const artifact =
        previewArtifact && previewArtifact.fingerprint === approvalFingerprint(fresh)
          ? previewArtifact
          : null;
      const outcome = await this.applyLocked(actor, fresh, evaluation, tx, artifact ?? undefined);

      // Audit VOTE ditulis DI DALAM transaksi yang sama dengan suaranya. Bila
      // ditulis di luar (seperti dulu), kegagalan `auditLog.create` membuat
      // suara sudah tercommit tetapi `castVote` melempar galat — retry ditolak
      // sebagai suara ganda dan suara sah kehilangan baris auditnya. Di sini
      // keduanya ikut rollback bersama.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'VOTE',
          entity: 'FoundationDecisionVote',
          entityId: vote.id,
          newValues: { decisionId: d.id, choice },
        },
      });

      // Passphrase benar: buka hitungan gagal, juga di dalam transaksi agar
      // tidak ada pembaruan kunci yang lolos ketika suaranya gagal.
      await clearFailedAttempts(signingKey!.id, tx);

      return { vote, summary, outcome };
    });

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
   * Finalisasi berarti **menutup** rapat/pemungutan: hasil dihitung SEKALI
   * terhadap himpunan suara yang ada, dengan `closed: true`. Inilah satu-satunya
   * cara sebuah RAPAT memperoleh hasil akhir — sebelumnya rapat menutup diri
   * sendiri begitu peserta yang sedang hadir menyetujui, sehingga anggota yang
   * datang kemudian ditolak dan hasil akhir bergantung pada urutan suara.
   *
   * Kuorum hadir tetap wajib: rapat yang belum memenuhi kuorum tidak dapat
   * ditutup dengan hasil apa pun (`outcome === 'OPEN'` → ditolak). Setelah
   * kuorum hadir terpenuhi, pemimpin rapat bebas menutupnya sebagai APPROVED
   * atau REJECTED tanpa menunggu anggota yang absen — anggota absen tidak boleh
   * membuat keputusan menggantung selamanya.
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
    const previewEvaluation = evaluateQuorum(
      d.quorumSnapshot as unknown as QuorumSnapshot,
      this.votesOf(d),
      { closed: true }
    );
    // Sama seperti `castVote`: render PDF + e-seal disiapkan di luar kunci.
    let previewArtifact: ApprovalArtifact | null = null;
    if (
      previewEvaluation.outcome === 'APPROVED' &&
      d.status !== FoundationDecisionStatus.APPROVED
    ) {
      previewArtifact = await this.prepareApprovalArtifact(actor, d);
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
        { closed: true }
      );
      if (evaluation.outcome === 'OPEN') {
        throw Errors.badRequest(
          `Kuorum belum terpenuhi (hadir ${evaluation.presentCount}/${evaluation.presentRequired}, butuh ${evaluation.neededToApprove} setuju lagi); rapat belum dapat ditutup.`
        );
      }
      const artifact =
        previewArtifact && previewArtifact.fingerprint === approvalFingerprint(locked)
          ? previewArtifact
          : null;
      return this.applyLocked(actor, locked, evaluation, tx, artifact ?? undefined);
    });
  },

  /**
   * Ubah klasifikasi publikasi metadata (SUPER_ADMIN).
   *
   * Terpisah dari finalisasi dengan sengaja: memutuskan hasil rapat dan
   * menerbitkan judul + rekap suaranya ke internet adalah dua keputusan yang
   * berbeda. Dijalankan dengan `authenticate` + `authorize(SUPER_ADMIN)` di
   * rute, dan setiap perubahan dicatat ke audit karena ia mengubah apa yang
   * dapat dibaca publik.
   *
   * **Policy `PUBLIC` (eksplisit, bukan efek samping):** publikasi hanya
   * bermakna bagi keputusan final yang sah, jadi `PUBLIC` hanya diterima bila
   * status `APPROVED` DAN artefak finalnya lengkap — `finalPdfDigest`, tanda
   * tangan e-seal, `esealId`, dan arsip dokumen. Endpoint verifikasi anonim
   * sendiri hanya menganggap `APPROVED` valid; tanpa syarat ini, draf/VOTING
   * dapat ditandai `PUBLIC` dan menciptakan janji publik yang belum bermakna
   * (metadata tampil, tetapi `isValid` tetap false sampai disahkan).
   * `REJECTED` TIDAK boleh diterbitkan — keputusan yang gugur bukan risalah
   * yang layak dipublikasikan, dan menerbitkannya membocorkan metadata tata
   * kelola tanpa dasar. Perubahan kembali ke `PRIVATE` selalu boleh, kapan pun,
   * sebagai jalan keluar darurat.
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
    await prisma.$transaction(async (tx) => {
      // Update bersyarat ATOMIK: status & artefak diperiksa ulang di dalam
      // transaksi, sehingga finalisasi yang berjalan bersamaan tidak dapat
      // membuat kondisi berubah di antara pemeriksaan dan penulisan.
      const updated = await tx.foundationDecision.updateMany({
        where:
          publication === FoundationDecisionPublication.PUBLIC
            ? {
                id: decisionId,
                status: FoundationDecisionStatus.APPROVED,
                finalPdfDigest: { not: null },
                finalPdfSealSignature: { not: null },
                esealId: { not: null },
                document: { isNot: null },
              }
            : { id: decisionId },
        data: { publication },
      });
      if (updated.count === 0) {
        throw Errors.badRequest(
          'Hanya keputusan yang sudah disahkan dengan dokumen final dan e-seal lengkap yang dapat diterbitkan.'
        );
      }
      // Audit berada di transaksi yang SAMA: kegagalan mencatat membatalkan
      // perubahan, sehingga tidak ada perubahan publikasi tanpa jejak.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'FoundationDecision',
          entityId: decisionId,
          oldValues: { publication: d.publication },
          newValues: { publication },
        },
      });
    });
    return { id: decisionId, publication, updatedAt: at.toISOString() };
  },

  /**
   * Terapkan hasil kuorum: APPROVED (render PDF + e-seal) atau REJECTED.
   *
   * `d` harus merupakan baris HASIL AKHIR (status sudah diperbarui) ketika
   * `evaluation.outcome === 'APPROVED'`, karena PDF yang di-e-seal mencetak
   * status dan `decidedAt` dari sini: merender baris VOTING mencetak "Status:
   * VOTING" dan menghilangkan tanggal putusan ke dalam arsip permanen, dan
   * digest-nya mengunci kesalahan itu selamanya.
   *
   * Pemisahan kerja mahal dari kunci (item 8) ditangani pemanggil: `applyLocked`
   * menjalankan fungsi ini DI DALAM kunci (agar tetap benar saat dipanggil
   * langsung oleh test/controller), sedangkan `castVote`/`finalize` merender
   * artefaknya di luar kunci lewat `prepareApprovalArtifact` + `commitApproved`.
   */
  async applyOutcome(
    actor: Actor,
    d: RichDecision,
    evaluation: QuorumEvaluation,
    client: DbClient = prisma
  ) {
    const ownTransaction = client === prisma;
    const run = async (tx: DbClient) => this.applyLocked(actor, d, evaluation, tx);
    return ownTransaction ? prisma.$transaction(run) : run(client);
  },

  /**
   * Bentuk persetujuan saat baris keputusan terkunci.
   *
   * Kerja yang memegang kunci sekecil mungkin: hanya penulisan status. PDF
   * final dan e-seal sudah disiapkan sebelum kunci diambil (atau disiapkan
   * sekarang bila pemanggil memanggil `applyOutcome` langsung), dan
   * `prepared.seal` DIREUSE alih-alih memanggil `ensureSeal` lagi — scrypt di
   * dalam kunci-lah yang memperpanjang lockout baris.
   */
  async applyLocked(
    actor: Actor,
    d: RichDecision,
    evaluation: QuorumEvaluation,
    client: DbClient,
    prepared?: ApprovalArtifact
  ) {
    if (evaluation.outcome === 'APPROVED' && d.status !== FoundationDecisionStatus.APPROVED) {
      const artifact =
        prepared && prepared.fingerprint === approvalFingerprint(d)
          ? prepared
          : await this.prepareApprovalArtifact(actor, d, client);

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
   * dirender ulang di dalam kunci.
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
      // Audit ditulis DI DALAM transaksi yang sama dengan perubahannya. Sebelum
      // ini keduanya terpisah: kegagalan `auditLog.create` meninggalkan aturan
      // kuorum yang SUDAH berubah tetapi tanpa jejak audit — dan aturan kuorum
      // menentukan ambang yang mengesahkan keputusan, sehingga perubahan yang
      // tak tercatat justru yang paling perlu tercatat.
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
     * Dulu ia menuntut `signSeal(sealMaterial, SEAL_PASSPHRASE, digest)` sama
     * dengan tanda tangan tersimpan, yang berarti mendekripsi kunci privat
     * dengan passphrase yang berlaku SEKARANG. Setelah passphrase e-seal
     * dirotasi, setiap keputusan lama tiba-tiba gagal diverifikasi — padahal
     * tidak ada yang berubah pada dokumennya. Yang membuktikan keaslian adalah
     * kunci publik yang tercatat bersama tanda tangan itu, dan kunci publik
     * tidak pernah berubah oleh rotasi passphrase.
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
     * finalisasi. Sebelumnya ia menghitung seluruh baris `foundation_decision_votes`
     * apa adanya, sehingga suara palsu hasil sisipan langsung ke basis data
     * mengubah angka yang dilihat pengunjung halaman verifikasi, sekalipun
     * suara itu tidak pernah masuk ke PDF tersegel.
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
     * Endpoint ini anonim. `subject`/organ/tanggal/rekap suara dapat mengungkap
     * personalia atau operasi internal ("Pemberhentian Sementara Pengurus X"),
     * dan tautan ataupun berkas PDF dapat sampai ke tangan pihak luar tanpa
     * persetujuan yayasan untuk mempublikasikan ISI-nya. Karena itu metadata
     * hanya keluar bila keputusannya memang `PUBLIC`; bawaannya PRIVATE —
     * fail closed, sehingga keputusan lama tidak membocorkan apa pun sampai
     * seseorang sengaja menerbitkannya.
     *
     * Yang TIDAK disensor adalah bukti keabsahan: `isValid`, `digest`,
     * `archiveDigest`, `digestOk`, `sealVerified`, `reason`, dan `decisionId`
     * (referensi non-sensitif). Pemindai tetap dapat menjawab "dokumen ini sah?"
     * — itulah satu-satunya pertanyaan yang halaman verifikasi publik janjikan.
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
    const members: DecisionPdfMemberRow[] = d.members.map((m) => ({
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
    // sama dengan `renderPdf`. DTO ini menggambarkan keputusan historis, jadi
    // mengganti nama profil setelah keputusan dibuat tidak boleh mengubah
    // identitas yang tercatat di dalamnya (audit #4).
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
