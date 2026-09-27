import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import type { ScopeActor } from '@/utils/student-scope';
import { dailyReportService } from './daily-report.service';
import type {
  ListDailyReportsQuery,
  CreateDailyReportInput,
  UpdateDailyReportInput,
  ConfirmDailyReportInput,
  BulkCreateDailyReportsInput,
  StudentDailySummaryQuery,
  ClassDailySummaryQuery,
} from './daily-report.schema';

// Bodies and queries arrive parsed by the shared schemas (validate /
// validateQuery on the route); who is asking is the verified token.
const actorOf = (req: Request): ScopeActor => ({
  sub: req.user!.sub,
  roleCode: req.user!.roleCode,
  unitId: req.user!.unitId,
});

// ============================================
// DAILY REPORT CONTROLLERS
// ============================================

/**
 * List daily reports
 * GET /api/daily-report
 */
export const listDailyReports = asyncHandler(async (req: Request, res: Response) => {
  const query = res.locals.validatedQuery as ListDailyReportsQuery;
  const result = await dailyReportService.findAll(query, actorOf(req));

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
  const report = await dailyReportService.findById(req.params.id, actorOf(req));
  res.json({ success: true, data: report });
});

/**
 * Create daily report
 * POST /api/daily-report
 */
export const createDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await dailyReportService.create(req.body as CreateDailyReportInput, actorOf(req));
  res.status(201).json({ success: true, data: report });
});

/**
 * Bulk create daily reports
 * POST /api/daily-report/bulk
 */
export const bulkCreateDailyReports = asyncHandler(async (req: Request, res: Response) => {
  const result = await dailyReportService.bulkCreate(
    req.body as BulkCreateDailyReportsInput,
    actorOf(req)
  );
  res.status(201).json({ success: true, data: result });
});

/**
 * Update daily report
 * PUT /api/daily-report/:id
 */
export const updateDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await dailyReportService.update(
    req.params.id,
    req.body as UpdateDailyReportInput,
    actorOf(req)
  );
  res.json({ success: true, data: report });
});

/**
 * Delete daily report
 * DELETE /api/daily-report/:id
 */
export const deleteDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const result = await dailyReportService.delete(req.params.id, actorOf(req));
  res.json({ success: true, data: result });
});

/**
 * Parent confirms daily report
 * POST /api/daily-report/:id/confirm
 */
export const confirmDailyReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await dailyReportService.confirmByParent(
    req.params.id,
    req.body as ConfirmDailyReportInput,
    actorOf(req)
  );
  res.json({ success: true, data: report });
});

/**
 * Get student monthly summary
 * GET /api/daily-report/summary/student
 */
export const getStudentMonthlySummary = asyncHandler(async (req: Request, res: Response) => {
  const query = res.locals.validatedQuery as StudentDailySummaryQuery;
  const summary = await dailyReportService.getStudentMonthlySummary(query, actorOf(req));
  res.json({ success: true, data: summary });
});

/**
 * Get class daily summary
 * GET /api/daily-report/summary/class
 */
export const getClassDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const query = res.locals.validatedQuery as ClassDailySummaryQuery;
  const summary = await dailyReportService.getClassDailySummary(query, actorOf(req));
  res.json({ success: true, data: summary });
});
