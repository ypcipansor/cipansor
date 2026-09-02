import { Request, Response } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { isFoundationScopedRole, isLeadershipRole } from '@/utils/resolve-unit-id';
import { pkAnalyticsService } from './analytics.service';

/** Roles that have cross-cutting or unit-level leadership access to analytics. */
function isLeadershipUser(req: Request): boolean {
  return isLeadershipRole(req.user?.roleCode);
}

/** Roles that have foundation-level (global) access to all units. */
function isFoundationGlobalLeadership(req: Request): boolean {
  return isFoundationScopedRole(req.user?.roleCode);
}

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (!isLeadershipUser(req)) throw Errors.forbidden('Only leadership roles may access analytics');

  const isGlobal = isFoundationGlobalLeadership(req);
  const unitId = isGlobal
    ? (req.query.unitId as string | undefined)
    : (req.user?.unitId ?? undefined);

  if (!isGlobal && !unitId) {
    throw Errors.forbidden('User does not belong to a specific unit and lacks global analytics access');
  }

  const data = await pkAnalyticsService.getUnitPerformanceDashboard(unitId);
  res.json(ApiResponse.success(data));
});

export const getDrilldown = asyncHandler(async (req: Request, res: Response) => {
  if (!isLeadershipUser(req)) throw Errors.forbidden('Only leadership roles may access analytics');

  const isGlobal = isFoundationGlobalLeadership(req);
  const targetUnitId = req.params.unitId;

  if (!isGlobal) {
    if (!req.user?.unitId || req.user.unitId !== targetUnitId) {
      throw Errors.forbidden('Cannot view drilldown scores of another unit');
    }
  }

  const data = await pkAnalyticsService.getUnitDrilldown(targetUnitId);
  res.json(ApiResponse.success(data));
});

import { getConsolidatedReportQuerySchema } from '@cipansor/shared';

export const getConsolidatedReport = asyncHandler(async (req: Request, res: Response) => {
  if (!isLeadershipUser(req)) throw Errors.forbidden('Only leadership roles may access analytics');

  const queryResult = getConsolidatedReportQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    const firstIssue = queryResult.error.errors[0];
    throw Errors.badRequest(firstIssue?.message || 'Invalid query parameters');
  }
  const { month, year } = queryResult.data;

  const isGlobal = isFoundationGlobalLeadership(req);
  const scopedUnitId = isGlobal ? undefined : (req.user?.unitId ?? undefined);
  if (!isGlobal && !scopedUnitId) {
    throw Errors.forbidden('User does not belong to a specific unit and lacks global analytics access');
  }

  const data = await pkAnalyticsService.getConsolidatedReport({ month, year, unitId: scopedUnitId });
  res.json(ApiResponse.success(data));
});
