import { z } from 'zod';

export const createPlanSchema = z.object({
  title: z.string().min(3, 'Judul minimal 3 karakter'),
  description: z.string().optional(),
  type: z.enum(['RPJP', 'RENSTRA', 'RKA']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  budget: z.number().positive().optional(),
  unitId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
});

// `status` sengaja TIDAK diterima pada update rencana. Transisi status hanya
// boleh lewat /approve (yang juga mengisi approvedBy/approvedAt). Sebelumnya
// status dibuka sebagai enum arbitrer sehingga pemanggil dengan akses tulis
// bisa menyetel APPROVED langsung (membajak alur persetujuan, tanpa metadata
// approval) atau membuka kembali rencana final ke DRAFT.
export const updatePlanSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  type: z.enum(['RPJP', 'RENSTRA', 'RKA']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
  progress: z.number().min(0).max(100).optional(),
  unitId: z.string().uuid().optional(),
});

export const createObjectiveSchema = z.object({
  planId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  weight: z.number().min(0).max(100).optional(),
  order: z.number().int().optional(),
  perspective: z.enum(['FINANCIAL', 'CUSTOMER', 'PROCESS', 'LEARNING']).optional(),
});

export const updateObjectiveSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  weight: z.number().min(0).max(100).optional(),
  progress: z.number().min(0).max(100).optional(),
  order: z.number().int().optional(),
  perspective: z.enum(['FINANCIAL', 'CUSTOMER', 'PROCESS', 'LEARNING']).optional(),
});

export const createIndicatorSchema = z.object({
  objectiveId: z.string().uuid(),
  name: z.string().min(3),
  unit: z.string().min(1),
  baseline: z.number().optional(),
  targetValue: z.number(),
});

export const updateIndicatorSchema = z.object({
  name: z.string().min(3).optional(),
  unit: z.string().optional(),
  baseline: z.number().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
});

export const createActivitySchema = z.object({
  objectiveId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  picId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export const updateActivitySchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  picId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  status: z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  notes: z.string().optional(),
});

export const listPlanQuerySchema = z.object({
  type: z.enum(['RPJP', 'RENSTRA', 'RKA']).optional(),
  status: z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  unitId: z.string().uuid().optional(),
});

// ==================== PENGESAHAN DOKUMEN YAYASAN ====================
// Pengurus mengajukan → Pengawas mereviu → Pengurus menanggapi → Pembina
// menetapkan atau mengembalikan. The contract lives once in @cipansor/shared;
// the web dialogs validate with the same schemas before sending.
export {
  submitForReviewSchema,
  reviewResultSchema,
  proposeToPembinaSchema,
  decidePlanSchema,
} from '@cipansor/shared';
