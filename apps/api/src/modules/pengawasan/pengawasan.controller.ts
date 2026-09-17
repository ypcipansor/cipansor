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
import { RoleCode } from '@prisma/client';
import {
  assertUnitAccess as assertActorUnitAccess,
  canAccessUnit,
  isFoundationWide,
} from './pengawasan-access';

/** The acting user's role/unit, as the unit policy needs it. */
function actorOf(req: Request) {
  return { roleCode: req.user?.roleCode, unitId: req.user?.unitId };
}

/**
 * Refuse a write to a record outside the actor's unit. Thin adapter over the
 * reusable policy in `pengawasan-access.ts`, which the services share.
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
  let targetUnitId = req.user?.unitId;

  if (!targetUnitId) {
    if (isFoundationWide(req.user?.roleCode) && body.unitId) {
      targetUnitId = body.unitId;
    } else {
      throw Errors.badRequest('Unit ID is required');
    }
  }

  const audit = await pengawasanService.createAudit({
    ...body,
    unitId: targetUnitId,
    leadAuditorId: userId,
  });

  res.status(201).json({ success: true, data: audit });
});

export const updateAudit = asyncHandler(async (req: Request, res: Response) => {
  const existing = await pengawasanService.getAuditById(req.params.id);
  if (!existing) throw Errors.notFound('Audit not found');

  if (!canAccessUnit(actorOf(req), existing.unitId)) {
    throw Errors.forbidden('Access denied');
  }

  const body = updateAuditSchema.parse(req.body);
  const updateData: any = { ...body };
  if (body.plannedDate) updateData.plannedDate = new Date(body.plannedDate);
  if (body.executedDate) updateData.executedDate = new Date(body.executedDate);
  if (body.completedDate) updateData.completedDate = new Date(body.completedDate);

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
  const isPrivilegedUser = isFoundationWide(req.user?.roleCode);
  const unitId = req.user?.unitId;

  if (!unitId && !isPrivilegedUser) throw Errors.unauthorized('Unit ID required');

  let targetUnitId: string | undefined = unitId ?? undefined;
  if (isPrivilegedUser) {
    const queryUnitId = req.query.unitId ? String(req.query.unitId) : undefined;
    if (queryUnitId === 'all') {
      targetUnitId = undefined;
    } else if (queryUnitId) {
      targetUnitId = queryUnitId;
    }
  }

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

export const getWbsReportById = asyncHandler(async (req: Request, res: Response) => {
  const report = await wbsService.getReportById(req.params.id, wbsActor(req));
  res.json(ApiResponse.success(report));
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

  const suspension = await boardSuspensionService.suspendBoardMember(body, suspendedById);
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
  const excludeUserId = typeof req.query.excludeUserId === 'string' ? req.query.excludeUserId : undefined;
  const candidates = await boardSuspensionService.listPlhCandidates(excludeUserId);
  res.json(ApiResponse.success(candidates));
});

// ==================== FINANCIAL OVERSIGHT CONTROLLERS ====================

export const getFinancialArrears = asyncHandler(async (req: Request, res: Response) => {
  const isExecutiveOversight =
    req.user?.roleCode === RoleCode.SUPER_ADMIN ||
    ['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'YAYASAN_KETUA', 'YAYASAN_BENDAHARA'].includes(
      req.user?.roleCode || ''
    );

  let targetUnitId: string | undefined = req.user?.unitId ?? undefined;

  if (isExecutiveOversight && req.query.unitId) {
    const qUnit = String(req.query.unitId);
    targetUnitId = qUnit === 'all' ? undefined : qUnit;
  }

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
