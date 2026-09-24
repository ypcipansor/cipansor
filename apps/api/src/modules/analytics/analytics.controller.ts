import { Request, Response, NextFunction } from 'express';
import * as service from './analytics.service';
import { getGRCStats as getGRCStatsService } from './grc-analytics.service';
import { getParentEngagement as getParentEngagementService } from './parent-engagement.service';
import { getRiskMatrix as getRiskMatrixService } from './grc-analytics.service';
import type {
  ApiResponse,
  DashboardSummary,
  StudentStatistics,
  TahfidzProgress,
  FinanceReport,
  AnalyticsAttendanceSummary,
  AcademicPerformance,
  GRCStats,
  ParentEngagementStats,
} from '@cipansor/shared';

export async function getDashboardStats(
  req: Request,
  res: Response<ApiResponse<DashboardSummary>>,
  next: NextFunction
) {
  try {
    const { unitId } = req.query;
    const stats = await service.getDashboardStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getStudentStats(
  req: Request,
  res: Response<ApiResponse<StudentStatistics>>,
  next: NextFunction
) {
  try {
    const { unitId } = req.query;
    const stats = await service.getStudentStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getTahfidzStats(
  req: Request,
  res: Response<ApiResponse<TahfidzProgress>>,
  next: NextFunction
) {
  try {
    const { unitId, startDate, endDate } = req.query;
    const stats = await service.getTahfidzStats(unitId as string | undefined, {
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getFinanceStats(
  req: Request,
  res: Response<ApiResponse<FinanceReport>>,
  next: NextFunction
) {
  try {
    const { unitId, startDate, endDate } = req.query;
    const stats = await service.getFinanceStats(unitId as string | undefined, {
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceStats(
  req: Request,
  res: Response<ApiResponse<AnalyticsAttendanceSummary>>,
  next: NextFunction
) {
  try {
    const { unitId, startDate, endDate } = req.query;
    const stats = await service.getAttendanceStats(unitId as string | undefined, {
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getAcademicStats(
  req: Request,
  res: Response<ApiResponse<AcademicPerformance>>,
  next: NextFunction
) {
  try {
    const { unitId } = req.query;
    const stats = await service.getAcademicStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getLibraryStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const stats = await service.getLibraryStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getPSBStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const stats = await service.getPSBStats(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getGRCStats(
  req: Request,
  res: Response<ApiResponse<GRCStats>>,
  next: NextFunction
) {
  try {
    const { unitId } = req.query;
    const stats = await getGRCStatsService(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getRiskMatrix(req: Request, res: Response, next: NextFunction) {
  try {
    const { unitId } = req.query;
    const matrix = await getRiskMatrixService(unitId as string | undefined);
    res.json({ success: true, data: matrix });
  } catch (error) {
    next(error);
  }
}

export async function getParentEngagementStats(
  req: Request,
  res: Response<ApiResponse<ParentEngagementStats>>,
  next: NextFunction
) {
  try {
    const { unitId } = req.query;
    const stats = await getParentEngagementService(unitId as string | undefined);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}
