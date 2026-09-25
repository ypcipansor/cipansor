import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { requireUser } from '@/middleware/auth';
import { ApiResponse } from '@/utils/response';
import * as permitService from './permits.service';
import type { ListPermitsQueryParsed } from './permits.schema';

// Bodies and queries arrive already parsed by validate()/validateQuery() in
// permits.routes.ts; the caller always comes from the verified token.

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = res.locals.validatedQuery as ListPermitsQueryParsed;
  const { data, page, limit, total } = await permitService.listPermits(query, requireUser(req));
  res.json(ApiResponse.paginated(data, page, limit, total));
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  res.json(ApiResponse.success(await permitService.getSummary(requireUser(req))));
});

export const getByCode = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.getPermitByCode(req.params.code, requireUser(req));
  res.json(ApiResponse.success(permit));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(ApiResponse.success(await permitService.getPermit(req.params.id, requireUser(req))));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.createPermit(req.body, requireUser(req));
  res.status(201).json(ApiResponse.success(permit, 'Izin diajukan'));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.updatePermit(req.params.id, req.body, requireUser(req));
  res.json(ApiResponse.success(permit, 'Izin diperbarui'));
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.approvePermit(req.params.id, requireUser(req));
  res.json(ApiResponse.success(permit, 'Izin disetujui'));
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.rejectPermit(
    req.params.id,
    req.body.rejectionNote,
    requireUser(req)
  );
  res.json(ApiResponse.success(permit, 'Izin ditolak'));
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.cancelPermit(req.params.id, requireUser(req));
  res.json(ApiResponse.success(permit, 'Izin dibatalkan'));
});

export const depart = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.departPermit(req.params.id, requireUser(req));
  res.json(ApiResponse.success(permit, 'Keberangkatan dicatat'));
});

export const markReturned = asyncHandler(async (req: Request, res: Response) => {
  const permit = await permitService.returnPermit(
    req.params.id,
    req.body.returnedAt,
    requireUser(req)
  );
  res.json(ApiResponse.success(permit, 'Kepulangan dicatat'));
});
