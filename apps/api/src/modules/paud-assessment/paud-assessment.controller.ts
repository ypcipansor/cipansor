import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { paudAssessmentService } from './paud-assessment.service';
import {
  CreatePAUDIndicatorInput,
  UpdatePAUDIndicatorInput,
  CreatePAUDAssessmentInput,
  UpdatePAUDAssessmentInput,
  BulkCreatePAUDAssessmentInput,
  CreatePAUDEvidenceInput,
  CreatePAUDNarrativeReportInput,
  UpdatePAUDNarrativeReportInput,
  FinalizePAUDReportInput,
} from '@cipansor/shared';
import type {
  ListIndicatorsQuery,
  ListAssessmentsQuery,
  ListNarrativeReportsQuery,
  AssessmentSummaryQuery,
  ClassSummaryQuery,
  BulkCreateClassPAUDAssessmentInput,
} from './paud-assessment.schema';

// ============================================
// INDICATOR CONTROLLERS
// ============================================

/**
 * List PAUD development indicators
 * GET /api/paud-assessment/indicators
 */
export const listIndicators = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListIndicatorsQuery;
  const result = await paudAssessmentService.findAllIndicators(query, {
    role: req.user!.role,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.indicators,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Get indicator by ID
 * GET /api/paud-assessment/indicators/:id
 */
export const getIndicatorById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const indicator = await paudAssessmentService.findIndicatorById(id);

  res.json({
    success: true,
    data: indicator,
  });
});

/**
 * Create indicator
 * POST /api/paud-assessment/indicators
 */
export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const input: CreatePAUDIndicatorInput = req.body;
  const indicator = await paudAssessmentService.createIndicator(input);

  res.status(201).json({
    success: true,
    data: indicator,
  });
});

/**
 * Update indicator
 * PUT /api/paud-assessment/indicators/:id
 */
export const updateIndicator = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdatePAUDIndicatorInput = req.body;
  const indicator = await paudAssessmentService.updateIndicator(id, input);

  res.json({
    success: true,
    data: indicator,
  });
});

/**
 * Delete indicator
 * DELETE /api/paud-assessment/indicators/:id
 */
export const deleteIndicator = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await paudAssessmentService.deleteIndicator(id);

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// ASSESSMENT CONTROLLERS
// ============================================

/**
 * List assessments
 * GET /api/paud-assessment/assessments
 */
export const listAssessments = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListAssessmentsQuery;
  const result = await paudAssessmentService.findAllAssessments(query, {
    role: req.user!.role,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.assessments,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Get assessment by ID
 * GET /api/paud-assessment/assessments/:id
 */
export const getAssessmentById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const assessment = await paudAssessmentService.findAssessmentById(id);

  res.json({
    success: true,
    data: assessment,
  });
});

/**
 * Create assessment
 * POST /api/paud-assessment/assessments
 */
export const createAssessment = asyncHandler(async (req: Request, res: Response) => {
  const input: CreatePAUDAssessmentInput = req.body;
  const assessment = await paudAssessmentService.createAssessment(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: assessment,
  });
});

/**
 * Bulk create assessments
 * POST /api/paud-assessment/assessments/bulk
 */
export const bulkCreateAssessments = asyncHandler(async (req: Request, res: Response) => {
  const input: BulkCreatePAUDAssessmentInput = req.body;
  const result = await paudAssessmentService.bulkCreateAssessments(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * Create assessments for a class (Bulk)
 * POST /api/paud-assessment/assessments/class
 */
export const createClassAssessment = asyncHandler(async (req: Request, res: Response) => {
  const input: BulkCreateClassPAUDAssessmentInput = req.body;
  const result = await paudAssessmentService.createClassAssessment(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * Update assessment
 * PUT /api/paud-assessment/assessments/:id
 */
export const updateAssessment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdatePAUDAssessmentInput = req.body;
  const assessment = await paudAssessmentService.updateAssessment(id, input);

  res.json({
    success: true,
    data: assessment,
  });
});

/**
 * Delete assessment
 * DELETE /api/paud-assessment/assessments/:id
 */
export const deleteAssessment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await paudAssessmentService.deleteAssessment(id);

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// EVIDENCE CONTROLLERS
// ============================================

/**
 * Create evidence
 * POST /api/paud-assessment/evidences
 */
export const createEvidence = asyncHandler(async (req: Request, res: Response) => {
  const input: CreatePAUDEvidenceInput = req.body;
  const evidence = await paudAssessmentService.createEvidence(input, req.user?.sub);

  res.status(201).json({
    success: true,
    data: evidence,
  });
});

/**
 * Delete evidence
 * DELETE /api/paud-assessment/evidences/:id
 */
export const deleteEvidence = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await paudAssessmentService.deleteEvidence(id);

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// NARRATIVE REPORT CONTROLLERS
// ============================================

/**
 * List narrative reports
 * GET /api/paud-assessment/reports
 */
export const listNarrativeReports = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListNarrativeReportsQuery;
  const result = await paudAssessmentService.findAllNarrativeReports(query, {
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
 * Get narrative report by ID
 * GET /api/paud-assessment/reports/:id
 */
export const getNarrativeReportById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const report = await paudAssessmentService.findNarrativeReportById(id);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Create narrative report
 * POST /api/paud-assessment/reports
 */
export const createNarrativeReport = asyncHandler(async (req: Request, res: Response) => {
  const input: CreatePAUDNarrativeReportInput = req.body;
  const report = await paudAssessmentService.createNarrativeReport(input, req.user!.sub);

  res.status(201).json({
    success: true,
    data: report,
  });
});

/**
 * Update narrative report
 * PUT /api/paud-assessment/reports/:id
 */
export const updateNarrativeReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdatePAUDNarrativeReportInput = req.body;
  const report = await paudAssessmentService.updateNarrativeReport(id, input);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Finalize narrative report
 * POST /api/paud-assessment/reports/:id/finalize
 */
export const finalizeNarrativeReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: FinalizePAUDReportInput = req.body;
  const report = await paudAssessmentService.finalizeNarrativeReport(id, input);

  res.json({
    success: true,
    data: report,
  });
});

/**
 * Delete narrative report
 * DELETE /api/paud-assessment/reports/:id
 */
export const deleteNarrativeReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await paudAssessmentService.deleteNarrativeReport(id);

  res.json({
    success: true,
    data: result,
  });
});

// ============================================
// SUMMARY CONTROLLERS
// ============================================

/**
 * Get student assessment summary
 * GET /api/paud-assessment/summary/student
 */
export const getStudentSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as AssessmentSummaryQuery;
  const summary = await paudAssessmentService.getStudentAssessmentSummary(query);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * Get class/unit summary
 * GET /api/paud-assessment/summary/class
 */
export const getClassSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ClassSummaryQuery;
  const summary = await paudAssessmentService.getClassSummary(query);

  res.json({
    success: true,
    data: summary,
  });
});
