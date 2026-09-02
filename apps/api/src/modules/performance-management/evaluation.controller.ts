import { Request, Response } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { isAdminRoleCode } from '@/middleware/auth';
import { pkService } from './pk.service';
import { evaluationService } from './evaluation.service';
import {
  createEvaluationSchema,
  updateIndicatorRealizationSchema,
  updateBehaviorScoreSchema,
  createBehavioralValueSchema,
  updateBehavioralValueSchema,
  approveEvaluationSchema,
} from './evaluation.validation';

function caller(req: Request): { id: string; isAdmin: boolean } {
  const id = req.user?.sub;
  if (!id) throw Errors.unauthorized();
  return { id, isAdmin: isAdminRoleCode(req.user?.roleCode ?? '') };
}

// ==================== EVALUATIONS ====================

export const createEvaluation = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = createEvaluationSchema.parse(req.body);
  const evaluation = await evaluationService.createEvaluation(id, isAdmin, body);
  res.status(201).json(ApiResponse.success(evaluation));
});

export const getEvaluation = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const evaluation = await evaluationService.getEvaluationById(req.params.id);
  if (!evaluation) throw Errors.notFound('Evaluation');
  pkService.assertAccess(evaluation.pk, id, isAdmin);
  res.json(ApiResponse.success(evaluation));
});

export const updateIndicatorRealization = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = updateIndicatorRealizationSchema.parse(req.body);
  const detail = await evaluationService.updateIndicatorRealization(
    req.params.id,
    body.indicatorId,
    id,
    isAdmin,
    { realization: body.realization, activities: body.activities }
  );
  res.json(ApiResponse.success(detail));
});

export const updateBehaviorScore = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = updateBehaviorScoreSchema.parse(req.body);
  const detail = await evaluationService.updateBehaviorScore(
    req.params.id,
    body.behaviorValueId,
    id,
    isAdmin,
    { score: body.score, notes: body.notes }
  );
  res.json(ApiResponse.success(detail));
});

export const approveEvaluation = asyncHandler(async (req: Request, res: Response) => {
  const { id, isAdmin } = caller(req);
  const body = approveEvaluationSchema.parse(req.body || {});
  const evaluation = await evaluationService.approveEvaluation(req.params.id, id, isAdmin, body.feedback);
  res.json(ApiResponse.success(evaluation));
});

// ==================== BEHAVIORAL VALUES (ADMIN) ====================

export const listBehavioralValues = asyncHandler(async (_req: Request, res: Response) => {
  const values = await evaluationService.getBehavioralValues();
  res.json(ApiResponse.success(values));
});

export const createBehavioralValue = asyncHandler(async (req: Request, res: Response) => {
  const body = createBehavioralValueSchema.parse(req.body);
  const value = await evaluationService.createBehavioralValue(body);
  res.status(201).json(ApiResponse.success(value));
});

export const updateBehavioralValue = asyncHandler(async (req: Request, res: Response) => {
  const body = updateBehavioralValueSchema.parse(req.body);
  const value = await evaluationService.updateBehavioralValue(req.params.id, body);
  res.json(ApiResponse.success(value));
});

export const deleteBehavioralValue = asyncHandler(async (req: Request, res: Response) => {
  await evaluationService.deleteBehavioralValue(req.params.id);
  res.json(ApiResponse.success(null, 'Value deactivated'));
});
