import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { syariahService } from './syariah.service';
import {
  createComplianceSchema,
  updateComplianceSchema,
  createShariaAuditSchema,
  listComplianceQuerySchema,
} from './syariah.validation';
import { UserRole } from '@prisma/client';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];

function isPrivileged(role?: string): boolean {
  return role ? PRIVILEGED_ROLES.includes(role) : false;
}

export const listCompliances = asyncHandler(async (req: Request, res: Response) => {
  const unitId = req.user?.unitId;
  const isPrivilegedUser = isPrivileged(req.user?.role as UserRole);
  if (!unitId && !isPrivilegedUser) throw Errors.unauthorized('Unit ID required');
  const targetUnitId =
    isPrivilegedUser && req.query.unitId ? String(req.query.unitId) : (unitId ?? undefined);
  // A global SUPER_ADMIN (no assigned unit) gets the cross-unit view
  if (!targetUnitId && req.user?.role !== UserRole.SUPER_ADMIN) {
    throw Errors.badRequest('Unit ID required');
  }

  const query = listComplianceQuerySchema.parse({
    category: req.query.category,
    status: req.query.status,
  });

  const compliances = await syariahService.getCompliances(targetUnitId, query);
  res.json({ success: true, data: compliances });
});

export const getCompliance = asyncHandler(async (req: Request, res: Response) => {
  const compliance = await syariahService.getComplianceById(req.params.id as string);
  if (!compliance) throw Errors.notFound('Compliance item not found');
  if (!isPrivileged(req.user?.role as UserRole) && compliance.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }
  res.json({ success: true, data: compliance });
});

export const createCompliance = asyncHandler(async (req: Request, res: Response) => {
  const body = createComplianceSchema.parse(req.body);
  let targetUnitId = req.user?.unitId;
  if (!targetUnitId) {
    if (isPrivileged(req.user?.role as UserRole) && body.unitId) targetUnitId = body.unitId;
    else throw Errors.badRequest('Unit ID is required');
  }

  const compliance = await syariahService.createCompliance({ ...body, unitId: targetUnitId });
  res.status(201).json({ success: true, data: compliance });
});

export const updateCompliance = asyncHandler(async (req: Request, res: Response) => {
  const existing = await syariahService.getComplianceById(req.params.id as string);
  if (!existing) throw Errors.notFound('Compliance item not found');
  if (!isPrivileged(req.user?.role as UserRole) && existing.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }

  const body = updateComplianceSchema.parse(req.body);
  const compliance = await syariahService.updateCompliance(
    req.params.id as string,
    body,
    req.user?.sub
  );
  res.json({ success: true, data: compliance });
});

export const deleteCompliance = asyncHandler(async (req: Request, res: Response) => {
  const existing = await syariahService.getComplianceById(req.params.id as string);
  if (!existing) throw Errors.notFound('Compliance item not found');
  if (!isPrivileged(req.user?.role as UserRole) && existing.unitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }
  await syariahService.deleteCompliance(req.params.id as string);
  res.json({ success: true, message: 'Compliance item deleted' });
});

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createShariaAuditSchema.parse(req.body);
  const audit = await syariahService.createShariaAudit({ ...body, auditorId: userId });
  res.status(201).json({ success: true, data: audit });
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const unitId = req.user?.unitId;
  const isPrivilegedUser = isPrivileged(req.user?.role as UserRole);
  if (!unitId && !isPrivilegedUser) throw Errors.unauthorized('Unit ID required');
  const targetUnitId =
    isPrivilegedUser && req.query.unitId ? String(req.query.unitId) : (unitId ?? undefined);
  // A global SUPER_ADMIN (no assigned unit) gets the cross-unit view
  if (!targetUnitId && req.user?.role !== UserRole.SUPER_ADMIN) {
    throw Errors.badRequest('Unit ID required');
  }

  const summary = await syariahService.getComplianceSummary(targetUnitId);
  res.json({ success: true, data: summary });
});
