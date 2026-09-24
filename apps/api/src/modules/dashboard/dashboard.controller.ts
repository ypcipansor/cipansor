import { requireUser, findTeacherIdForUser } from '@/middleware/auth';
/**
 * Dashboard Controller (Refactored)
 * Uses Dashboard Service for business logic
 * Follows layered architecture pattern
 */

import { Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { logger } from '@/lib/logger';
import { ApiError, ErrorCode } from '@/middleware/error';
import {
  dashboardStatsQuerySchema,
  dashboardMetricsQuerySchema,
  attendanceStatsQuerySchema,
  financeStatsQuerySchema,
  tahfidzStatsQuerySchema,
  violationRewardStatsQuerySchema,
} from './dashboard.schema';

/**
 * Helper to extract context from request
 */
function getContext(req: Request) {
  const user = requireUser(req);
  return {
    userId: user?.id,
    unitId: typeof req.query.unitId === 'string' ? req.query.unitId : undefined,
    role: user?.role,
  };
}

/**
 * Verify user has access to the requested unit
 */
function verifyUnitAccess(req: Request, unitId?: string): boolean {
  if (!unitId) return true;

  const user = requireUser(req);
  return user?.unitId === unitId || user?.role === 'SUPER_ADMIN';
}

/**
 * Get current dashboard metrics with recent history and active alerts
 * @route GET /api/dashboard/metrics
 */
export async function getDashboardMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = dashboardMetricsQuerySchema.parse(req.query);

    if (!verifyUnitAccess(req, query.unitId)) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'You do not have access to this unit');
    }

    const context = getContext(req);
    context.unitId = query.unitId;

    const result = await dashboardService.getMetrics(context);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get dashboard quick stats (simplified metrics for cards)
 * @route GET /api/dashboard/quick-stats
 */
export async function getQuickStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const context = getContext(req);
    const result = await dashboardService.getQuickStats(context);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get dashboard main stats
 * @route GET /api/dashboard/stats
 */
export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = dashboardStatsQuerySchema.parse(req.query);
    const context = getContext(req);
    context.unitId = query.unitId;

    // Admissions and CBT summaries are management views: registrant PII
    // (recent registrant names) is limited to admin/staff roles, while the
    // aggregate CBT numbers are also useful to teachers. Students/parents
    // get neither.
    const isStaff = ['SUPER_ADMIN', 'UNIT_ADMIN', 'STAFF'].includes(context.role ?? '');
    const seesCBT = isStaff || context.role === 'TEACHER';

    const [result, admissions, cbt] = await Promise.all([
      dashboardService.getStats(context),
      isStaff ? dashboardService.getAdmissionsStats(context) : Promise.resolve(undefined),
      seesCBT ? dashboardService.getCBTSummary(context) : Promise.resolve(undefined),
    ]);

    res.json({
      success: true,
      data: { ...result, ...(admissions ? { admissions } : {}), ...(cbt ? { cbt } : {}) },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get attendance stats
 * @route GET /api/dashboard/attendance
 */
export async function getAttendanceStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = attendanceStatsQuerySchema.parse(req.query);
    const context = getContext(req);
    context.unitId = query.unitId;

    const dateRange = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const result = await dashboardService.getAttendanceStats(context, dateRange);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get finance stats
 * @route GET /api/dashboard/finance
 */
export async function getFinanceStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = financeStatsQuerySchema.parse(req.query);
    const context = getContext(req);
    context.unitId = query.unitId;

    const result = await dashboardService.getFinanceStats(context);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get tahfidz stats with real data
 * @route GET /api/dashboard/tahfidz
 */
export async function getTahfidzStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = tahfidzStatsQuerySchema.parse(req.query);
    const context = getContext(req);
    context.unitId = query.unitId;

    const result = await dashboardService.getTahfidzStats(context, {
      period: query.period,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get violation and reward stats
 * @route GET /api/dashboard/violation-reward
 */
export async function getViolationRewardStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = violationRewardStatsQuerySchema.parse(req.query);
    const context = getContext(req);
    context.unitId = query.unitId;

    const result = await dashboardService.getViolationRewardStats(context, {
      period: query.period,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get the signed-in teacher's own dashboard figures
 * @route GET /api/dashboard/teacher
 *
 * Scoped to the caller by design — there is no teacherId parameter, so one
 * teacher cannot read another's numbers by guessing an id.
 */
export async function getTeacherStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(req);
    const teacherId = await findTeacherIdForUser(user.id);

    if (!teacherId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'This account is not linked to a teacher record');
    }

    const result = await dashboardService.getTeacherStats(teacherId, user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
