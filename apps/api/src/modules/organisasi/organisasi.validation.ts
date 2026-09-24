import { z } from 'zod';

// ── OrgUnit ─────────────────────────────────────────
export const createOrgUnitSchema = z.object({
  body: z.object({
    unitId: z.string().uuid(),
    name: z.string().min(2),
    code: z.string().min(2),
    description: z.string().optional(),
    parentId: z.string().uuid().optional(),
    level: z.number().int().min(0).optional(),
    sortOrder: z.number().int().min(0).optional(),
  }),
});

export const updateOrgUnitSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).optional(),
    description: z.string().optional(),
    parentId: z.string().uuid().nullable().optional(),
    level: z.number().int().min(0).optional(),
    sortOrder: z.number().int().min(0).optional(),
  }),
});

// ── OrgPosition ─────────────────────────────────────
export const createPositionSchema = z.object({
  body: z.object({
    orgUnitId: z.string().uuid(),
    title: z.string().min(2),
    code: z.string().optional(),
    level: z.number().int().min(0).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'VACANT']).optional(),
    holderId: z.string().uuid().optional(),
    description: z.string().optional(),
    requirements: z.string().optional(),
  }),
});

export const updatePositionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    title: z.string().min(2).optional(),
    code: z.string().optional(),
    level: z.number().int().min(0).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'VACANT']).optional(),
    holderId: z.string().uuid().nullable().optional(),
    description: z.string().optional(),
    requirements: z.string().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const unitIdQuerySchema = z.object({
  query: z.object({
    unitId: z.string().uuid().optional(),
  }),
});
