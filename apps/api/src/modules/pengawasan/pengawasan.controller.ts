import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { pengawasanService } from './pengawasan.service';
import { wbsService } from './wbs.service';
import { boardSuspensionService } from './board-suspension.service';
import {
  createAuditSchema,
  updateAuditSchema,
  createFindingSchema,
  updateFindingSchema,
  createFollowUpSchema,
  updateFollowUpSchema,
  listAuditQuerySchema,
  createPublicWbsSchema,
  trackPublicWbsSchema,
  addPublicWbsCommentSchema,
  updateWbsStatusSchema,
  forwardWbsReportSchema,
  addWbsHandlerCommentSchema,
  createBoardSuspensionSchema,
  liftBoardSuspensionSchema,
  draftPeriodicReportSchema,
} from './pengawasan.validation';
import {
  assertUnitAccess as assertActorUnitAccess,
  canAccessUnit,
  isFoundationWide,
  resolveArrearsUnitId,
  resolveAuditUnitId,
} from './pengawasan.policy';
import type { Prisma } from '@prisma/client';

/** The acting user's role/unit, as the unit policy needs it. */
function actorOf(req: Request) {
  return { roleCode: req.user?.roleCode, unitId: req.user?.unitId };
}

/**
 * Refuse a write to a record outside the actor's unit. Thin adapter over the
 * reusable policy in `pengawasan.policy.ts`, which the services share.
 */
function assertUnitAccess(req: Request, recordUnitId: string | null | undefined): void {
  assertActorUnitAccess(actorOf(req), recordUnitId);
}

/** The acting handler's identity, as the WBS service needs it for scoping. */
function wbsActor(req: Request) {
  return {
    id: req.user?.sub || '',
    name: req.user?.email || 'Handler',
    roleCode: req.user?.roleCode || req.user?.role,
    unitId: req.user?.unitId,
  };
}

// ==================== AUDITS ====================

export const listAudits = asyncHandler(async (req: Request, res: Response) => {
  const unitId = req.user?.unitId ?? undefined;
  const isPrivilegedUser = isFoundationWide(req.user?.roleCode);

  // A unit-scoped role without a unit cannot be allowed to fall through to an
  // unscoped query — `undefined` means "every unit" to `getAudits`, so that
  // would hand a unitless actor the foundation-wide list.
  if (!unitId && !isPrivilegedUser) throw Errors.unauthorized('Unit ID required');

  // Foundation-wide governance sees every unit by default; an explicit
  // `unitId` narrows it to one. `undefined` is a legitimate, intended value
  // here (cross-unit view), so it must not be treated as "missing" — the old
  // check required Super Admin specifically and rejected every other
  // foundation-wide role that had already passed `isFoundationWide` with
  // "Unit ID required".
  let targetUnitId: string | undefined;
  if (isPrivilegedUser) {
    const requested = req.query.unitId ? String(req.query.unitId) : undefined;
    targetUnitId = requested === 'all' ? undefined : requested;
  } else {
    targetUnitId = unitId;
  }

  const query = listAuditQuerySchema.parse({
    status: req.query.status,
    auditType: req.query.auditType,
  });

  const audits = await pengawasanService.getAudits(targetUnitId, query);
  res.json(ApiResponse.success(audits));
});

export const getAudit = asyncHandler(async (req: Request, res: Response) => {
  const audit = await pengawasanService.getAuditById(req.params.id);
  if (!audit) throw Errors.notFound('Audit not found');

  if (!canAccessUnit(actorOf(req), audit.unitId)) {
    throw Errors.forbidden('Access denied');
  }

  res.json(ApiResponse.success(audit));
});

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createAuditSchema.parse(req.body);

  // The target unit is a policy decision, not an inline preference. A
  // foundation-wide reviewer who names a unit gets that unit; a unit-scoped
  // actor can only ever file into its own, and a target that cannot be
  // determined fails closed rather than being guessed. See `resolveAuditUnitId`.
  const targetUnitId = resolveAuditUnitId(actorOf(req), body.unitId);

  const audit = await pengawasanService.createAudit({
    ...body,
    unitId: targetUnitId,
    leadAuditorId: userId,
  });

  res.status(201).json(ApiResponse.success(audit));
});

export const updateAudit = asyncHandler(async (req: Request, res: Response) => {
  const existing = await pengawasanService.getAuditById(req.params.id);
  if (!existing) throw Errors.notFound('Audit not found');

  if (!canAccessUnit(actorOf(req), existing.unitId)) {
    throw Errors.forbidden('Access denied');
  }

  const body = updateAuditSchema.parse(req.body);
  const updateData: Prisma.InternalAuditUpdateInput = { ...body };

  // Explicit nullable-date contract:
  //   undefined → the field was omitted, leave the stored value alone;
  //   null      → the caller asked to clear it;
  //   string    → parse and set.
  //
  // The old code used a truthy check (`if (body.executedDate)`), which cannot
  // distinguish `undefined` from `null` and so turned "clear this date" into
  // "do not touch". `plannedDate` is a NOT NULL column, so `null` is rejected
  // at the edge and never reaches here.
  if (body.plannedDate !== undefined) updateData.plannedDate = new Date(body.plannedDate);
  if (body.executedDate !== undefined) {
    updateData.executedDate = body.executedDate === null ? null : new Date(body.executedDate);
  }
  if (body.completedDate !== undefined) {
    updateData.completedDate = body.completedDate === null ? null : new Date(body.completedDate);
  }

  const audit = await pengawasanService.updateAudit(req.params.id, updateData);
  res.json(ApiResponse.success(audit));
});

export const deleteAudit = asyncHandler(async (req: Request, res: Response) => {
  const existing = await pengawasanService.getAuditById(req.params.id);
  if (!existing) throw Errors.notFound('Audit not found');

  if (!canAccessUnit(actorOf(req), existing.unitId)) {
    throw Errors.forbidden('Access denied');
  }

  await pengawasanService.deleteAudit(req.params.id);
  res.json(ApiResponse.success(undefined, 'Audit deleted'));
});

// ==================== FINDINGS ====================

export const createFinding = asyncHandler(async (req: Request, res: Response) => {
  const body = createFindingSchema.parse(req.body);

  const audit = await pengawasanService.getAuditById(body.auditId);
  if (!audit) throw Errors.notFound('Audit not found');
  assertUnitAccess(req, audit.unitId);

  const finding = await pengawasanService.createFinding(body);
  res.status(201).json({ success: true, data: finding });
});

export const updateFinding = asyncHandler(async (req: Request, res: Response) => {
  const recordUnitId = await pengawasanService.getFindingAuditUnitId(req.params.id);
  if (recordUnitId === null) throw Errors.notFound('Finding not found');
  assertUnitAccess(req, recordUnitId);

  const body = updateFindingSchema.parse(req.body);
  const finding = await pengawasanService.updateFinding(req.params.id, body);
  res.json(ApiResponse.success(finding));
});

export const deleteFinding = asyncHandler(async (req: Request, res: Response) => {
  const recordUnitId = await pengawasanService.getFindingAuditUnitId(req.params.id);
  if (recordUnitId === null) throw Errors.notFound('Finding not found');
  assertUnitAccess(req, recordUnitId);

  await pengawasanService.deleteFinding(req.params.id);
  res.json(ApiResponse.success(undefined, 'Finding deleted'));
});

// ==================== FOLLOW-UPS ====================

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const body = createFollowUpSchema.parse(req.body);

  const findingUnitId = await pengawasanService.getFindingAuditUnitId(body.findingId);
  if (findingUnitId === null) throw Errors.notFound('Finding not found');
  assertUnitAccess(req, findingUnitId);

  const followUp = await pengawasanService.createFollowUp(body);
  res.status(201).json({ success: true, data: followUp });
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const recordUnitId = await pengawasanService.getFollowUpAuditUnitId(req.params.id);
  if (recordUnitId === null) throw Errors.notFound('Follow-up not found');
  assertUnitAccess(req, recordUnitId);

  const body = updateFollowUpSchema.parse(req.body);
  const followUp = await pengawasanService.updateFollowUp(req.params.id, body, req.user?.sub);
  res.json(ApiResponse.success(followUp));
});

export const deleteFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const recordUnitId = await pengawasanService.getFollowUpAuditUnitId(req.params.id);
  if (recordUnitId === null) throw Errors.notFound('Follow-up not found');
  assertUnitAccess(req, recordUnitId);

  await pengawasanService.deleteFollowUp(req.params.id);
  res.json(ApiResponse.success(undefined, 'Follow-up deleted'));
});

// ==================== SUGGESTIONS ====================

export const getAuditSuggestions = asyncHandler(async (req: Request, res: Response) => {
  // Unit scope is resolved the same way `listAudits` resolves it, so the
  // suggestions agree with the list the reviewer is looking at. The previous
  // form started from the actor's own token `unitId` even for a foundation-wide
  // role, so a Pengawas who carries a unit (the foundation unit) got suggestions
  // for that one unit only while their audit list showed every unit.
  //
  // `resolveArrearsUnitId`'s semantics are exactly right here and reused rather
  // than re-spelled: a foundation-wide role sees every unit by default and may
  // narrow with a query, `"all"` is the cross-unit sentinel, and a unit-scoped
  // actor is confined to its own unit and refused when it has none.
  const targetUnitId = resolveArrearsUnitId(actorOf(req), req.query.unitId as string | undefined);

  const suggestions = await pengawasanService.suggestAuditSchedules(targetUnitId);
  res.json(ApiResponse.success(suggestions));
});

// ==================== PUBLIC WBS CONTROLLERS ====================

export const createPublicWbsReport = asyncHandler(async (req: Request, res: Response) => {
  const body = createPublicWbsSchema.parse(req.body);
  const result = await wbsService.createPublicReport(body);
  res.status(201).json(ApiResponse.success(result));
});

export const getPublicWbsTracking = asyncHandler(async (req: Request, res: Response) => {
  const body = trackPublicWbsSchema.parse(req.body);
  const result = await wbsService.getPublicTracking(body.ticketCode, body.trackingToken);
  res.json(ApiResponse.success(result));
});

export const addPublicWbsComment = asyncHandler(async (req: Request, res: Response) => {
  const body = addPublicWbsCommentSchema.parse(req.body);
  const result = await wbsService.addPublicComment(
    body.ticketCode,
    body.trackingToken,
    body.message,
    body.attachments
  );
  res.status(201).json(ApiResponse.success(result));
});

// ==================== AUTHENTICATED WBS CONTROLLERS ====================

export const listWbsReports = asyncHandler(async (req: Request, res: Response) => {
  const reports = await wbsService.getReportsForUser(wbsActor(req));
  res.json(ApiResponse.success(reports));
});

export const updateWbsStatus = asyncHandler(async (req: Request, res: Response) => {
  const body = updateWbsStatusSchema.parse(req.body);
  const updated = await wbsService.updateReportStatus(req.params.id, body, wbsActor(req));
  res.json(ApiResponse.success(updated));
});

export const forwardWbsReport = asyncHandler(async (req: Request, res: Response) => {
  const body = forwardWbsReportSchema.parse(req.body);
  const updated = await wbsService.forwardReport(req.params.id, body, wbsActor(req));
  res.json(ApiResponse.success(updated));
});

export const addHandlerWbsComment = asyncHandler(async (req: Request, res: Response) => {
  const body = addWbsHandlerCommentSchema.parse(req.body);
  const comment = await wbsService.addHandlerComment(
    req.params.id,
    body.message,
    body.attachments,
    wbsActor(req)
  );
  res.status(201).json(ApiResponse.success(comment));
});

// ==================== BOARD MEMBER SUSPENSION CONTROLLERS ====================

export const createBoardSuspension = asyncHandler(async (req: Request, res: Response) => {
  const body = createBoardSuspensionSchema.parse(req.body);
  const suspendedById = req.user?.sub;
  if (!suspendedById) throw Errors.unauthorized('User context missing');

  // Pass the actor's role so the service can re-enforce the issuance policy,
  // not just rely on the route guard.
  const suspension = await boardSuspensionService.suspendBoardMember(
    body,
    suspendedById,
    req.user?.roleCode
  );
  res.status(201).json(ApiResponse.success(suspension));
});

export const liftBoardSuspension = asyncHandler(async (req: Request, res: Response) => {
  const body = liftBoardSuspensionSchema.parse(req.body);
  const liftedById = req.user?.sub;
  if (!liftedById) throw Errors.unauthorized('User context missing');

  const updated = await boardSuspensionService.liftBoardSuspension(
    req.params.id,
    liftedById,
    body.liftReason
  );
  res.json(ApiResponse.success(updated));
});

export const listBoardSuspensions = asyncHandler(async (_req: Request, res: Response) => {
  const suspensions = await boardSuspensionService.getBoardSuspensions();
  res.json(ApiResponse.success(suspensions));
});

export const listSuspendableCandidates = asyncHandler(async (_req: Request, res: Response) => {
  const candidates = await boardSuspensionService.listSuspendableCandidates();
  res.json(ApiResponse.success(candidates));
});

export const listPlhCandidates = asyncHandler(async (req: Request, res: Response) => {
  const excludeUserId =
    typeof req.query.excludeUserId === 'string' ? req.query.excludeUserId : undefined;
  const candidates = await boardSuspensionService.listPlhCandidates(excludeUserId);
  res.json(ApiResponse.success(candidates));
});

// ==================== FINANCIAL OVERSIGHT CONTROLLERS ====================

export const getFinancialArrears = asyncHandler(async (req: Request, res: Response) => {
  const targetUnitId = resolveArrearsUnitId(
    actorOf(req),
    req.query.unitId ? String(req.query.unitId) : undefined
  );

  const data = await pengawasanService.getFinancialArrears(targetUnitId);
  res.json(ApiResponse.success(data));
});

// ==================== PERIODIC OVERSIGHT REPORT CONTROLLERS ====================

export const draftPeriodicReportToEOffice = asyncHandler(async (req: Request, res: Response) => {
  const body = draftPeriodicReportSchema.parse(req.body);
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');
  const actor = wbsActor(req);

  const result = await pengawasanService.draftPeriodicReportToEOffice(body, userId, actor);
  res.status(201).json(ApiResponse.success(result));
});
