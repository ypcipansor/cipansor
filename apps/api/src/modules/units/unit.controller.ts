import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { unitService } from './unit.service';
import { ListUnitsQuery, CreateUnitInput, UpdateUnitInput } from './unit.schema';

/**
 * List units
 * GET /api/units
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListUnitsQuery;
  const result = await unitService.findAll(query, {
    role: req.user!.role,
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.units,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Get unit by ID
 * GET /api/units/:id
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const unit = await unitService.findById(id);

  res.json({
    success: true,
    data: unit,
  });
});

/**
 * Create unit
 * POST /api/units
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const input: CreateUnitInput = req.body;
  const unit = await unitService.create(input, req.user?.sub);

  res.status(201).json({
    success: true,
    data: unit,
  });
});

/**
 * What the unit's profile counts
 * GET /api/units/:id/summary
 */
export const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await unitService.summary(req.params.id, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.json({ success: true, data });
});

/**
 * Update unit
 * PATCH /api/units/:id
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdateUnitInput = req.body;
  const unit = await unitService.update(id, input, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
    sub: req.user!.sub,
  });

  res.json({
    success: true,
    data: unit,
  });
});

/**
 * Delete unit
 * DELETE /api/units/:id
 */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await unitService.delete(id);

  res.json({
    success: true,
    data: result,
  });
});
