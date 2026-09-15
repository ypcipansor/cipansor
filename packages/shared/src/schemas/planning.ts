import { z } from 'zod';

/**
 * Pengesahan dokumen tingkat yayasan — RPJP, Renstra, RKA Yayasan: Pengurus
 * mengajukan → Pengawas mereviu → Pengurus menanggapi → Pembina menetapkan
 * atau mengembalikan (UU 16/2001 Ps. 28 ayat 2 huruf c–d, Ps. 31 ayat 1,
 * Ps. 40 ayat 1). One contract: the API validates each step with these at the
 * edge, and the web dialogs enable Kirim only when the same schema passes.
 */

/** A reason has to say something; both the API and the dialogs hold this floor. */
export const PLAN_REVIEW_MIN_REASON = 10;

export const submitForReviewSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
});

export const reviewResultSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(PLAN_REVIEW_MIN_REASON, 'Hasil reviu wajib diisi (minimal 10 karakter).')
    .max(8000),
});

export const proposeToPembinaSchema = z.object({
  revised: z.boolean(),
  notes: z
    .string()
    .trim()
    .min(
      PLAN_REVIEW_MIN_REASON,
      'Jelaskan revisi yang dilakukan, atau alasan tidak merevisi (minimal 10 karakter).'
    )
    .max(8000),
});

export const decidePlanSchema = z
  .object({
    decision: z.enum(['TETAPKAN', 'KEMBALIKAN']),
    notes: z.string().trim().max(8000).optional(),
  })
  .refine((d) => d.decision === 'TETAPKAN' || (d.notes?.length ?? 0) >= PLAN_REVIEW_MIN_REASON, {
    message: 'Alasan pengembalian wajib diisi (minimal 10 karakter).',
    path: ['notes'],
  });

export type SubmitForReviewInput = z.infer<typeof submitForReviewSchema>;
export type ReviewResultInput = z.infer<typeof reviewResultSchema>;
export type ProposeToPembinaInput = z.infer<typeof proposeToPembinaSchema>;
export type DecidePlanInput = z.infer<typeof decidePlanSchema>;
