// Foundation Decisions & Risalah Organ — DTO types shared by API and web.
//
// This is the API contract surface only (see packages/shared/AGENTS.md). The
// DB enums live in `@prisma/client`; the string unions here are kept in exact
// sync so both runtimes consume the same values without importing Prisma.

export const FoundationOrganType = {
  PEMBINA: "PEMBINA",
  PENGURUS: "PENGURUS",
  PENGAWAS: "PENGAWAS",
  GABUNGAN: "GABUNGAN",
} as const;
export type FoundationOrganType =
  (typeof FoundationOrganType)[keyof typeof FoundationOrganType];
export const FOUNDATION_ORGAN_TYPES = Object.values(FoundationOrganType);

export const FoundationDecisionKind = {
  CIRCULAR: "CIRCULAR",
  MEETING: "MEETING",
} as const;
export type FoundationDecisionKind =
  (typeof FoundationDecisionKind)[keyof typeof FoundationDecisionKind];
export const FOUNDATION_DECISION_KINDS = Object.values(FoundationDecisionKind);

export const FoundationDecisionStatus = {
  DRAFT: "DRAFT",
  VOTING: "VOTING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type FoundationDecisionStatus =
  (typeof FoundationDecisionStatus)[keyof typeof FoundationDecisionStatus];
export const FOUNDATION_DECISION_STATUSES = Object.values(
  FoundationDecisionStatus,
);

export const FoundationVoteChoice = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  ABSTAIN: "ABSTAIN",
} as const;
export type FoundationVoteChoice =
  (typeof FoundationVoteChoice)[keyof typeof FoundationVoteChoice];
export const FOUNDATION_VOTE_CHOICES = Object.values(FoundationVoteChoice);

export const FoundationQuorumMode = {
  MAJORITY: "MAJORITY",
  TWO_THIRDS: "TWO_THIRDS",
  THREE_QUARTERS: "THREE_QUARTERS",
  MUTLAK: "MUTLAK",
} as const;
export type FoundationQuorumMode =
  (typeof FoundationQuorumMode)[keyof typeof FoundationQuorumMode];
export const FOUNDATION_QUORUM_MODES = Object.values(FoundationQuorumMode);

/** Ambang kuorum yang berlaku pada sebuah keputusan (snapshot). */
export interface QuorumSnapshot {
  organType: FoundationOrganType;
  kind: FoundationDecisionKind;
  activeCount: number;
  presentMode: FoundationQuorumMode;
  presentValue: number;
  decisionMode: FoundationQuorumMode;
  decisionValue: number;
  decisionBasis: "MUFTAKAT_FIRST" | "VOTE_ONLY";
}

/** Rekapitulasi suara pada sebuah keputusan. */
export interface VoteSummary {
  approve: number;
  reject: number;
  abstain: number;
  present: number;
  active: number;
  totalVotes: number;
}

/** Satu anggota organ dalam snapshot keputusan. */
export interface DecisionMemberDTO {
  userId: string;
  name: string;
  roleCode: string;
}

/** Satu suara anggota (payload untuk daftar penandatangan & verifikasi). */
export interface DecisionVoteDTO {
  id: string;
  userId: string;
  userName: string;
  roleCode: string;
  choice: FoundationVoteChoice;
  canonicalDigest: string;
  signature: string;
  publicKey: string;
  note: string | null;
  signedAt: string;
}

/** Ringkasan keputusan untuk daftar (list). */
export interface FoundationDecisionSummaryDTO {
  id: string;
  organType: FoundationOrganType;
  kind: FoundationDecisionKind;
  status: FoundationDecisionStatus;
  subject: string;
  decisionType: string;
  quorumSnapshot: QuorumSnapshot;
  voteSummary: VoteSummary;
  finalPdfDigest: string | null;
  decidedAt: string | null;
  createdAt: string;
  createdByName: string;
  memberCount: number;
  votedCount: number;
}

/** Detail keputusan untuk halaman detail / verifikasi. */
export interface FoundationDecisionDetailDTO extends FoundationDecisionSummaryDTO {
  body: string;
  members: DecisionMemberDTO[];
  votes: DecisionVoteDTO[];
  decidedByName: string | null;
  verificationToken: string | null;
  canVote: boolean;
  myVote: FoundationVoteChoice | null;
}

/** Ringkasan tingkat verifikasi sebuah keputusan akhir. */
export interface FoundationDecisionVerificationDTO {
  found: boolean;
  decisionId: string | null;
  subject: string | null;
  organType: FoundationOrganType | null;
  kind: FoundationDecisionKind | null;
  status: FoundationDecisionStatus | null;
  decidedAt: string | null;
  digestOk: string | null;
  sealVerified: boolean | null;
  voteCount: number;
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  members: DecisionMemberDTO[];
}
