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

/**
 * Kosakata TERKENDALI untuk `decisionType`.
 *
 * Nilai-nilai ini bukan sekadar label: matriks kewenangan organ
 * (`DECISION_AUTHORITY`) memetakan setiap jenis ke organ yang berwenang, dan
 * `umum` adalah satu-satunya kategori sengaja yang boleh diputus Pembina.
 *
 * Sebelumnya skema menerima string bebas, dan jenis tak dikenal jatuh DIAM-DIAM
 * ke kewenangan Pembina lewat fallback `?? umum`. Satu salah ketik
 * ("pengesahan-rancana-kerja") cukup untuk memindahkan keputusan ke organ yang
 * salah tanpa satu pun peringatan — dan matriks kewenangan yang justru menjadi
 * jaminan legalnya tak pernah menolak apa pun. Karena itu jenisnya kini
 * diaudit di sini, dan setiap pemakaian (skema, matriks, form web) mengambil
 * daftar yang sama.
 */
export const FOUNDATION_DECISION_TYPES = [
  "pengesahan-rencana-kerja",
  "pengesahan-anggaran",
  "perubahan-anggaran-dasar",
  "pengangkatan-pengurus",
  "pemberhentian-pengurus",
  "pengangkatan-pengawas",
  "pemberhentian-pengawas",
  "penggabungan",
  "pembubaran",
  "peralihan-kekayaan",
  "keputusan-operasional",
  "kebijakan-internal",
  "pemberhentian-sementara-pengurus",
  "pemilihan-pembina",
  "kegiatan-program",
  "umum",
] as const;
export type FoundationDecisionType = (typeof FOUNDATION_DECISION_TYPES)[number];

/**
 * Matriks kewenangan organ atas tiap jenis keputusan.
 *
 * Kontrak ini hidup SEKALI di sini karena DUA sisi memakainya: API
 * (`utils/foundation-authority.ts`) menolak keputusan yang organnya tidak
 * berwenang, dan web menyaring pilihan jenis keputusan agar kombinasi
 * organ×jenis yang salah tidak pernah dapat dipilih di UI. Dulu matriksnya
 * hanya ada di API, sehingga form web membiarkan kombinasi apa pun dikirim dan
 * pengguna baru diberi tahu setelah submit.
 *
 * Nilainya adalah himpunan organ yang berwenang; jenis tak dikenal tidak ada di
 * peta dan karenanya gagal TERTUTUP (bukan fallback ke Pembina).
 */
export const FOUNDATION_DECISION_AUTHORITY: Record<
  FoundationDecisionType,
  readonly FoundationOrganType[]
> = {
  // Kewenangan Pembina (ps. 28 UU 28/2004) — selebihnya boleh diserahkan.
  "pengesahan-rencana-kerja": ["PEMBINA"],
  "pengesahan-anggaran": ["PEMBINA"],
  "perubahan-anggaran-dasar": ["PEMBINA"],
  "pengangkatan-pengurus": ["PEMBINA"],
  "pemberhentian-pengurus": ["PEMBINA"],
  "pengangkatan-pengawas": ["PEMBINA"],
  "pemberhentian-pengawas": ["PEMBINA"],
  penggabungan: ["PEMBINA"],
  pembubaran: ["PEMBINA"],
  "peralihan-kekayaan": ["PEMBINA"],
  // Eksekutif harian Pengurus (ps. 31, 35).
  "keputusan-operasional": ["PENGURUS"],
  "kebijakan-internal": ["PENGURUS"],
  "kegiatan-program": ["PENGURUS"],
  // Pengawas (ps. 40-41) — nasihat & pemberhentian sementara.
  "pemberhentian-sementara-pengurus": ["PENGAWAS"],
  // Pemilihan Pembina ketika kekosongan → rapat gabungan (ps. 28).
  "pemilihan-pembina": ["GABUNGAN"],
  // Kategori sengaja untuk keputusan umum milik Pembina (organ puncak).
  umum: ["PEMBINA"],
};

/**
 * Organ yang berwenang atas `decisionType`, atau `[]` bila tak dikenal.
 *
 * Fail closed: jenis tak dikenal tidak pernah dianggap milik organ mana pun.
 */
export function organsForDecisionType(
  decisionType: string,
): readonly FoundationOrganType[] {
  return FOUNDATION_DECISION_AUTHORITY[decisionType as FoundationDecisionType] ?? [];
}

/** Apakah `organType` berwenang atas `decisionType` menurut matriks? */
export function organAuthorizedForDecisionType(
  organType: FoundationOrganType,
  decisionType: string,
): boolean {
  return organsForDecisionType(decisionType).includes(organType);
}

/** Jenis keputusan yang berwenang diputus oleh `organType`. */
export function decisionTypesForOrgan(
  organType: FoundationOrganType,
): FoundationDecisionType[] {
  return FOUNDATION_DECISION_TYPES.filter((t) =>
    FOUNDATION_DECISION_AUTHORITY[t].includes(organType),
  );
}


/**
 * Klasifikasi publikasi metadata keputusan.
 *
 * Endpoint verifikasi (`GET /foundation/verify`, `POST /foundation/verify-pdf`)
 * terbuka untuk anonim. Sebelum ini ia mengembalikan subject, organ, tanggal,
 * dan rekap suara tanpa syarat — padahal keputusan yayasan dapat menyangkut
 * personalia atau operasi internal yang tidak untuk dibaca siapa pun yang
 * menemukan token/berkasnya. Judul rapat "Pemberhentian Sementara Pengurus X"
 * yang bocor ke pihak luar bukan kebocoran yang dapat ditarik kembali.
 *
 * Karena itu metadata sensitif hanya ditampilkan bila keputusan memang
 * diterbitkan untuk publik. Bawaannya PRIVATE — fail closed: keputusan lama
 * (dan setiap keputusan baru) tetap tidak membocorkan apa pun sampai seseorang
 * sengaja menyatakannya publik.
 */
export const FoundationDecisionPublication = {
  PRIVATE: "PRIVATE",
  PUBLIC: "PUBLIC",
} as const;
export type FoundationDecisionPublication =
  (typeof FoundationDecisionPublication)[keyof typeof FoundationDecisionPublication];
export const FOUNDATION_DECISION_PUBLICATIONS = Object.values(
  FoundationDecisionPublication,
);

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
export const FOUNDATION_QUORUM_MODE_VALUE: Record<
  FoundationQuorumMode,
  number
> = {
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
  /**
   * Klasifikasi publikasi metadata pada endpoint verifikasi anonim.
   * Bawaannya PRIVATE; hanya SUPER_ADMIN yang dapat mengubahnya.
   */
  publication: FoundationDecisionPublication;
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
 * menjawab "dokumen ini sah?".
 *
 * **Metadata tata kelola hanya ditampilkan untuk keputusan yang memang
 * diterbitkan.** `subject`, `organType`, `kind`, `decidedAt`, dan angka rekap
 * suara dapat mengungkap personalia/operasi internal (mis. "Pemberhentian
 * Sementara Pengurus X"). Karena itu server menyensor semuanya untuk keputusan
 * `PRIVATE` (bawaan), dan hanya menyisakan status keabsahan (`isValid`,
 * `digestOk`, `sealVerified`, `digest`, `archiveDigest`, `reason`,
 * `decisionId`). Field itu tetap ada di bentuk DTO (bernilai `null`/nol) supaya
 * klien tidak perlu menebak bentuk, tetapi isinya tidak pernah sensitif.
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
  /**
   * Klasifikasi publikasi keputusan. `PRIVATE` (bawaan) menyensor field
   * tata kelola di bawah; `PUBLIC` menampilkannya. Field ini sendiri tidak
   * sensitif dan selalu diisi bila `found` bernilai true.
   */
  publication: FoundationDecisionPublication | null;
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
  /**
   * Rekap suara hanya untuk keputusan `PUBLIC`; `0` bila disensor.
   * Keabsahan dokumen tetap dapat dibuktikan tanpa angka-angka ini.
   */
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
