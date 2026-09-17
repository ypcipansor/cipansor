import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
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
  submitPeriodicReportSchema,
} from './pengawasan.validation';
import { UserRole } from '@prisma/client';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];

function isPrivileged(role?: string): boolean {
  return role ? PRIVILEGED_ROLES.includes(role) : false;
}

// ==================== AUDITS ====================

export const listAudits = asyncHandler(async (req: Request, res: Response) => {
  const unitId = req.user?.unitId;
  const isPrivilegedUser = isPrivileged(req.user?.role);

  if (!unitId && !isPrivilegedUser) throw Errors.unauthorized('Unit ID required');
  const targetUnitId =
    isPrivilegedUser && req.query.unitId ? String(req.query.unitId) : unitId ?? undefined;
  if (!targetUnitId && req.user?.role !== UserRole.SUPER_ADMIN) {
    throw Errors.badRequest('Unit ID required');
  }

  const query = listAuditQuerySchema.parse({
    status: req.query.status,
    auditType: req.query.auditType,
  });

  const audits = await pengawasanService.getAudits(targetUnitId, query);
  res.json({ success: true, data: audits });
});

export const getAudit = asyncHandler(async (req: Request, res: Response) => {
  const audit = await pengawasanService.getAuditById(req.params.id);
  if (!audit) throw Errors.notFound('Audit not found');

  if (!isPrivileged(req.user?.role) && audit.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }

  res.json({ success: true, data: audit });
});

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createAuditSchema.parse(req.body);
  let targetUnitId = req.user?.unitId;

  if (!targetUnitId) {
    if (isPrivileged(req.user?.role) && body.unitId) {
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

  if (!isPrivileged(req.user?.role) && existing.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }

  const body = updateAuditSchema.parse(req.body);
  const updateData: any = { ...body };
  if (body.plannedDate) updateData.plannedDate = new Date(body.plannedDate);
  if (body.executedDate) updateData.executedDate = new Date(body.executedDate);
  if (body.completedDate) updateData.completedDate = new Date(body.completedDate);

  const audit = await pengawasanService.updateAudit(req.params.id, updateData);
  res.json({ success: true, data: audit });
});

export const deleteAudit = asyncHandler(async (req: Request, res: Response) => {
  const existing = await pengawasanService.getAuditById(req.params.id);
  if (!existing) throw Errors.notFound('Audit not found');

  if (!isPrivileged(req.user?.role) && existing.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }

  await pengawasanService.deleteAudit(req.params.id);
  res.json({ success: true, message: 'Audit deleted' });
});

// ==================== FINDINGS ====================

export const createFinding = asyncHandler(async (req: Request, res: Response) => {
  const body = createFindingSchema.parse(req.body);
  const finding = await pengawasanService.createFinding(body);
  res.status(201).json({ success: true, data: finding });
});

export const updateFinding = asyncHandler(async (req: Request, res: Response) => {
  const body = updateFindingSchema.parse(req.body);
  const finding = await pengawasanService.updateFinding(req.params.id, body);
  res.json({ success: true, data: finding });
});

export const deleteFinding = asyncHandler(async (req: Request, res: Response) => {
  await pengawasanService.deleteFinding(req.params.id);
  res.json({ success: true, message: 'Finding deleted' });
});

// ==================== FOLLOW-UPS ====================

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const body = createFollowUpSchema.parse(req.body);
  const followUp = await pengawasanService.createFollowUp(body);
  res.status(201).json({ success: true, data: followUp });
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const body = updateFollowUpSchema.parse(req.body);
  const followUp = await pengawasanService.updateFollowUp(req.params.id, body, req.user?.sub);
  res.json({ success: true, data: followUp });
});

export const deleteFollowUp = asyncHandler(async (req: Request, res: Response) => {
  await pengawasanService.deleteFollowUp(req.params.id);
  res.json({ success: true, message: 'Follow-up deleted' });
});

// ==================== SUGGESTIONS ====================

export const getAuditSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const isPrivilegedUser = isPrivileged(req.user?.role);
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
  res.json({ success: true, data: suggestions });
});

// ==================== PUBLIC WBS CONTROLLERS ====================

export const createPublicWbsReport = asyncHandler(async (req: Request, res: Response) => {
  const body = createPublicWbsSchema.parse(req.body);
  const result = await wbsService.createPublicReport(body);
  res.status(201).json({ success: true, data: result });
});

export const getPublicWbsTracking = asyncHandler(async (req: Request, res: Response) => {
  const body = trackPublicWbsSchema.parse(req.body);
  const result = await wbsService.getPublicTracking(body.ticketCode, body.trackingToken);
  res.json({ success: true, data: result });
});

export const addPublicWbsComment = asyncHandler(async (req: Request, res: Response) => {
  const body = addPublicWbsCommentSchema.parse(req.body);
  const result = await wbsService.addPublicComment(
    body.ticketCode,
    body.trackingToken,
    body.message,
    body.attachments
  );
  res.status(201).json({ success: true, data: result });
});

// ==================== AUTHENTICATED WBS CONTROLLERS ====================

export const listWbsReports = asyncHandler(async (req: Request, res: Response) => {
  const actor = {
    roleCode: req.user?.roleCode || req.user?.role,
    unitId: req.user?.unitId,
  };
  const reports = await wbsService.getReportsForUser(actor);
  res.json({ success: true, data: reports });
});

export const getWbsReportById = asyncHandler(async (req: Request, res: Response) => {
  const report = await wbsService.getReportById(req.params.id);
  res.json({ success: true, data: report });
});

export const updateWbsStatus = asyncHandler(async (req: Request, res: Response) => {
  const body = updateWbsStatusSchema.parse(req.body);
  const user = {
    id: req.user?.sub || '',
    name: req.user?.email || 'Handler',
  };
  const updated = await wbsService.updateReportStatus(req.params.id, body, user);
  res.json({ success: true, data: updated });
});

export const forwardWbsReport = asyncHandler(async (req: Request, res: Response) => {
  const body = forwardWbsReportSchema.parse(req.body);
  const actor = {
    id: req.user?.sub || '',
    name: req.user?.email || 'Handler',
    roleCode: req.user?.roleCode || req.user?.role,
  };
  const updated = await wbsService.forwardReport(req.params.id, body, actor);
  res.json({ success: true, data: updated });
});

export const addHandlerWbsComment = asyncHandler(async (req: Request, res: Response) => {
  const body = addWbsHandlerCommentSchema.parse(req.body);
  const user = {
    id: req.user?.sub || '',
    name: req.user?.email || 'Handler',
    roleCode: req.user?.roleCode || req.user?.role,
  };
  const comment = await wbsService.addHandlerComment(req.params.id, body.message, body.attachments, user);
  res.status(201).json({ success: true, data: comment });
});

// ==================== BOARD MEMBER SUSPENSION CONTROLLERS ====================

export const createBoardSuspension = asyncHandler(async (req: Request, res: Response) => {
  const body = createBoardSuspensionSchema.parse(req.body);
  const suspendedById = req.user?.sub;
  if (!suspendedById) throw Errors.unauthorized('User context missing');

  const suspension = await boardSuspensionService.suspendBoardMember(body, suspendedById);
  res.status(201).json({ success: true, data: suspension });
});

export const liftBoardSuspension = asyncHandler(async (req: Request, res: Response) => {
  const body = liftBoardSuspensionSchema.parse(req.body);
  const liftedById = req.user?.sub;
  if (!liftedById) throw Errors.unauthorized('User context missing');

  const updated = await boardSuspensionService.liftBoardSuspension(req.params.id, liftedById, body.liftReason);
  res.json({ success: true, data: updated });
});

export const listBoardSuspensions = asyncHandler(async (_req: Request, res: Response) => {
  const suspensions = await boardSuspensionService.getBoardSuspensions();
  res.json({ success: true, data: suspensions });
});

// ==================== FINANCIAL OVERSIGHT CONTROLLERS ====================

export const getFinancialArrears = asyncHandler(async (req: Request, res: Response) => {
  const isExecutiveOversight =
    req.user?.role === UserRole.SUPER_ADMIN ||
    ['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'YAYASAN_KETUA', 'YAYASAN_BENDAHARA'].includes(req.user?.roleCode || '');

  let targetUnitId: string | undefined = req.user?.unitId ?? undefined;

  if (isExecutiveOversight && req.query.unitId) {
    const qUnit = String(req.query.unitId);
    targetUnitId = qUnit === 'all' ? undefined : qUnit;
  }

  const data = await pengawasanService.getFinancialArrears(targetUnitId);
  res.json({ success: true, data });
});

// ==================== PERIODIC OVERSIGHT REPORT CONTROLLERS ====================

export const submitPeriodicReportToEOffice = asyncHandler(async (req: Request, res: Response) => {
  const body = submitPeriodicReportSchema.parse(req.body);
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');
  const userRole = req.user?.roleCode || req.user?.role || 'YAYASAN_PENGAWAS';

  const result = await pengawasanService.submitPeriodicReportToEOffice(body, userId, userRole);
  res.status(201).json({ success: true, data: result });
});
