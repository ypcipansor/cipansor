import { z } from 'zod';
// WBS and suspension request contracts live in `@cipansor/shared` so the web
// client and this edge validator describe the same payload. Re-exported below
// so the controller keeps importing from one module.
import {
  createPublicWbsSchema,
  trackPublicWbsSchema,
  addPublicWbsCommentSchema,
  updateWbsStatusSchema,
  forwardWbsReportSchema,
  addWbsHandlerCommentSchema,
  createBoardSuspensionSchema,
  liftBoardSuspensionSchema,
  draftPeriodicReportSchema,
} from '@cipansor/shared';
import type { DraftPeriodicReportInput } from '@cipansor/shared';

export {
  createPublicWbsSchema,
  trackPublicWbsSchema,
  addPublicWbsCommentSchema,
  updateWbsStatusSchema,
  forwardWbsReportSchema,
  addWbsHandlerCommentSchema,
  createBoardSuspensionSchema,
  liftBoardSuspensionSchema,
  draftPeriodicReportSchema,
};

export type { DraftPeriodicReportInput };

const dateStringSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Format tanggal tidak valid',
});

const optionalDateSchema = dateStringSchema.optional().nullable();

export const createAuditSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  auditType: z.string().min(1),
  plannedDate: dateStringSchema,
  scope: z.string().optional(),
  methodology: z.string().optional(),
  unitId: z.string().uuid().optional(),
  strategicPlanId: z.string().uuid().optional(),
  riskId: z.string().uuid().optional(),
});

export const updateAuditSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  auditType: z.string().optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  // `planned_date` is a required, non-null column in the schema. Accepting
  // `null` here only pushed the failure from this validator down into a Prisma
  // error at write time, so a mandatory field stays mandatory at the edge.
  plannedDate: dateStringSchema.optional(),
  executedDate: optionalDateSchema,
  completedDate: optionalDateSchema,
  scope: z.string().optional(),
  methodology: z.string().optional(),
  conclusion: z.string().optional(),
});

export const createFindingSchema = z.object({
  auditId: z.string().uuid(),
  findingNumber: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(1),
  severity: z.enum(['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL']),
  category: z.string().min(1),
  evidence: z.string().optional(),
  rootCause: z.string().optional(),
  recommendation: z.string().optional(),
  responsibleId: z.string().uuid().optional(),
  dueDate: optionalDateSchema,
  planObjectiveId: z.string().uuid().optional(),
  linkToRiskId: z.string().uuid().optional(),
});

export const updateFindingSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  severity: z.enum(['OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL']).optional(),
  category: z.string().optional(),
  evidence: z.string().optional(),
  rootCause: z.string().optional(),
  recommendation: z.string().optional(),
  responsibleId: z.string().uuid().nullable().optional(),
  dueDate: optionalDateSchema,
  planObjectiveId: z.string().uuid().nullable().optional(),
});

export const createFollowUpSchema = z.object({
  findingId: z.string().uuid(),
  action: z.string().min(1),
  dueDate: optionalDateSchema,
  evidence: z.string().optional(),
});

export const updateFollowUpSchema = z.object({
  action: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'OVERDUE']).optional(),
  evidence: z.string().optional(),
  dueDate: optionalDateSchema,
});

export const listAuditQuerySchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  auditType: z.string().optional(),
  strategicPlanId: z.string().uuid().optional(),
  riskId: z.string().uuid().optional(),
});

