import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { riskService } from './risk.service';
import {
  createRiskSchema,
  updateRiskSchema,
  createMitigationSchema,
  updateMitigationSchema,
  listRiskQuerySchema,
} from './risk.validation';
import { Prisma } from '@prisma/client';
import { assertReachesUnit, listUnitScope, writeUnitScope } from '@/utils/resolve-unit-id';

// Which units a request reaches is one rule, in resolve-unit-id.ts: the
// yayasan's organs oversee every unit, everyone else their own.

export const listRisks = asyncHandler(async (req: Request, res: Response) => {
  const unitId = listUnitScope(req);

  // Validate query parameters to prevent 500 errors on invalid enums
  const query = listRiskQuerySchema.parse({
    category: req.query.category,
    riskLevel: req.query.riskLevel,
    strategicPlanId: req.query.strategicPlanId,
    unitId,
  });

  const risks = await riskService.getRisks(unitId, query);
  res.json({ success: true, data: risks });
});

export const getRisk = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const risk = await riskService.getRiskById(id);

  assertReachesUnit(req, risk?.unitId, 'Risk');

  res.json({ success: true, data: risk });
});

export const createRisk = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createRiskSchema.parse(req.body);
  const targetUnitId = writeUnitScope(req, body.unitId);

  // Destructure to remove unitId and strategicPlanId from spread
  // to explicitly use relation connect syntax for consistency
  const { unitId: _, strategicPlanId, ...rest } = body;

  const risk = await riskService.createRisk({
    ...rest,
    unit: { connect: { id: targetUnitId } },
    createdBy: { connect: { id: userId } },
    ...(strategicPlanId ? { strategicPlan: { connect: { id: strategicPlanId } } } : {}),
  } as Prisma.RiskCreateInput);

  res.status(201).json({ success: true, data: risk });
});

export const updateRisk = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existingRisk = await riskService.getRiskById(id);
  assertReachesUnit(req, existingRisk?.unitId, 'Risk');

  const body = updateRiskSchema.parse(req.body);

  // Destructure unitId to prevent unauthorized modification of the risk's unit
  // Also destructure strategicPlanId to handle connect syntax properly if provided
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unitId: _, strategicPlanId, ...updateData } = body;

  const risk = await riskService.updateRisk(id, {
    ...updateData,
    ...(strategicPlanId !== undefined
      ? {
          strategicPlan: strategicPlanId
            ? { connect: { id: strategicPlanId } }
            : { disconnect: true },
        }
      : {}),
  });
  res.json({ success: true, data: risk });
});

export const deleteRisk = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existingRisk = await riskService.getRiskById(id);
  assertReachesUnit(req, existingRisk?.unitId, 'Risk');

  await riskService.deleteRisk(id);
  res.json({ success: true, message: 'Risk deleted' });
});

// Mitigations
export const addMitigation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createMitigationSchema.parse(req.body);
  const { picId, riskId, ...rest } = body;

  // Verify Risk Ownership
  const risk = await riskService.getRiskById(riskId);
  assertReachesUnit(req, risk?.unitId, 'Risk');

  const mitigation = await riskService.createMitigation({
    ...rest,
    risk: { connect: { id: riskId } },
    createdBy: { connect: { id: userId } },
    pic: picId ? { connect: { id: picId } } : undefined,
  } as Prisma.RiskMitigationCreateInput);

  res.status(201).json({ success: true, data: mitigation });
});

export const updateMitigation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify Mitigation Ownership via Risk
  const existingMitigation = await riskService.getMitigationById(id);
  assertReachesUnit(req, existingMitigation?.risk.unitId, 'Mitigation');

  const body = updateMitigationSchema.parse(req.body);
  const { picId, ...rest } = body;

  const data: any = { ...rest };
  if (picId) {
    data.pic = { connect: { id: picId } };
  } else if (picId === null) {
    // Explicitly null means disconnect
    data.pic = { disconnect: true };
  }

  const mitigation = await riskService.updateMitigation(id, data);

  res.json({ success: true, data: mitigation });
});

export const deleteMitigation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify Mitigation Ownership via Risk
  const existingMitigation = await riskService.getMitigationById(id);
  assertReachesUnit(req, existingMitigation?.risk.unitId, 'Mitigation');

  await riskService.deleteMitigation(id);
  res.json({ success: true, message: 'Mitigation deleted' });
});
