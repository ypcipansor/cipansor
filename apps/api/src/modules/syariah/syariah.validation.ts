import { z } from 'zod';

export const createComplianceSchema = z.object({
  category: z.enum(['MUAMALAH', 'TARBIYAH', 'IBADAH', 'AKHLAQ', 'GOVERNANCE']),
  title: z.string().min(3),
  description: z.string().optional(),
  standard: z.string().optional(),
  unitId: z.string().uuid().optional(),
});

export const updateComplianceSchema = z.object({
  category: z.enum(['MUAMALAH', 'TARBIYAH', 'IBADAH', 'AKHLAQ', 'GOVERNANCE']).optional(),
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  standard: z.string().optional(),
  status: z
    .enum(['COMPLIANT', 'PARTIALLY', 'NON_COMPLIANT', 'UNDER_REVIEW', 'NOT_APPLICABLE'])
    .optional(),
  score: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  nextReviewAt: z.string().datetime().optional(),
});

export const createShariaAuditSchema = z.object({
  complianceId: z.string().uuid(),
  auditDate: z.string().datetime(),
  findings: z.string().min(1),
  recommendation: z.string().optional(),
  score: z.number().min(0).max(100),
  evidence: z.string().optional(),
});

export const listComplianceQuerySchema = z.object({
  category: z.enum(['MUAMALAH', 'TARBIYAH', 'IBADAH', 'AKHLAQ', 'GOVERNANCE']).optional(),
  status: z
    .enum(['COMPLIANT', 'PARTIALLY', 'NON_COMPLIANT', 'UNDER_REVIEW', 'NOT_APPLICABLE'])
    .optional(),
});
