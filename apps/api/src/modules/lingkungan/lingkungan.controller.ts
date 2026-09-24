import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { lingkunganService } from './lingkungan.service';
import {
  createProgramSchema,
  updateProgramSchema,
  createWasteSchema,
  createIndicatorSchema,
  updateIndicatorSchema,
} from './lingkungan.validation';
import { UserRole } from '@prisma/client';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];
function isPrivileged(role?: string): boolean {
  return role ? PRIVILEGED_ROLES.includes(role) : false;
}

function resolveUnitId(req: Request, bodyUnitId?: string): string {
  // Only SUPER_ADMIN can arbitrarily override unitId. UNIT_ADMIN is restricted to their own.
  if (req.user?.role === UserRole.SUPER_ADMIN && bodyUnitId) {
    return bodyUnitId;
  }

  const unitId = req.user?.unitId;
  if (!unitId) {
    // If they have no unitId but are privileged, they must supply one
    if (isPrivileged(req.user?.role) && bodyUnitId) return bodyUnitId;
    throw Errors.badRequest('Unit ID is required');
  }
  return unitId;
}

// Programs
export const listPrograms = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveUnitId(req, req.query.unitId as string);
  const programs = await lingkunganService.getPrograms(unitId, {
    status: req.query.status as string,
    category: req.query.category as string,
  });
  res.json({ success: true, data: programs });
});

export const getProgram = asyncHandler(async (req: Request, res: Response) => {
  const program = await lingkunganService.getProgramById(req.params.id);
  if (!program) throw Errors.notFound('Program not found');
  if (!isPrivileged(req.user?.role) && program.unitId !== req.user?.unitId)
    throw Errors.forbidden('Access denied');
  res.json({ success: true, data: program });
});

export const createProgram = asyncHandler(async (req: Request, res: Response) => {
  const body = createProgramSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  // Zod has validated `body`; cast to the service input (lenient tsconfig widens Zod optionals).
  const program = await lingkunganService.createProgram({ ...body, unitId });
  res.status(201).json({ success: true, data: program });
});

export const updateProgram = asyncHandler(async (req: Request, res: Response) => {
  const existing = await lingkunganService.getProgramById(req.params.id);
  if (!existing) throw Errors.notFound('Program not found');
  if (!isPrivileged(req.user?.role) && existing.unitId !== req.user?.unitId)
    throw Errors.forbidden('Access denied');
  const body = updateProgramSchema.parse(req.body);
  const program = await lingkunganService.updateProgram(req.params.id, body);
  res.json({ success: true, data: program });
});

export const deleteProgram = asyncHandler(async (req: Request, res: Response) => {
  const existing = await lingkunganService.getProgramById(req.params.id);
  if (!existing) throw Errors.notFound('Program not found');
  if (!isPrivileged(req.user?.role) && existing.unitId !== req.user?.unitId)
    throw Errors.forbidden('Access denied');
  await lingkunganService.deleteProgram(req.params.id);
  res.json({ success: true, message: 'Program deleted' });
});

// Waste
export const listWaste = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveUnitId(req, req.query.unitId as string);
  const records = await lingkunganService.getWasteRecords(unitId);
  res.json({ success: true, data: records });
});

export const createWaste = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');
  const body = createWasteSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  const record = await lingkunganService.createWasteRecord({
    ...body,
    unitId,
    recordedById: userId,
  });
  res.status(201).json({ success: true, data: record });
});

export const getWasteSummary = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveUnitId(req, req.query.unitId as string);
  const summary = await lingkunganService.getWasteSummary(unitId);
  res.json({ success: true, data: summary });
});

// Indicators
export const listIndicators = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveUnitId(req, req.query.unitId as string);
  const indicators = await lingkunganService.getIndicators(unitId);
  res.json({ success: true, data: indicators });
});

export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const body = createIndicatorSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  const indicator = await lingkunganService.createIndicator({ ...body, unitId });
  res.status(201).json({ success: true, data: indicator });
});

export const updateIndicator = asyncHandler(async (req: Request, res: Response) => {
  const body = updateIndicatorSchema.parse(req.body);
  const indicator = await lingkunganService.updateIndicator(req.params.id, body);
  res.json({ success: true, data: indicator });
});

export const deleteIndicator = asyncHandler(async (req: Request, res: Response) => {
  await lingkunganService.deleteIndicator(req.params.id);
  res.json({ success: true, message: 'Indicator deleted' });
});
