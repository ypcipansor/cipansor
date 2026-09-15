import { z } from 'zod';

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
  plannedDate: optionalDateSchema,
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

// WBS Validation Schemas
export const createPublicWbsSchema = z.object({
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum([
    'KEUANGAN_ASET',
    'SOP_TATA_KELOLA',
    'ETIKA_PERILAKU',
    'PELAYANAN_AKADEMIK_PENGASUHAN',
    'LAINNYA',
  ]),
  targetLevel: z.enum([
    'PENGURUS_YAYASAN',
    'PENGAWAS_YAYASAN',
    'KEPALA_UNIT',
    'STAF_PEGAWAI',
    'SISWA_SANTRI',
  ]),
  targetName: z.string().optional(),
  subject: z.string().min(3),
  description: z.string().min(10),
  location: z.string().optional(),
  incidentDate: optionalDateSchema,
  isAnonymous: z.boolean().optional(),
  reporterName: z.string().optional(),
  reporterContact: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  turnstileToken: z.string().optional(),
});

export const trackPublicWbsSchema = z.object({
  ticketCode: z.string().min(3),
  trackingToken: z.string().min(5),
  turnstileToken: z.string().optional(),
});

export const addPublicWbsCommentSchema = z.object({
  ticketCode: z.string().min(3),
  trackingToken: z.string().min(5),
  message: z.string().min(1),
  attachments: z.array(z.string()).optional(),
  turnstileToken: z.string().optional(),
});

export const updateWbsStatusSchema = z.object({
  status: z.enum([
    'DIAJUKAN',
    'DALAM_PENYELIDIKAN',
    'DITINDAKLANJUTI',
    'SELESAI',
    'TIDAK_DAPAT_DITINDAKLANJUTI',
  ]),
  resolution: z.string().optional(),
  handlerNote: z.string().optional(),
});

export const forwardWbsReportSchema = z.object({
  toRole: z.string().min(2),
  toUserId: z.string().uuid().optional(),
  reason: z.string().min(5),
});

export const addWbsHandlerCommentSchema = z.object({
  message: z.string().min(1),
  attachments: z.array(z.string()).optional(),
});

// Board Member Suspension Validation Schemas
export const createBoardSuspensionSchema = z.object({
  userId: z.string().uuid(),
  skNumber: z.string().min(3),
  auditReason: z.string().min(10),
  documentUrl: z.string().optional(),
  startDate: optionalDateSchema,
  projectedEndDate: optionalDateSchema,
  plhUserId: z.string().uuid().optional().nullable(),
  plhRoleCode: z.string().optional().nullable(),
});

export const liftBoardSuspensionSchema = z.object({
  liftReason: z.string().min(5),
});

// Periodic Report Submission Schema
export const submitPeriodicReportSchema = z.object({
  title: z.string().min(3),
  period: z.string().min(2),
  executiveSummary: z.string().min(10),
  findingsSummary: z.string().optional(),
  recommendations: z.string().optional(),
});
