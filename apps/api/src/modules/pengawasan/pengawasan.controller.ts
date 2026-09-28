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
import { assertReachesUnit, listUnitScope, writeUnitScope } from '@/utils/resolve-unit-id';

// Which units a request reaches is one rule, in resolve-unit-id.ts: the
// yayasan's organs oversee every unit, everyone else their own.

// ==================== AUDITS ====================

export const listAudits = asyncHandler(async (req: Request, res: Response) => {
  const unitId = listUnitScope(req);
  const query = listAuditQuerySchema.parse({
    status: req.query.status,
    auditType: req.query.auditType,
  });

  const audits = await pengawasanService.getAudits(unitId, query);
  res.json({ success: true, data: audits });
});

export const getAudit = asyncHandler(async (req: Request, res: Response) => {
  const audit = await pengawasanService.getAuditById(req.params.id);
  assertReachesUnit(req, audit?.unitId ?? null, 'Audit');

  res.json({ success: true, data: audit });
});

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createAuditSchema.parse(req.body);
  const targetUnitId = writeUnitScope(req, body.unitId);

  const audit = await pengawasanService.createAudit({
    ...body,
    unitId: targetUnitId,
    leadAuditorId: userId,
  });

  res.status(201).json({ success: true, data: audit });
});

export const updateAudit = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.auditUnitId(req.params.id), 'Audit');

  const body = updateAuditSchema.parse(req.body);
  const updateData: any = { ...body };
  if (body.plannedDate) updateData.plannedDate = new Date(body.plannedDate);
  if (body.executedDate) updateData.executedDate = new Date(body.executedDate);
  if (body.completedDate) updateData.completedDate = new Date(body.completedDate);

  const audit = await pengawasanService.updateAudit(req.params.id, updateData);
  res.json({ success: true, data: audit });
});

export const deleteAudit = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.auditUnitId(req.params.id), 'Audit');

  await pengawasanService.deleteAudit(req.params.id);
  res.json({ success: true, message: 'Audit deleted' });
});

// ==================== FINDINGS ====================

export const createFinding = asyncHandler(async (req: Request, res: Response) => {
  const body = createFindingSchema.parse(req.body);
  assertReachesUnit(req, await pengawasanService.auditUnitId(body.auditId), 'Audit');
  const finding = await pengawasanService.createFinding(body);
  res.status(201).json({ success: true, data: finding });
});

export const updateFinding = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.findingUnitId(req.params.id), 'Finding');
  const body = updateFindingSchema.parse(req.body);
  const finding = await pengawasanService.updateFinding(req.params.id, body);
  res.json({ success: true, data: finding });
});

export const deleteFinding = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.findingUnitId(req.params.id), 'Finding');
  await pengawasanService.deleteFinding(req.params.id);
  res.json({ success: true, message: 'Finding deleted' });
});

// ==================== FOLLOW-UPS ====================

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const body = createFollowUpSchema.parse(req.body);
  assertReachesUnit(req, await pengawasanService.findingUnitId(body.findingId), 'Finding');
  const followUp = await pengawasanService.createFollowUp(body);
  res.status(201).json({ success: true, data: followUp });
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.followUpUnitId(req.params.id), 'Follow-up');
  const body = updateFollowUpSchema.parse(req.body);
  const followUp = await pengawasanService.updateFollowUp(req.params.id, body, req.user?.sub);
  res.json({ success: true, data: followUp });
});

export const deleteFollowUp = asyncHandler(async (req: Request, res: Response) => {
  assertReachesUnit(req, await pengawasanService.followUpUnitId(req.params.id), 'Follow-up');
  await pengawasanService.deleteFollowUp(req.params.id);
  res.json({ success: true, message: 'Follow-up deleted' });
});

// ==================== SUGGESTIONS ====================

export const getAuditSuggestions = asyncHandler(async (req: Request, res: Response) => {
  // `?unitId=all`, or none, is every unit for the yayasan's organs.
  const suggestions = await pengawasanService.suggestAuditSchedules(listUnitScope(req));
  res.json({ success: true, data: suggestions });
});
