import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

export const CERTIFICATE_TYPES = [
  'IJAZAH',
  'STTB',
  'TAHFIDZ',
  'SANAD',
  'ACHIEVEMENT',
  'GRADUATION',
  'PARTICIPATION',
  'OTHER',
] as const;

export const createCertificateSchema = z.object({
  studentId: z.string().uuid(),
  certificateType: z.enum(CERTIFICATE_TYPES),
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  grade: z.string().optional(),
  rank: z.number().int().positive().optional(),
  issueDate: z.string().datetime(),
  signatoryName: z.string().min(2).max(120),
  signatoryTitle: z.string().min(2).max(120),
  signatureUrl: z.string().url().optional(),
  isPublic: z.boolean().default(false),
});

export const updateCertificateSchema = partialUpdateSchema(createCertificateSchema).omit({
  studentId: true,
});

export const queryCertificateSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().uuid().optional(),
  certificateType: z.enum(CERTIFICATE_TYPES).optional(),
  search: z.string().optional(),
});

export type CreateCertificateDto = z.infer<typeof createCertificateSchema>;
export type UpdateCertificateDto = z.infer<typeof updateCertificateSchema>;
export type QueryCertificateDto = z.infer<typeof queryCertificateSchema>;
