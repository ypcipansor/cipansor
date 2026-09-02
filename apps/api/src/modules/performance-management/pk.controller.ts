import { Request, Response } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { isAdminRoleCode } from '@/middleware/auth';
import { pkService } from './pk.service';
import {
  createPKSchema,
  updatePKSchema,
  rejectPKSchema,
  createPKIndicatorSchema,
  updatePKIndicatorSchema,
} from './pk.validation';

function caller(req: Request): {
  id: string;
  isAdmin: boolean;
  roleCode?: string;
  unitId?: string | null;
} {
  const id = req.user?.sub;
  if (!id) throw Errors.unauthorized();
  return {
    id,
    isAdmin: isAdminRoleCode(req.user?.roleCode ?? ''),
    roleCode: req.user?.roleCode,
    unitId: req.user?.unitId ?? null,
  };
}

export const listSupervisors = asyncHandler(async (req: Request, res: Response) => {
  const supervisors = await pkService.getSupervisors(req.user);
  res.json(ApiResponse.success(supervisors));
});

export const listPKs = asyncHandler(async (req: Request, res: Response) => {
  const { id } = caller(req);
  const pks = await pkService.getPKs(id, { status: req.query.status as string });
  res.json(ApiResponse.success(pks));
});

export const getPK = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const pk = await pkService.getPKById(req.params.id);
  if (!pk) throw Errors.notFound('PK');
  pkService.assertAccess(pk, id, isAdmin);
  res.json(ApiResponse.success(pk));
});

export const createPK = asyncHandler(async (req: Request, res: Response) => {
  const { id } = caller(req);
  const body = createPKSchema.parse(req.body);
  // A PK always belongs to the caller; supervisors get their own.
  const pk = await pkService.createPK({ ...body, userId: id });
  res.status(201).json(ApiResponse.success(pk));
});

export const updatePK = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = updatePKSchema.parse(req.body);
  const pk = await pkService.updatePK(req.params.id, id, isAdmin, body);
  res.json(ApiResponse.success(pk));
});

export const deletePK = asyncHandler(async (req: Request, res: Response) => {
  const user = caller(req);
  await pkService.deletePK(req.params.id, user);
  res.json(ApiResponse.success(null, 'Performance agreement deleted'));
});

export const proposePK = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const pk = await pkService.proposePK(req.params.id, id, isAdmin);
  res.json(ApiResponse.success(pk));
});

export const approvePK = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const pk = await pkService.approvePK(req.params.id, id, isAdmin);
  res.json(ApiResponse.success(pk));
});

export const rejectPK = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = rejectPKSchema.parse(req.body);
  const pk = await pkService.rejectPK(req.params.id, id, isAdmin, body.revisionNotes);
  res.json(ApiResponse.success(pk));
});

// ==================== INDICATORS ====================

export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = createPKIndicatorSchema.parse(req.body);
  const indicator = await pkService.createIndicator(id, isAdmin, body);
  res.status(201).json(ApiResponse.success(indicator));
});

export const updateIndicator = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = updatePKIndicatorSchema.parse(req.body);
  const indicator = await pkService.updateIndicator(req.params.id, id, isAdmin, body);
  res.json(ApiResponse.success(indicator));
});

export const deleteIndicator = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  await pkService.deleteIndicator(req.params.id, id, isAdmin);
  res.json(ApiResponse.success(null, 'Indicator deleted'));
});
