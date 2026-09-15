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
  FoundationOrganType,
  ListFoundationDecisionsQuery,
  QuorumSnapshot,
  UpsertFoundationRuleInput,
  VoteSummary,
} from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { config } from '@/config';
import { evaluateQuorum, type QuorumEvaluation } from '@/utils/foundation-quorum';
import { isMemberOfOrgan, roleCodesForOrgan } from '@/utils/foundation-authority';
import {
  signPdfHash,
  verifyPdfHashSignature,
  type EncryptedKeyMaterial,
  type ScryptParams,
} from '@/utils/esign';
import { assertCanSign } from '@/utils/esign-lifecycle';
import { createSealMaterial, signSeal, toSealMaterial } from '@/utils/foundation-eseal';
import { generateDecisionPdf } from '@/utils/generate-decision-pdf';
import type { DecisionPdfVoteRow, DecisionPdfMemberRow } from '@/utils/generate-decision-pdf';

const DEFAULT_RULE = Object.freeze({
  CIRCULAR: Object.freeze({
    quorumPresentMode: 'MUTLAK',
    quorumPresentValue: 1,
    quorumDecisionMode: 'MUTLAK',
    quorumDecisionValue: 1,
    decisionBasis: 'MUFTAKAT_FIRST',
  }),
  MEETING: Object.freeze({
    quorumPresentMode: 'MAJORITY',
    quorumPresentValue: 0.5,
    quorumDecisionMode: 'MAJORITY',
    quorumDecisionValue: 0.5,
    decisionBasis: 'MUFTAKAT_FIRST',
  }),
} as const);

function sha256hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
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

const SEAL_PASSPHRASE = config.foundation.esealPassphrase;

function sealMaterial(seal: FoundationEseal): EncryptedKeyMaterial {
  return toSealMaterial(seal);
}

/** Pastikan e-seal Yayasan tersedia; buat satu baris bila belum ada. */
async function ensureSeal(): Promise<FoundationEseal> {
  const existing = await prisma.foundationEseal.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing && !existing.revokedAt) return existing;
  const material = createSealMaterial(SEAL_PASSPHRASE);
  return prisma.foundationEseal.create({
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
 * Mesin keputusan organ yayasan. Prisma hanya disentuh di sini; efek samping
 * audit & arsip PDF melewati eventBus.
 */
export const FoundationDecisionService = {
  /** Buat keputusan: snapshot anggota organ & kuorum, lalu buka voting. */
  async create(actor: Actor, input: CreateFoundationDecisionInput) {
    const rule = await this.loadRule(input.organType, input.kind);
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        isActive: true,
        role: { code: { in: roleCodesForOrgan(input.organType) }, isActive: true },
      },
      include: { user: { select: { id: true, name: true } }, role: { select: { code: true } } },
      distinct: ['userId'],
    });

    const snapshot: QuorumSnapshot = {
      organType: input.organType,
      kind: input.kind,
      activeCount: assignments.length,
      presentMode: rule.quorumPresentMode,
      presentValue: rule.quorumPresentValue,
      decisionMode: rule.quorumDecisionMode,
      decisionValue: rule.quorumDecisionValue,
      decisionBasis: rule.decisionBasis as QuorumSnapshot['decisionBasis'],
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
      decisionBasis: d.decisionBasis,
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
    const canVote =
      d.status === FoundationDecisionStatus.VOTING && isMemberOfOrgan(d.organType, actor.roleCode);
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
    if (!isMemberOfOrgan(d.organType, actor.roleCode)) {
      throw Errors.forbidden('Anda bukan anggota organ yang berhak memutus keputusan ini.');
    }
    if (d.kind === 'CIRCULAR' && choice === 'REJECT' && (!note || note.trim().length < 5)) {
      throw Errors.badRequest(
        'Tidak setuju pada keputusan sirkuler wajib disertai alasan (min. 5 karakter).'
      );
    }

    // Muat kunci tanda tangan pemilih; pastikan masih sah (aktivasi, masa
    // berlaku, pencabutan) lewat inti yang sama dengan alur surat. Perbaiki
    // sebab kegagalan menjadi 400 yang bisa dibaca klien.
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
    const signature = signPdfHash(material, passphrase, digest);

    const saved = await prisma.$transaction(async (tx) => {
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
      return { vote, summary };
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'VOTE',
        entity: 'FoundationDecisionVote',
        entityId: saved.vote.id,
        newValues: { decisionId: d.id, choice },
      },
    });

    const fresh = await this.loadWithRelations(d.id);
    const evaluation = evaluateQuorum(
      fresh.quorumSnapshot as unknown as QuorumSnapshot,
      this.votesOf(fresh)
    );
    const outcome = await this.applyOutcome(actor, fresh, evaluation);

    return {
      voteId: saved.vote.id,
      choice,
      voteSummary: saved.summary,
      outcome,
    };
  },

  /** Finalisasi manual oleh pimpinan/kepala rapat bila kuorum sudah tercapai. */
  async finalize(actor: Actor, decisionId: string) {
    const d = await this.loadWithRelations(decisionId);
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
    return this.applyOutcome(actor, d, evaluation);
  },

  /** Terapkan hasil kuorum: APPROVED (render PDF + e-seal) atau REJECTED. */
  async applyOutcome(actor: Actor, d: RichDecision, evaluation: QuorumEvaluation) {
    if (evaluation.outcome === 'APPROVED' && d.status !== FoundationDecisionStatus.APPROVED) {
      const buf = await this.renderPdf(d);
      const finalPdfDigest = sha256hex(buf.toString('utf8'));
      const seal = await ensureSeal();
      const sealSignature = signSeal(sealMaterial(seal), SEAL_PASSPHRASE, finalPdfDigest);

      // Arsip byte PDF apa adanya, lalu tandai keputusan sah + e-seal. Sekali
      // ditulis, `finalPdfDigest` dikunci (immutable) dan diverifikasi e-seal.
      await prisma.$transaction(async (tx) => {
        await tx.foundationDecisionDocument.create({
          data: {
            decisionId: d.id,
            // Buffer dari generator selalu berasal dari Uint8Array tidak
            // bersandar pada SharedArrayBuffer; salin ke array polos.
            bytes: new Uint8Array(buf),
            sha256: finalPdfDigest,
            byteSize: buf.length,
          },
        });
        return tx.foundationDecision.update({
          where: { id: d.id },
          data: {
            status: FoundationDecisionStatus.APPROVED,
            decidedById: actor.id,
            decidedAt: new Date(),
            finalPdfDigest,
            finalPdfByteSize: buf.length,
            finalPdfSealSignature: sealSignature,
          },
        });
      });

      await prisma.auditLog.create({
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
      await prisma.foundationDecision.update({
        where: { id: d.id },
        data: {
          status: FoundationDecisionStatus.REJECTED,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
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
        decisionBasis: input.decisionBasis,
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

  /** Verifikasi keputusan akhir lewat token (QR). */
  async verifyByToken(token: string) {
    const d = await prisma.foundationDecision.findUnique({
      where: { verificationToken: token },
      include: {
        votes: { include: { user: { select: { id: true, name: true } } } },
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!d || d.status !== FoundationDecisionStatus.APPROVED) {
      return { found: false as const };
    }

    let sealVerified: boolean | null = null;
    if (d.finalPdfDigest && d.finalPdfSealSignature) {
      const seal = await prisma.foundationEseal.findFirst({ orderBy: { createdAt: 'asc' } });
      if (seal) {
        // Tanda tangan Ed25519 deterministik → bubuhkan ulang lalu bandingkan,
        // sekaligus validasi kriptografi terhadap kunci publik.
        sealVerified =
          signSeal(sealMaterial(seal), SEAL_PASSPHRASE, d.finalPdfDigest) ===
            d.finalPdfSealSignature &&
          verifyPdfHashSignature(seal.publicKey, d.finalPdfDigest, d.finalPdfSealSignature);
      }
    }

    return {
      found: true as const,
      decisionId: d.id,
      subject: d.subject,
      organType: d.organType,
      kind: d.kind,
      status: d.status,
      decidedAt: d.decidedAt,
      digestOk: d.finalPdfDigest,
      sealVerified,
      voteCount: d.votes.length,
      approveCount: d.votes.filter((v) => v.choice === 'APPROVE').length,
      rejectCount: d.votes.filter((v) => v.choice === 'REJECT').length,
      abstainCount: d.votes.filter((v) => v.choice === 'ABSTAIN').length,
      members: d.members.map((m) => ({ userId: m.userId, name: m.name, roleCode: m.roleCode })),
    };
  },

  /** Render PDF risalah/keputusan final dari baris + relasinya. */
  async renderPdf(d: RichDecision): Promise<Buffer> {
    const roleByUserId = new Map(d.members.map((m) => [m.userId, m.roleCode]));
    const votes: DecisionPdfVoteRow[] = d.votes.map((v) => ({
      name: v.user.name,
      roleCode: roleByUserId.get(v.userId) ?? 'anggota',
      choice: v.choice,
      signedAt: v.signedAt,
      signatureShort: `${v.signature.slice(0, 16)}…`,
      note: v.note,
    }));
    const members: DecisionPdfMemberRow[] = d.members.map((m) => ({
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
