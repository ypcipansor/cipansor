import { z } from "zod";

/**
 * Query params for the Raport Merdeka endpoints (student, class and PDF).
 *
 * `semester` is deliberately constrained to 1 (Ganjil) or 2 (Genap). Without
 * this restriction `getSemesterDateRange` treats any value other than 1 as
 * semester 2, so `semester=99` silently produced a plausible-looking Genap
 * raport instead of being rejected.
 */
export const raportMerdekaQuerySchema = z.object({
  academicYearId: z.string().min(1),
  semester: z.coerce
    .number()
    .int()
    .refine((v) => v === 1 || v === 2, {
      message: "Semester harus 1 (Ganjil) atau 2 (Genap)",
    }),
});

export type RaportMerdekaQueryInput = z.infer<typeof raportMerdekaQuerySchema>;
