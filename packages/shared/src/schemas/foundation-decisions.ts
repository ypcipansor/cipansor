import { z } from "zod";
import {
  FOUNDATION_DECISION_KINDS,
  FOUNDATION_ORGAN_TYPES,
  FOUNDATION_QUORUM_MODES,
  FOUNDATION_VOTE_CHOICES,
  FoundationQuorumMode,
} from "../types/foundation-decisions";

/** Membuat draf keputusan organ. */
export const createFoundationDecisionSchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES),
  kind: z.enum(FOUNDATION_DECISION_KINDS),
  subject: z.string().trim().min(3).max(255),
  body: z.string().trim().min(10),
  /** Label jenis keputusan, mis. "pengesahan-rencana-kerja", "perubahan-AD". */
  decisionType: z.string().trim().min(2).max(100),
});

export type CreateFoundationDecisionInput = z.infer<
  typeof createFoundationDecisionSchema
>;

/** Memberi suara pada sebuah keputusan. */
export const castFoundationVoteSchema = z.object({
  choice: z.enum(FOUNDATION_VOTE_CHOICES),
  /** Dissenting opinion — WAJIB bila choice=REJECT pada keputusan CIRCULAR. */
  note: z.string().trim().max(4000).optional(),
  /** Passphrase kunci tanda tangan pemilih. */
  passphrase: z.string().min(1).max(512),
});

export type CastFoundationVoteInput = z.infer<typeof castFoundationVoteSchema>;

/** Putuskan keputusan terpilih (internal/pimpinan rapat). */
export const finalizeFoundationDecisionSchema = z.object({
  passphrase: z.string().min(1),
});

export type FinalizeFoundationDecisionInput = z.infer<
  typeof finalizeFoundationDecisionSchema
>;

/** Mengelola aturan kuorum (SUPER_ADMIN). */
export const upsertFoundationRuleSchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES),
  decisionKind: z.enum(FOUNDATION_DECISION_KINDS),
  quorumPresentMode: z
    .enum(FOUNDATION_QUORUM_MODES)
    .default(FoundationQuorumMode.MAJORITY),
  quorumPresentValue: z.number().min(0).max(1).default(0.5),
  quorumDecisionMode: z
    .enum(FOUNDATION_QUORUM_MODES)
    .default(FoundationQuorumMode.MAJORITY),
  quorumDecisionValue: z.number().min(0).max(1).default(0.5),
  decisionBasis: z
    .enum(["MUFTAKAT_FIRST", "VOTE_ONLY"])
    .default("MUFTAKAT_FIRST"),
});

export type UpsertFoundationRuleInput = z.infer<
  typeof upsertFoundationRuleSchema
>;

/** Query list keputusan (paginated). */
export const listFoundationDecisionsQuerySchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES).optional(),
  status: z.enum(["DRAFT", "VOTING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export type ListFoundationDecisionsQuery = z.infer<
  typeof listFoundationDecisionsQuerySchema
>;
