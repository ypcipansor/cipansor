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
 * Ukuran halaman daftar keputusan — satu sumber untuk kedua sisi.
 *
 * Schema API membatasi `limit` maksimum 50, tetapi komponen `Pagination`
 * default-nya menawarkan 100. Dulu halaman daftar tidak menimpanya, sehingga
 * memilih "100" mengirim `limit=100`, ditolak Zod di edge, dan SELURUH daftar
 * berubah menjadi galat. Opsi ukuran halaman dan batas atasnya kini berasal
 * dari kontrak yang sama, sehingga UI tak dapat menawarkan nilai yang API tolak.
 */
export const FOUNDATION_DECISIONS_MAX_PAGE_SIZE = 50;
export const FOUNDATION_DECISIONS_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

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
  return (
    FOUNDATION_DECISION_AUTHORITY[decisionType as FoundationDecisionType] ?? []
  );
}

/**
 * RoleCode yang tergolong anggota tiap organ.
 *
 * Definisi TUNGGAL — dipakai API (`utils/foundation-authority.ts`) untuk
 * membentuk snapshot anggota, dan web untuk menurunkan organ yang boleh dibuat
 * seorang aktor. Sebelumnya hanya API yang punya peta ini, sehingga form web
 * menawarkan semua organ dan pengguna non-admin baru ditolak 403 setelah
 * submit. Nilai-nilainya adalah label RoleCode dari `@prisma/client`; paket
 * ini murni jadi ia menyimpannya sebagai string dan API memetakannya kembali.
 *
 * GABUNGAN = Pengurus + Pengawas (UU 16/2001 Pasal 28 ayat (4)); Pembina TIDAK
 * ikut, sebab justru kekosongan Pembina-lah yang menjadikan rapat gabungan
 * perlu.
 */
export const FOUNDATION_ORGAN_ROLE_CODES: Record<
  FoundationOrganType,
  readonly string[]
> = {
  PEMBINA: ["YAYASAN_PEMBINA"],
  PENGURUS: [
    "YAYASAN_KETUA",
    "YAYASAN_SEKRETARIS",
    "YAYASAN_BENDAHARA",
    "YAYASAN_ANGGOTA",
  ],
  PENGAWAS: ["YAYASAN_PENGAWAS"],
  GABUNGAN: [
    "YAYASAN_KETUA",
    "YAYASAN_SEKRETARIS",
    "YAYASAN_BENDAHARA",
    "YAYASAN_ANGGOTA",
    "YAYASAN_PENGAWAS",
  ],
};

/** Apakah `roleCode` tergolong anggota `organType`? */
export function isRoleCodeMemberOfOrgan(
  organType: FoundationOrganType,
  roleCode: string,
): boolean {
  return FOUNDATION_ORGAN_ROLE_CODES[organType]?.includes(roleCode) ?? false;
}

/**
 * Apakah seorang pemegang peran berwenang ikut serta pada keputusan
 * ber-`organType` dengan jenis `decisionType`?
 *
 * `roleOrRoles` menerima SATU `roleCode` maupun SELURUH peran aktif pengguna,
 * supaya pengguna yang jabatan yayasannya bukan peran PRIMER tetap dinilai
 * atas seluruh perannya (bukan ditolak karena `roleCode` tunggal).
 *
 * Matriks kewenangan organ×jenis diperiksa LEBIH DULU dan tidak pernah
 * dilonggarkan — termasuk oleh `allowSuperAdmin`. Cabang itu hanya melewati
 * syarat "pembuat harus anggota organ" (Super Admin mengelola sistem, bukan
 * anggota organ yang memutus).
 */
export function organMayDecideByRoleCode(
  organType: FoundationOrganType,
  decisionType: string,
  roleOrRoles: string | readonly string[],
  opts: { allowSuperAdmin?: boolean } = {},
): boolean {
  const roles = typeof roleOrRoles === "string" ? [roleOrRoles] : roleOrRoles;
  if (!organAuthorizedForDecisionType(organType, decisionType)) return false;
  if (opts.allowSuperAdmin && roles.includes("SUPER_ADMIN")) return true;
  return roles.some((code) => isRoleCodeMemberOfOrgan(organType, code));
}

/**
 * Organ yang boleh DIBUAT aktornya menurut matriks kewenangan organ×jenis.
 *
 * Untuk tiap organ dicari satu jenis keputusan yang berwenang sebagai
 * representasi; bila aktor berwenang atas representasi itu (dan, bagi
 * non-admin, tergolong anggotanya), organ tsb dapat dibuat. Jenis keputusan
 * yang benar-benar boleh dipilih pada organ itu tetap `decisionTypesForOrgan`.
 *
 * `roleOrRoles` menerima himpunan seluruh peran aktif, agar pemegang jabatan
 * yayasan sekunder tidak kehilangan pilihan organnya.
 */
export function allowedCreateOrgansForRole(
  roleOrRoles: string | readonly string[],
  opts: { allowSuperAdmin?: boolean } = {},
): FoundationOrganType[] {
  return FOUNDATION_ORGAN_TYPES.filter((organ) => {
    const type = FOUNDATION_DECISION_TYPES.find((t) =>
      FOUNDATION_DECISION_AUTHORITY[t].includes(organ),
    );
    return !!type && organMayDecideByRoleCode(organ, type, roleOrRoles, opts);
  });
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
  /**
   * Rapat dibatalkan karena kuorum HADIR tidak pernah tercapai.
   *
   * DIBEDAKAN dari REJECTED dengan sengaja. Rapat yang gagal kuorum tidak
   * pernah memutus materi apa pun — menandainya REJECTED berarti menyatakan
   * materi "ditolak" tanpa dasar, dan itu keliru secara hukum maupun operasional
   * (rapat yang gagal kuorum umumnya ditunda dan dijadwalkan ulang, bukan
   * berarti materi ditolak). Status ini menutup rapat yang tidak dapat
   * dilanjutkan TANPA mengesahkan maupun menolak isinya, dan tetap dapat
   * diverifikasi publik sebagai dokumen yang sah-formatnya.
   */
  CANCELLED: "CANCELLED",
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
  /**
   * Bolehkah PEMINTA memfinalisasi keputusan ini sekarang?
   *
   * Dihitung server dari aturan yang SAMA dengan `finalize` — pimpinan/Super
   * Admin boleh organ mana pun, peran lain hanya bila menjadi anggota snapshot
   * — dan hanya `true` saat status masih `VOTING`. UI harus memakai field ini,
   * bukan menyimpulkan dari peran, agar tidak menawarkan tombol yang peladen
   * pasti tolak.
   */
  canFinalize: boolean;
  /**
   * Apakah keputusan ini memenuhi syarat untuk DITERBITKAN?
   *
   * `PUBLIC` hanya bermakna bagi keputusan `APPROVED` dengan artefak final
   * lengkap (`finalPdfDigest`, tanda tangan e-seal, `esealId`, arsip dokumen).
   * Dihitung server dengan syarat yang SAMA dengan `setPublication`, sehingga
   * UI tidak menawarkan "Terbitkan" pada draf/VOTING yang peladen tolak.
   */
  publishable: boolean;
  /**
   * Bolehkah aktor membatalkan rapat ini (kuorum hadir belum tercapai)?
   *
   * Dihitung server dengan syarat yang SAMA dengan `cancel`, sehingga UI tidak
   * menawarkan tombol yang peladen tolak — dan tidak pula menyembunyikan satu-
   * satunya jalan keluar dari rapat yang gagal kuorum.
   */
  canCancel: boolean;
  /**
   * Apakah penyegelan e-seal keputusan ini TERTUNDA?
   *
   * Hanya `true` pada sirkuler yang mufakatnya sudah penuh tetapi penyiapan
   * artefak (render PDF / buka e-seal) gagal pada suara penentu — suaranya
   * tersimpan, tetapi status tetap `VOTING` dan tidak ada jalan memperoleh
   * suara baru. Pada keadaan itu `finalize` adalah satu-satunya jalan
   * memulihkan keputusan (dan `canFinalize` karena itu `true`), sehingga UI
   * harus menampilkan tombolnya, bukan menyembunyikannya.
   */
  sealPending: boolean;
  myVote: FoundationVoteChoice | null;
  /**
   * Jumlah baris suara yang GAGAL verifikasi tanda tangan (tidak autentik).
   *
   * Seluruh angka resmi (`votedCount`, `voteSummary`, rekap verifikasi publik,
   * PDF) dihitung HANYA dari suara autentik, sehingga baris yang disisipkan
   * langsung ke basis data tidak pernah memengaruhi hasil. Field ini adalah
   * DIAGNOSTIK terpisah dan hanya diisi untuk aktor berwenang (SUPER_ADMIN);
   * bagi peran lain nilainya `undefined` — angka mentah yang mengungkap adanya
   * manipulasi basis data tidak perlu bocor ke setiap anggota.
   */
  invalidVoteCount?: number;
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
  /**
   * Penunjuk internal keputusan — HANYA diisi bila `publication` adalah
   * `PUBLIC`. Endpoint verifikasi anonim tidak boleh menjadi oracle yang
   * membocorkan `decisionId`/digest milik keputusan yang belum diterbitkan.
   */
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
  /**
   * Digest yang di-tanda-tangani e-seal (hash byte PDF final). HANYA diisi
   * untuk keputusan `PUBLIC`; `null` pada keputusan PRIVATE.
   */
  digest: string | null;
  /**
   * Hash dari byte yang benar-benar diperiksa: arsip tersimpan pada jalur
   * token, atau berkas yang diunggah pemindai pada jalur unggahan. HANYA
   * diisi untuk keputusan `PUBLIC`; `null` pada keputusan PRIVATE.
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
  /**
   * Suara TERCATAT tetapi e-seal belum dibubuhkan karena penyiapan artefak
   * gagal (mis. font Unicode risalah hilang). Suara tetap sah dan TIDAK boleh
   * diulang; penyegelan menunggu `finalize`/pemulihan aset.
   */
  sealDeferred: boolean;
}

/** Halaman daftar keputusan (paginated). */
export interface FoundationDecisionPageDTO {
  items: FoundationDecisionSummaryDTO[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Organ yang boleh dibuat aktor, beserta jenis keputusan yang berwenang untuk
 * organ itu — dihitung PELADEN.
 *
 * Form create membutuhkan dua hal ini SEBELUM dikirim: organ mana yang boleh
 * dipilih, dan jenis keputusan sah untuk organ itu. Menyalin matriks kewenangan
 * + peta keanggotaan ke web berarti form dapat menawarkan kombinasi yang
 * peladen tolak (persis bug "Pengawas dapat mengisi form organ Pembina").
 * Karena itu server mengirimkannya sebagai kontrak, dan UI hanya memilih dari
 * daftar ini.
 */
export interface FoundationCreateOptionsDTO {
  /**
   * Organ yang boleh dibuat aktor. `SUPER_ADMIN` mendapat semua organ yang
   * diizinkan matriks; peran lain hanya organ yang beranggotakan dirinya.
   * Daftar kosong berarti aktor tidak boleh membuat keputusan apa pun.
   */
  allowedOrgans: Array<{
    organType: FoundationOrganType;
    /** Jenis keputusan yang berwenang untuk organ ini. */
    decisionTypes: FoundationDecisionType[];
  }>;
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
