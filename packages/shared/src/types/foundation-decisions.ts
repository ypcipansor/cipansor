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

/**
 * Pecahan tetap yang disiratkan tiap mode kuorum.
 *
 * **Mode-lah yang mengikat, bukan nilai numeriknya.** Label mode adalah janji
 * kepada pembaca Anggaran Dasar: "dua pertiga" harus berarti 2/3, bukan angka
 * apa pun yang kebetulan tersimpan di sebelahnya. Versi sebelumnya membiarkan
 * `quorumDecisionValue` bebas (0<v≤1) dan mengevaluasinya secara literal,
 * sehingga aturan yang tersimpan dapat saling bertentangan — `TWO_THIRDS`
 * dengan value 0.5 menuntut "≥ setengah" sambil menamakan dirinya "dua
 * pertiga", dan tak seorang pun dapat mengetahui ambang yang sebenarnya
 * berlaku dari labelnya. Karena itu nilai selalu DITURUNKAN dari mode, baik di
 * API (`requiredCount`) maupun saat menyimpan aturan (skema menolak nilai yang
 * menyimpang).
 */
export const FOUNDATION_QUORUM_MODE_VALUE: Record<FoundationQuorumMode, number> = {
  MAJORITY: 0.5,
  TWO_THIRDS: 2 / 3,
  THREE_QUARTERS: 3 / 4,
  MUTLAK: 1,
};

/** Pecahan yang disiratkan sebuah mode. */
export function quorumValueForMode(mode: FoundationQuorumMode): number {
  return FOUNDATION_QUORUM_MODE_VALUE[mode];
}

/** Ambang kuorum yang berlaku pada sebuah keputusan (snapshot). */
export interface QuorumSnapshot {
  organType: FoundationOrganType;
  kind: FoundationDecisionKind;
  activeCount: number;
  presentMode: FoundationQuorumMode;
  presentValue: number;
  decisionMode: FoundationQuorumMode;
  decisionValue: number;
}

/**
 * Ambang kuorum BAWAAN menurut cara pengambilan keputusan, dipakai ketika
 * (organ × cara) belum punya aturan tersimpan. Sumber tunggal untuk API dan
 * web: API memakainya di `loadRule`, web menampilkannya sebagai nilai awal di
 * halaman pengelolaan aturan — supaya apa yang dilihat SUPER_ADMIN benar-benar
 * nilai yang sedang berlaku, bukan tebakan.
 */
export const DEFAULT_FOUNDATION_RULE: Record<
  FoundationDecisionKind,
  {
    quorumPresentMode: FoundationQuorumMode;
    quorumPresentValue: number;
    quorumDecisionMode: FoundationQuorumMode;
    quorumDecisionValue: number;
  }
> = {
  CIRCULAR: {
    quorumPresentMode: FoundationQuorumMode.MUTLAK,
    quorumPresentValue: 1,
    quorumDecisionMode: FoundationQuorumMode.MUTLAK,
    quorumDecisionValue: 1,
  },
  MEETING: {
    quorumPresentMode: FoundationQuorumMode.MAJORITY,
    quorumPresentValue: 0.5,
    quorumDecisionMode: FoundationQuorumMode.MAJORITY,
    quorumDecisionValue: 0.5,
  },
};

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

/**
 * Ringkasan tingkat verifikasi sebuah keputusan akhir.
 *
 * **Tidak memuat roster anggota.** Endpoint verifikasi terbuka untuk anonim
 * (pemindai QR, dinas luar), dan daftar nama + jabatan seluruh Pembina/
 * Pengurus/Pengawas adalah data tata kelola yang tidak dibutuhkan untuk
 * menjawab "dokumen ini sah?". Yang ditampilkan hanyalah angka rekap suara,
 * yang memang membuktikan kuorum terpenuhi tanpa menyebut siapa pun.
 */
export interface FoundationDecisionVerificationDTO {
  found: boolean;
  /**
   * Putusan tunggal yang boleh dipakai klien untuk menampilkan keabsahan.
   *
   * True hanya bila seluruh pemeriksaan yang mungkin dilakukan benar-benar
   * lulus: byte yang diperiksa cocok dengan digest yang ditandatangani dan
   * tanda tangan e-seal terverifikasi. `null` pada pemeriksaan yang tidak
   * dapat dijalankan (mis. keputusan tanpa arsip) TIDAK dianggap lulus —
   * "tidak diperiksa" bukan "aman".
   */
  isValid: boolean;
  decisionId: string | null;
  subject: string | null;
  organType: FoundationOrganType | null;
  kind: FoundationDecisionKind | null;
  status: FoundationDecisionStatus | null;
  decidedAt: string | null;
  /** Digest yang di-tanda-tangani e-seal (hash byte PDF final). */
  digest: string | null;
  /**
   * Hash dari byte yang benar-benar diperiksa: arsip tersimpan pada jalur
   * token, atau berkas yang diunggah pemindai pada jalur unggahan.
   */
  archiveDigest: string | null;
  /** Benarkah byte yang diperiksa sama dengan digest yang ditandatangani? */
  digestOk: boolean | null;
  sealVerified: boolean | null;
  /** Kalimat sebab saat tidak sah, untuk dibaca pengunjung. */
  reason: string | null;
  voteCount: number;
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
}

/** Hasil memberi suara pada sebuah keputusan. */
export interface FoundationVoteOutcomeDTO {
  outcome: "APPROVED" | "REJECTED" | "OPEN";
  status: FoundationDecisionStatus;
}

/** Respons endpoint memberi suara. */
export interface CastFoundationVoteResultDTO {
  voteId: string;
  choice: FoundationVoteChoice;
  voteSummary: VoteSummary;
  outcome: FoundationVoteOutcomeDTO;
}

/** Halaman daftar keputusan (paginated). */
export interface FoundationDecisionPageDTO {
  items: FoundationDecisionSummaryDTO[];
  total: number;
  page: number;
  limit: number;
}

/** Baris aturan kuorum yang tersimpan (Respons GET/PUT /foundation/rules). */
export interface FoundationDecisionRuleDTO {
  id?: string;
  organType: FoundationOrganType;
  decisionKind: FoundationDecisionKind;
  quorumPresentMode: FoundationQuorumMode;
  quorumPresentValue: number;
  quorumDecisionMode: FoundationQuorumMode;
  quorumDecisionValue: number;
}
