import { Request, Response } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { isLeadershipRole, seesAllUnits } from '@/utils/resolve-unit-id';
import { pkAnalyticsService } from './analytics.service';

/** Roles that have cross-cutting or unit-level leadership access to analytics. */
function isLeadershipUser(req: Request): boolean {
  return isLeadershipRole(req.user?.roleCode);
}

/**
 * Peran yang melihat seluruh unit.
 *
 * Dulu memakai `isFoundationScopedRole`, yang hanya mencakup pengurus yayasan
 * dan super admin. Akibatnya PESANTREN_PENGASUH dan PESANTREN_DIREKTUR lolos
 * penjaga rute, lalu dipatok ke satu unitId dari JWT-nya — melihat angka SMP IT
 * saja, dilabeli seolah gambaran seluruh yayasan, dan ditolak saat membuka
 * rincian SD IT atau SMA Qur'an yang justru mereka asuh. `seesAllUnits`
 * memasukkan peran lintas unit itu, dan sudah dipakai di pk.service.
 */
function isFoundationGlobalLeadership(req: Request): boolean {
  return seesAllUnits({ roleCode: req.user?.roleCode });
}

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (!isLeadershipUser(req)) throw Errors.forbidden('Only leadership roles may access analytics');

  const isGlobal = isFoundationGlobalLeadership(req);
  // Express 5 mengembalikan ARRAY untuk kunci kueri yang berulang, jadi
  // `?unitId=a&unitId=b` menjadi ['a','b'] dan — dengan sekadar `as string` —
  // masuk ke `where: { id: ['a','b'] }`. Prisma melempar
  // PrismaClientValidationError, yang bukan PrismaClientKnownRequestError,
  // sehingga penangan galat melewatkannya dan pemanggil menerima 500.
  const rawUnitId = req.query.unitId;
  if (rawUnitId !== undefined && typeof rawUnitId !== 'string') {
    throw Errors.badRequest('Parameter unitId hanya boleh disebut sekali');
  }
  const unitId = isGlobal ? rawUnitId : (req.user?.unitId ?? undefined);

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
    const firstIssue = queryResult.error.issues[0];
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
