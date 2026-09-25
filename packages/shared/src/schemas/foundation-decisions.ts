import { z } from "zod";
import {
  FOUNDATION_DECISION_KINDS,
  FOUNDATION_DECISION_PUBLICATIONS,
  FOUNDATION_DECISION_TYPES,
  FOUNDATION_ORGAN_TYPES,
  FOUNDATION_QUORUM_MODES,
  FOUNDATION_VOTE_CHOICES,
  FOUNDATION_DECISIONS_MAX_PAGE_SIZE,
  FoundationQuorumMode,
  quorumValueForMode,
} from "../types/foundation-decisions";

/**
 * Kosakata jenis keputusan TERKENDALI.
 *
 * Jenis tak dikenal dulu jatuh diam-diam ke kewenangan Pembina, sehingga satu
 * salah ketik memindahkan keputusan ke organ yang salah tanpa peringatan.
 * `z.enum` menolaknya di edge, dan tipe hasilnya mengalir ke matriks kewenangan
 * yang ber-`Record<DecisionAuthorityKey, …>` sehingga kedua sisi tak dapat
 * menyimpang.
 */
const decisionTypeSchema = z.enum(FOUNDATION_DECISION_TYPES);

/** Membuat draf keputusan organ. */
export const createFoundationDecisionSchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES),
  kind: z.enum(FOUNDATION_DECISION_KINDS),
  subject: z.string().trim().min(3).max(255),
  body: z.string().trim().min(10),
  /** Jenis keputusan, mis. "pengesahan-rencana-kerja", "perubahan-anggaran-dasar". */
  decisionType: decisionTypeSchema,
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

/**
 * Putuskan keputusan terpilih (internal/pimpinan rapat).
 *
 * **Tanpa passphrase, dan itu memang model otorisasinya.** Finalisasi tidak
 * menandatangani apa pun dengan kunci pribadi pemanggil: yang dibubuhkan adalah
 * e-seal Yayasan, dan kunci privatnya disegel oleh passphrase SERVER
 * (`FOUNDATION_ESEAL_PASSPHRASE`), bukan oleh rahasia pengguna. Otorisasinya
 * adalah peran (`FINALIZE` di routes) — meminta passphrase di sini berarti
 * menuntut rahasia yang tidak dipakai untuk apa pun, dan menyimpannya di
 * kontrak berarti mengundang klien mengirimkannya.
 */
export const finalizeFoundationDecisionSchema = z.object({});

export type FinalizeFoundationDecisionInput = z.infer<
  typeof finalizeFoundationDecisionSchema
>;

/**
 * Mengubah klasifikasi publikasi metadata keputusan (SUPER_ADMIN).
 *
 * Terpisah dari finalisasi, dan sengaja: memutuskan hasil rapat dan
 * menerbitkan metadatanya ke internet adalah dua keputusan yang berbeda.
 * Menyatukannya berarti setiap finalisasi otomatis mempublikasikan judul dan
 * rekap suara keputusan — termasuk yang menyangkut personalia.
 */
export const setFoundationDecisionPublicationSchema = z.object({
  publication: z.enum(FOUNDATION_DECISION_PUBLICATIONS),
});

export type SetFoundationDecisionPublicationInput = z.infer<
  typeof setFoundationDecisionPublicationSchema
>;

/** Mengelola aturan kuorum (SUPER_ADMIN). */
const upsertFoundationRuleBaseSchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES),
  decisionKind: z.enum(FOUNDATION_DECISION_KINDS),
  quorumPresentMode: z
    .enum(FOUNDATION_QUORUM_MODES)
    .default(FoundationQuorumMode.MAJORITY),
  /**
   * Ambang hadir. OPSIONAL: bila tak diisi, nilainya DITURUNKAN dari mode,
   * bukan dari default tetap `0.5`. Default lama `0.5` membuat
   * `{ quorumPresentMode: 'TWO_THIRDS' }` tanpa nilai menghasilkan pasangan
   * mode/nilai yang bertentangan, yang lalu ditolak `superRefine` — padahal
   * pemanggil hanya bermaksud "dua pertiga". Mode-lah yang mengikat, jadi
   * nilai yang mengikutinya adalah perilaku yang benar.
   */
  quorumPresentValue: z.number().gt(0).max(1).optional(),
  quorumDecisionMode: z
    .enum(FOUNDATION_QUORUM_MODES)
    .default(FoundationQuorumMode.MAJORITY),
  /** Opsional — alasannya sama dengan `quorumPresentValue`. */
  quorumDecisionValue: z.number().gt(0).max(1).optional(),
});

export const upsertFoundationRuleSchema = upsertFoundationRuleBaseSchema
  /**
   * Turunkan nilai yang tidak diberikan dari mode-nya SEBELUM validasi akhir,
   * sehingga "mode mengikat, nilai mengikutinya" berlaku pada jalur yang
   * mengisi mode saja.
   */
  .transform((rule) => ({
    ...rule,
    quorumPresentValue:
      rule.quorumPresentValue ?? quorumValueForMode(rule.quorumPresentMode),
    quorumDecisionValue:
      rule.quorumDecisionValue ?? quorumValueForMode(rule.quorumDecisionMode),
  }))
  /**
   * **Mode mengikat, nilai harus mengikutinya.** `TWO_THIRDS` dengan value 0.5
   * adalah aturan yang menyamar: labelnya menjanjikan dua pertiga sementara
   * mesin kuorum mengevaluasi "≥ setengah". Menolaknya di sini berarti aturan
   * yang TERSIMPAN selalu dapat dipercaya dari labelnya, dan nilai yang salah
   * tidak pernah menjadi ambang yang mengikat keputusan.
   *
   * Toleransi kecil diberikan karena `2/3` dan `3/4` adalah pecahan yang tak
   * dapat dinyatakan persis sebagai desimal (`0.67`, `0.75`).
   */
  .superRefine((rule, ctx) => {
    const pairs: Array<[FoundationQuorumMode, number, string]> = [
      [rule.quorumPresentMode, rule.quorumPresentValue, "quorumPresentValue"],
      [
        rule.quorumDecisionMode,
        rule.quorumDecisionValue,
        "quorumDecisionValue",
      ],
    ];
    for (const [mode, value, field] of pairs) {
      const expected = quorumValueForMode(mode);
      if (Math.abs(value - expected) > 0.005) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Mode ${mode} menyiratkan nilai ${expected}; nilai ${value} bertentangan dengan mode.`,
        });
      }
    }

    /**
     * **Sirkuler wajib mufakat (MUTLAK), bukan mayoritas.**
     *
     * Keputusan sirkuler adalah keputusan TANPA rapat: seluruh anggota
     * menandatangani satu naskah yang sama, dan sejak awal hanya sah bila
     * disetujui SELURUH anggota (mufakat). Karena tidak ada rapat, tidak ada
     * "kuorum hadir" yang dapat dipakai sebagai dasar alternatif, sehingga
     * ambang mayoritas pada sirkuler tidak punya dasar hukum — dan lebih buruk,
     * ia dapat mengesahkan keputusan atas dasar suara sebagian anggota
     * sementara sisanya menolak, yang justru bertentangan dengan sifat sirkuler.
     *
     * Sebelum ini, halaman pengelolaan aturan hanya MENYEMBUNYIKAN opsi
     * non-mufakat di frontend. Penyembunyian UI bukan penegakan: aturan
     * mayoritas untuk sirkuler tetap dapat disimpan lewat API, disisipkan
     * langsung ke basis data, atau tetap terbaca dari data lama — dan mesin
     * kuorum akan mengevaluasinya. Karena itu larangannya ditegakkan di KONTRAK
     * (di sini), bukan hanya di UI, sehingga API dan web memakai aturan yang
     * sama persis.
     *
     * `DEFAULT_FOUNDATION_RULE.CIRCULAR` memang sudah MUTLAK; penegakan ini
     * hanya menutup jalur yang menyimpang darinya.
     */
    if (rule.decisionKind === "CIRCULAR") {
      const mutlak = FoundationQuorumMode.MUTLAK;
      if (rule.quorumPresentMode !== mutlak) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quorumPresentMode"],
          message:
            "Keputusan sirkuler wajib mufakat: kuorum hadir harus MUTLAK (seluruh anggota).",
        });
      }
      if (rule.quorumDecisionMode !== mutlak) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quorumDecisionMode"],
          message:
            "Keputusan sirkuler wajib mufakat: kuorum keputusan harus MUTLAK (seluruh anggota).",
        });
      }
    }
  });

export type UpsertFoundationRuleInput = z.infer<
  typeof upsertFoundationRuleSchema
>;

/** Query list keputusan (paginated). */
export const listFoundationDecisionsQuerySchema = z.object({
  organType: z.enum(FOUNDATION_ORGAN_TYPES).optional(),
  status: z
    .enum(["DRAFT", "VOTING", "APPROVED", "REJECTED", "CANCELLED"])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FOUNDATION_DECISIONS_MAX_PAGE_SIZE)
    .optional()
    .default(10),
});

export type ListFoundationDecisionsQuery = z.infer<
  typeof listFoundationDecisionsQuerySchema
>;
