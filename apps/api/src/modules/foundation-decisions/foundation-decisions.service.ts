import { createHash, randomBytes } from 'crypto';
import {
  FoundationDecision,
  FoundationDecisionMember,
  FoundationDecisionRule,
  FoundationDecisionStatus,
  FoundationDecisionVote,
  FoundationEseal,
  Prisma,
} from '@prisma/client';
import type {
  CastFoundationVoteInput,
  CreateFoundationDecisionInput,
  FoundationDecisionKind,
  FoundationDecisionVerificationDTO,
  FoundationOrganType,
  ListFoundationDecisionsQuery,
  QuorumSnapshot,
  UpsertFoundationRuleInput,
  VoteSummary,
} from '@cipansor/shared';
import { DEFAULT_FOUNDATION_RULE } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { config } from '@/config';
import { evaluateQuorum, type QuorumEvaluation } from '@/utils/foundation-quorum';
import { organMayDecide, roleCodesForOrgan } from '@/utils/foundation-authority';
import {
  EsignError,
  MAX_PASSPHRASE_ATTEMPTS,
  lockoutUntil,
  signPdfHash,
  verifyPdfHashSignature,
  type EncryptedKeyMaterial,
  type ScryptParams,
} from '@/utils/esign';
import { assertCanSign } from '@/utils/esign-lifecycle';
import { createSealMaterial, sealCanSign, signSeal, toSealMaterial } from '@/utils/foundation-eseal';
import { decisionVerificationUrl } from '@/utils/verification-url';
import { generateDecisionPdf } from '@/utils/generate-decision-pdf';
import type { DecisionPdfVoteRow, DecisionPdfMemberRow } from '@/utils/generate-decision-pdf';

// Default legal hidup di `@cipansor/shared` supaya halaman pengelolaan aturan
// menampilkan nilai yang benar-benar berlaku, bukan salinan yang bisa basi.
const DEFAULT_RULE = DEFAULT_FOUNDATION_RULE;

/** Hash teks kanonis (payload suara, dsb). Selalu UTF-8. */
function sha256hex(text: string): string {
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

function toMemberMaterial(key: {
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

type VoteWithUser = FoundationDecisionVote & { user: { id: string; name: string } };
type MemberWithUser = FoundationDecisionMember & { user: { id: string; name: string } };
type RichDecision = FoundationDecision & {
  members: MemberWithUser[];
  votes: VoteWithUser[];
  createdBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
};

const decisionInclude = {
  members: { include: { user: { select: { id: true, name: true } } } },
  votes: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { signedAt: 'asc' as const },
  },
  createdBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.FoundationDecisionInclude;

type Actor = { id: string; roleCode: string };
/** Klien Prisma di dalam transaksi interaktif (atau prisma itu sendiri). */
type DbClient = Prisma.TransactionClient;

/**
 * Bentuk DTO verifikasi saat tidak ada yang dapat dinyatakan.
 *
 * Fungsi, bukan konstanta: sebuah objek yang dibagikan lalu disebar oleh
 * pemanggil akan tetap terlihat sama, tetapi nilai `null`-nya mudah tertukar
 * dengan "belum diperiksa" pada pemakaian berikutnya.
 */
function emptyVerification(
  reason: string | null = null
): FoundationDecisionVerificationDTO {
  return {
    found: false,
    isValid: false,
    decisionId: null,
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
 */
async function ensureSeal(client: DbClient = prisma): Promise<FoundationEseal> {
  const candidates = await client.foundationEseal.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const usable = candidates.find((seal) =>
    sealCanSign(sealMaterial(seal), SEAL_PASSPHRASE)
  );
  if (usable) return usable;
  const material = createSealMaterial(SEAL_PASSPHRASE);
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
 * Penaikan memakai `increment` ATOMIK di basis data, bukan
 * `current + 1` dari nilai yang dibaca lebih dulu. Beberapa percobaan salah
 * yang berjalan paralel sama-sama membaca nilai basi yang sama, sehingga
 * penghitungnya tak pernah menembus ambang dan lockout tak pernah terjadi —
 * sesi yang dicuri bisa menebak passphrase tanpa batas. `lockedUntil`
 * dihitung dari nilai HASIL increment, bukan dari bacaan lama.
 */
async function recordFailedAttempt(keyId: string): Promise<number> {
  const updated = await prisma.userSigningKey.update({
    where: { id: keyId },
    data: { failedAttempts: { increment: 1 } },
  });
  const failed = updated.failedAttempts;
  await prisma.userSigningKey.update({
    where: { id: keyId },
    data: { lockedUntil: lockoutUntil(failed) },
  });
  return failed;
}

/** Buka blokir setelah passphrase benar — penghitung kembali ke nol. */
async function clearFailedAttempts(keyId: string, client: DbClient = prisma): Promise<void> {
  await client.userSigningKey.update({
    where: { id: keyId },
    data: { failedAttempts: 0, lockedUntil: null, lastUsedAt: new Date() },
  });
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
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { code: { in: roleCodesForOrgan(input.organType) }, isActive: true },
        user: { isActive: true, deletedAt: null },
      },
      include: { user: { select: { id: true, name: true } }, role: { select: { code: true } } },
      distinct: ['userId'],
    });

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

    const decision = await prisma.$transaction(async (tx) =>
      tx.foundationDecision.create({
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
              roleCode: a.role.code,
            })),
          },
        },
      })
    );

    await prisma.auditLog.create({
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
  },

  /** Aturan kuorum untuk (organ × cara), dengan default legal bila tak diset. */
  async loadRule(
    organType: FoundationOrganType,
    kind: FoundationDecisionKind
  ): Promise<FoundationDecisionRule> {
    const found = await prisma.foundationDecisionRule.findUnique({
      where: { organType_decisionKind: { organType, decisionKind: kind } },
    });
    if (found) return found;
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
  async list(query: ListFoundationDecisionsQuery) {
    const where: Prisma.FoundationDecisionWhereInput = {};
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

  /** Detail keputusan untuk peminta (termasuk hak suara pribadi). */
  async detail(actor: Actor, decisionId: string) {
    const d = await this.loadWithRelations(decisionId);
    const snapshot = d.quorumSnapshot as unknown as QuorumSnapshot;
    const summary = d.voteSummary as unknown as VoteSummary;
    // Hak suara mengikuti SNAPSHOT anggota, bukan peran hari ini: orang yang
    // baru diangkat setelah keputusan dibuat bukan bagian dari badan yang
    // memutus saat itu.
    const canVote =
      d.status === FoundationDecisionStatus.VOTING &&
      d.members.some((m) => m.userId === actor.id);
    const mine = d.votes.find((v) => v.userId === actor.id);
    return this.toDetailDTO(d, snapshot, summary, canVote, mine?.choice ?? null, actor.id);
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

  /** Rekonstruksi daftar suara dari baris keputusan (untuk evaluasi kuorum). */
  votesOf(d: RichDecision): Array<{ choice: 'APPROVE' | 'REJECT' | 'ABSTAIN' }> {
    return d.votes.map((v) => ({ choice: v.choice }));
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
    const material = toMemberMaterial(signingKey as never);

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

    const result = await prisma.$transaction(async (tx) => {
      // Kunci baris keputusan dan periksa ulang status DI DALAM transaksi.
      // Pembuatan suara, pembacaan ulang suara, evaluasi kuorum, dan
      // finalisasi berjalan atomik terhadap pemilih paralel.
      await lockDecision(tx, d.id);
      const locked = (await tx.foundationDecision.findUnique({
        where: { id: d.id },
        include: decisionInclude,
      })) as unknown as RichDecision | null;
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
        },
      });

      const votes = await tx.foundationDecisionVote.findMany({ where: { decisionId: d.id } });
      const summary: VoteSummary = {
        approve: votes.filter((v) => v.choice === 'APPROVE').length,
        reject: votes.filter((v) => v.choice === 'REJECT').length,
        abstain: votes.filter((v) => v.choice === 'ABSTAIN').length,
        present: votes.length,
        active: snapshot.activeCount,
        totalVotes: votes.length,
      };
      await tx.foundationDecision.update({
        where: { id: d.id },
        data: { voteSummary: summary as unknown as Prisma.InputJsonValue },
      });

      // Evaluasi atas baris yang sudah memuat suara ini, masih di dalam kunci.
      const fresh = (await tx.foundationDecision.findUnique({
        where: { id: d.id },
        include: decisionInclude,
      })) as unknown as RichDecision;
      const evaluation = evaluateQuorum(
        fresh.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(fresh)
      );
      const outcome = await this.applyOutcome(actor, fresh, evaluation, tx);

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

  /** Finalisasi manual oleh pimpinan/kepala rapat bila kuorum sudah tercapai. */
  async finalize(actor: Actor, decisionId: string) {
    return prisma.$transaction(async (tx) => {
      await lockDecision(tx, decisionId);
      const d = (await tx.foundationDecision.findUnique({
        where: { id: decisionId },
        include: decisionInclude,
      })) as unknown as RichDecision | null;
      if (!d) throw Errors.notFound('Keputusan tidak ditemukan.');
      if (d.status !== FoundationDecisionStatus.VOTING) {
        throw Errors.badRequest(`Keputusan berstatus ${d.status} dan tidak lagi menerima suara.`);
      }
      const evaluation = evaluateQuorum(
        d.quorumSnapshot as unknown as QuorumSnapshot,
        this.votesOf(d)
      );
      if (evaluation.outcome === 'OPEN') {
        throw Errors.badRequest(
          `Kuorum belum terpenuhi (hadir ${evaluation.presentCount}/${evaluation.presentRequired}, butuh ${evaluation.neededToApprove} setuju lagi).`
        );
      }
      return this.applyOutcome(actor, d, evaluation, tx);
    });
  },

  /** Terapkan hasil kuorum: APPROVED (render PDF + e-seal) atau REJECTED. */
  async applyOutcome(
    actor: Actor,
    d: RichDecision,
    evaluation: QuorumEvaluation,
    client: DbClient = prisma
  ) {
    if (evaluation.outcome === 'APPROVED' && d.status !== FoundationDecisionStatus.APPROVED) {
      /**
       * Keputusan dibentuk SEBELUM render, bukan dibaca dari baris yang masih
       * VOTING.
       *
       * `applyOutcome` dipanggil dari dalam transaksi suara; baris `d` di sini
       * masih memuat status VOTING dan `decidedAt` null, karena UPDATE-nya baru
       * terjadi di bawah. Merender `d` apa adanya mencetak "Status: VOTING" dan
       * menghilangkan tanggal putusan ke dalam PDF yang kemudian DISEGEL —
       * arsip permanen yang menyatakan keputusan sah belum diputus, dan
       * digest-nya (beserta tanda tangan e-seal) mengunci kesalahan itu
       * selamanya.
       */
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

      // Arsip byte PDF apa adanya, lalu tandai keputusan sah + e-seal. Sekali
      // ditulis, `finalPdfDigest` dikunci (immutable) dan diverifikasi e-seal.
      // `esealId` menyimpan SEAL SPESIFIK ini agar verifikasi tidak terpengaruh
      // rotasi/pencabutan seal di kemudian hari.
      await client.foundationDecisionDocument.create({
        data: {
          decisionId: d.id,
          // Buffer dari generator selalu berasal dari Uint8Array tidak
          // bersandar pada SharedArrayBuffer; salin ke array polos.
          bytes: new Uint8Array(buf),
          sha256: finalPdfDigest,
          byteSize: buf.length,
        },
      });
      await client.foundationDecision.update({
        where: { id: d.id },
        data: {
          status: FoundationDecisionStatus.APPROVED,
          decidedById: actor.id,
          // Tanggal yang SAMA dengan yang tercetak di PDF — dua nilai berbeda
          // berarti arsip dan basis data menyebut waktu putusan yang berlainan.
          decidedAt,
          finalPdfDigest,
          finalPdfByteSize: buf.length,
          finalPdfSealSignature: sealSignature,
          esealId: seal.id,
        },
      });

      await client.auditLog.create({
        data: {
          userId: actor.id,
          action: 'APPROVE',
          entity: 'FoundationDecision',
          entityId: d.id,
          newValues: {
            finalPdfDigest,
            finalPdfByteSize: buf.length,
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

  /** Atur aturan kuorum (SUPER_ADMIN). */
  async upsertRule(actor: Actor, input: UpsertFoundationRuleInput) {
    const saved = await prisma.foundationDecisionRule.upsert({
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
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'UPSERT',
        entity: 'FoundationDecisionRule',
        entityId: saved.id,
        newValues: { organType: input.organType, decisionKind: input.decisionKind },
      },
    });
    return saved;
  },

  /** Daftar aturan kuorum (SUPER_ADMIN). */
  async listRules(): Promise<FoundationDecisionRule[]> {
    return prisma.foundationDecisionRule.findMany({
      orderBy: [{ organType: 'asc' }, { decisionKind: 'asc' }],
    });
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
      decidedAt: Date | null;
      finalPdfDigest: string | null;
      finalPdfSealSignature: string | null;
      esealId: string | null;
      votes: Array<{ choice: string }>;
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

    return {
      found: true,
      isValid,
      decisionId: d.id,
      subject: d.subject,
      organType: d.organType as FoundationDecisionVerificationDTO['organType'],
      kind: d.kind as FoundationDecisionVerificationDTO['kind'],
      status: d.status as FoundationDecisionVerificationDTO['status'],
      decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
      digest: d.finalPdfDigest,
      archiveDigest,
      digestOk,
      sealVerified,
      reason,
      voteCount: d.votes.length,
      approveCount: d.votes.filter((v) => v.choice === 'APPROVE').length,
      rejectCount: d.votes.filter((v) => v.choice === 'REJECT').length,
      abstainCount: d.votes.filter((v) => v.choice === 'ABSTAIN').length,
    };
  },

  /**
   * Verifikasi lewat token (QR), memeriksa arsip yang tersimpan di server.
   *
   * Ini membuktikan bahwa arsip server belum berubah sejak disegel. Ia TIDAK
   * membuktikan apa pun tentang berkas yang dipegang pemindai — lihat
   * `verifyByPdfBuffer` untuk itu, yang membandingkan byte unggahan.
   */
  async verifyByToken(token: string): Promise<FoundationDecisionVerificationDTO> {
    const d = await prisma.foundationDecision.findUnique({
      where: { verificationToken: token },
      include: {
        votes: { select: { choice: true } },
        document: { select: { bytes: true } },
      },
    });
    if (!d) {
      return emptyVerification('Token verifikasi tidak cocok dengan keputusan yang sah.');
    }

    return this.verifyDecisionCore(
      d as never,
      d.document ? { checkedBytes: Buffer.from(d.document.bytes) } : {}
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
      subject: true,
      organType: true,
      kind: true,
      status: true,
      decidedAt: true,
      finalPdfDigest: true,
      finalPdfSealSignature: true,
      esealId: true,
      votes: { select: { choice: true } },
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

    return this.verifyDecisionCore(d as never, { checkedBytes: pdfBuffer, uploaded: true });
  },

  /** Ambil dokumen PDF final untuk diunduh, atau 404 bila belum final. */
  async getFinalDocument(decisionId: string) {
    const doc = await prisma.foundationDecisionDocument.findUnique({
      where: { decisionId },
      include: { decision: { select: { status: true } } },
    });
    if (!doc || doc.decision.status !== FoundationDecisionStatus.APPROVED) {
      throw Errors.notFound('Dokumen final keputusan tidak ditemukan atau belum final.');
    }
    return doc;
  },

  /** Render PDF risalah/keputusan final dari baris + relasinya. */
  async renderPdf(d: RichDecision): Promise<Buffer> {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
    const votes: DecisionPdfVoteRow[] = d.votes.map((v) => ({
      userId: v.userId,
      name: v.user.name,
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
      voteSummary: d.voteSummary as unknown as VoteSummary,
      verificationToken: d.verificationToken,
      verificationUrl: d.verificationToken ? decisionVerificationUrl(d.verificationToken) : null,
    });
  },

  /** Bentuk DTO detail keputusan. */
  toDetailDTO(
    d: RichDecision,
    snapshot: QuorumSnapshot,
    summary: VoteSummary,
    canVote: boolean,
    myVote: 'APPROVE' | 'REJECT' | 'ABSTAIN' | null,
    myId: string
  ) {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
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
      decidedById: d.decidedById,
      decidedAt: d.decidedAt,
      createdAt: d.createdAt,
      createdByName: d.createdBy.name,
      decidedByName: d.decidedBy?.name ?? null,
      memberCount: d.members.length,
      votedCount: d.votes.length,
      canVote,
      myVote,
      members: d.members.map((m) => ({ userId: m.userId, name: m.name, roleCode: m.roleCode })),
      votes: d.votes.map((v) => ({
        id: v.id,
        userId: v.userId,
        userName: v.user.name,
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
