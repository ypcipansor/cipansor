import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { pengawasanService } from './pengawasan.service';
import {
  createAuditSchema,
  updateAuditSchema,
  createFindingSchema,
  updateFindingSchema,
  createFollowUpSchema,
  updateFollowUpSchema,
  listAuditQuerySchema,
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
    isPrivilegedUser && req.query.unitId ? String(req.query.unitId) : (unitId ?? undefined);
  // A global SUPER_ADMIN (no assigned unit) gets the cross-unit view
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

  // Privileged users can:
  //   - pass ?unitId=<uuid> to scope to a specific unit
  //   - pass ?unitId=all   to get cross-unit suggestions (global view)
  //   - omit ?unitId       to default to their own token unitId (or cross-unit if token has none)
  // Non-privileged users always use their token unitId.
  let targetUnitId: string | undefined = unitId ?? undefined;
  if (isPrivilegedUser) {
    const queryUnitId = req.query.unitId ? String(req.query.unitId) : undefined;
    if (queryUnitId === 'all') {
      targetUnitId = undefined;
    } else if (queryUnitId) {
      targetUnitId = queryUnitId;
    }
    // else: no query param → falls through to token unitId (may be undefined for tokenless admins)
  }

  const suggestions = await pengawasanService.suggestAuditSchedules(targetUnitId);
  res.json({ success: true, data: suggestions });
});
