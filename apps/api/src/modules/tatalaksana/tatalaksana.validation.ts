import { z } from 'zod';

export const createSOPSchema = z.object({
  body: z.object({
    unitId: z.string().uuid(),
    documentNumber: z.string().min(3),
    title: z.string().min(3),
    description: z.string().optional(),
    category: z.string().min(1),
    content: z.string().optional(),
    scope: z.string().optional(),
    responsibility: z.string().optional(),
    effectiveDate: z.string().datetime().optional(),
    reviewDate: z.string().datetime().optional(),
  }),
});

export const updateSOPSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    category: z.string().min(1).optional(),
    content: z.string().optional(),
    scope: z.string().optional(),
    responsibility: z.string().optional(),
    effectiveDate: z.string().datetime().optional(),
    reviewDate: z.string().datetime().optional(),
    status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
  }),
});

export const createRevisionSchema = z.object({
  body: z.object({
    sopId: z.string().uuid(),
    changeNotes: z.string().min(5),
    content: z.string().optional(),
  }),
});

export const sopQuerySchema = z.object({
  query: z.object({
    unitId: z.string().uuid().optional(),
    status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
    category: z.string().optional(),
    search: z.string().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
