import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';


export const createEvidenceSchema = z.object({
  unitId: z.string().uuid(),
  indicatorId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().min(3),
  fileUrl: uploadedFileRefSchema,
  description: z.string().optional(),
});

export const createAuditSchema = z.object({
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const updateAuditItemSchema = z.object({
  score: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});
