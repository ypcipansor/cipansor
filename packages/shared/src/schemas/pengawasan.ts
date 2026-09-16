import { z } from "zod";
import {
  PLH_ROLE_CODES,
  WBS_CATEGORIES,
  WBS_STATUSES,
  WBS_TARGET_LEVELS,
} from "../types/pengawasan";

/**
 * WBS & board-suspension request contracts.
 *
 * These payloads were declared twice — once in the API's
 * `pengawasan.validation.ts` and again (as loose `z.string()` / `any`) in the
 * web form — so the two could describe different shapes for the same endpoint.
 * The repository rule is that a contract lives once, in `@cipansor/shared`, and
 * both apps import it: the API validates with it at the edge, the web builds
 * its form from the same type.
 */

const dateStringSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Format tanggal tidak valid",
});

const optionalDateSchema = dateStringSchema.optional().nullable();

// ---------------------------------------------------------------------------
// Public WBS
// ---------------------------------------------------------------------------

export const createPublicWbsSchema = z.object({
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum(WBS_CATEGORIES),
  targetLevel: z.enum(WBS_TARGET_LEVELS),
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

export type CreatePublicWbsInput = z.infer<typeof createPublicWbsSchema>;

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

// ---------------------------------------------------------------------------
// Authenticated WBS handlers
// ---------------------------------------------------------------------------

export const updateWbsStatusSchema = z.object({
  status: z.enum(WBS_STATUSES),
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

// ---------------------------------------------------------------------------
// Board member suspension
// ---------------------------------------------------------------------------

export const createBoardSuspensionSchema = z.object({
  userId: z.string().uuid(),
  skNumber: z.string().min(3),
  auditReason: z.string().min(10),
  documentUrl: z.string().optional(),
  startDate: optionalDateSchema,
  projectedEndDate: optionalDateSchema,
  plhUserId: z.string().uuid().optional().nullable(),
  // A Plh/Plt may only hold a Pengurus role. This is enforced again in the
  // service, but rejecting Super Admin / Pembina / unit roles here fails the
  // request at the edge rather than partway through a suspension.
  plhRoleCode: z.enum(PLH_ROLE_CODES).optional().nullable(),
});

export type CreateBoardSuspensionInput = z.infer<typeof createBoardSuspensionSchema>;

export const liftBoardSuspensionSchema = z.object({
  liftReason: z.string().min(5),
});

// ---------------------------------------------------------------------------
// Periodic oversight report
// ---------------------------------------------------------------------------

export const submitPeriodicReportSchema = z.object({
  title: z.string().min(3),
  period: z.string().min(2),
  executiveSummary: z.string().min(10),
  findingsSummary: z.string().optional(),
  recommendations: z.string().optional(),
});

export type SubmitPeriodicReportInput = z.infer<typeof submitPeriodicReportSchema>;
