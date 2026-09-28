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
import { assertReachesUnit, listUnitScope, writeUnitScope } from '@/utils/resolve-unit-id';

// Which units a request reaches is one rule, in resolve-unit-id.ts: the
// yayasan's organs oversee every unit, everyone else their own.

export const listCompliances = asyncHandler(async (req: Request, res: Response) => {
  const targetUnitId = listUnitScope(req);

  const query = listComplianceQuerySchema.parse({
    category: req.query.category,
    status: req.query.status,
  });

  const compliances = await syariahService.getCompliances(targetUnitId, query);
  res.json({ success: true, data: compliances });
});

export const getCompliance = asyncHandler(async (req: Request, res: Response) => {
  const compliance = await syariahService.getComplianceById(req.params.id as string);
  assertReachesUnit(req, compliance?.unitId, 'Compliance item');
  res.json({ success: true, data: compliance });
});

export const createCompliance = asyncHandler(async (req: Request, res: Response) => {
  const body = createComplianceSchema.parse(req.body);
  const targetUnitId = writeUnitScope(req, body.unitId);

  const compliance = await syariahService.createCompliance({ ...body, unitId: targetUnitId });
  res.status(201).json({ success: true, data: compliance });
});

export const updateCompliance = asyncHandler(async (req: Request, res: Response) => {
  const existing = await syariahService.getComplianceById(req.params.id as string);
  assertReachesUnit(req, existing?.unitId, 'Compliance item');

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
  assertReachesUnit(req, existing?.unitId, 'Compliance item');
  await syariahService.deleteCompliance(req.params.id as string);
  res.json({ success: true, message: 'Compliance item deleted' });
});

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createShariaAuditSchema.parse(req.body);
  const compliance = await syariahService.getComplianceById(body.complianceId);
  assertReachesUnit(req, compliance?.unitId, 'Compliance item');
  const audit = await syariahService.createShariaAudit({ ...body, auditorId: userId });
  res.status(201).json({ success: true, data: audit });
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await syariahService.getComplianceSummary(listUnitScope(req));
  res.json({ success: true, data: summary });
});
