import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { dailyReportService } from './daily-report.service';
import type {
  ListDailyReportsQuery,
  StudentDailySummaryQuery,
  ClassDailySummaryQuery,
} from './daily-report.schema';
import type {
  CreateDailyReportInput,
  UpdateDailyReportInput,
  BulkCreateDailyReportsInput,
  DailyMood,
} from '@cipansor/shared';

// Define local helper for ConfirmReportInput as strict typing for partial/null removal
interface ConfirmReportInput {
  isConfirmed: boolean;
  parentFeedback?: string;
}

// Helper to clean nulls to undefined for Prisma compatibility with Shared Types
function cleanInput<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(cleanInput) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        key,
        value === null ? undefined : cleanInput(value),
      ])
    ) as unknown as T;
  }
  return obj;
}

// ============================================
// DAILY REPORT CONTROLLERS
// ============================================

/**
 * List daily reports
 * GET /api/daily-report
 */
export const listDailyReports = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListDailyReportsQuery;
  const result = await dailyReportService.findAll(query, {
    role: req.user!.role,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.reports,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Get daily report by ID
 * GET /api/daily-report/:id
 */
export const getDailyReportById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const report = await dailyReportService.findById(id);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Create daily report
 * POST /api/daily-report
 */
export const createDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const input = cleanInput(req.body) as CreateDailyReportInput;
  const report = await dailyReportService.create(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: report,
  });
});

/**
 * Bulk create daily reports
 * POST /api/daily-report/bulk
 */
export const bulkCreateDailyReports = asyncHandler(async (req: Request, res: Response) => {
  const input = cleanInput(req.body) as BulkCreateDailyReportsInput;
  const result = await dailyReportService.bulkCreate(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * Update daily report
 * PUT /api/daily-report/:id
 */
export const updateDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input = cleanInput(req.body) as UpdateDailyReportInput;
  const report = await dailyReportService.update(id, input, req.user!.sub);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Delete daily report
 * DELETE /api/daily-report/:id
 */
export const deleteDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await dailyReportService.delete(id);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Parent confirms daily report
 * POST /api/daily-report/:id/confirm
 */
export const confirmDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: ConfirmReportInput = req.body;
  // Service expects ConfirmReportInput which has isConfirmed
  const report = await dailyReportService.confirmByParent(id, input, req.user!.sub);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Get student monthly summary
 * GET /api/daily-report/summary/student
 */
export const getStudentMonthlySummary = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as StudentDailySummaryQuery;
  const summary = await dailyReportService.getStudentMonthlySummary(query);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * Get class daily summary
 * GET /api/daily-report/summary/class
 */
export const getClassDailySummary = asyncHandler(async (req: Request, res: Response) => {
  // Extract classId explicitly if it's not in validatedQuery or needs specific handling
  // validation middleware should handle this, but ensures it's passed
  const query = (res.locals.validatedQuery || req.query) as ClassDailySummaryQuery;

  const summary = await dailyReportService.getClassDailySummary(query);

  res.json({
    success: true,
    data: summary,
  });
});
