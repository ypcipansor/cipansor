import { z } from "zod";
import {
  FOUNDATION_DECISION_KINDS,
  FOUNDATION_DECISION_PUBLICATIONS,
  FOUNDATION_DECISION_TYPES,
  FOUNDATION_ORGAN_TYPES,
  FOUNDATION_QUORUM_MODES,
  FOUNDATION_VOTE_CHOICES,
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
export const upsertFoundationRuleSchema = z
  .object({
    organType: z.enum(FOUNDATION_ORGAN_TYPES),
    decisionKind: z.enum(FOUNDATION_DECISION_KINDS),
    quorumPresentMode: z
      .enum(FOUNDATION_QUORUM_MODES)
      .default(FoundationQuorumMode.MAJORITY),
    /**
     * Wajib > 0, karena ambang nol berarti "kuorum terpenuhi tanpa satu pun
     * suara" — keputusan dapat disahkan tanpa ada yang menyetujui.
     */
    quorumPresentValue: z.number().gt(0).max(1).default(0.5),
    quorumDecisionMode: z
      .enum(FOUNDATION_QUORUM_MODES)
      .default(FoundationQuorumMode.MAJORITY),
    /** Wajib > 0 — alasannya sama dengan `quorumPresentValue`. */
    quorumDecisionValue: z.number().gt(0).max(1).default(0.5),
  })
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
