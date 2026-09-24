import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { talentaService } from './talenta.service';
import {
  createTalentProfileSchema,
  updateTalentProfileSchema,
  createAssessmentSchema,
  createTrainingSchema,
  updateTrainingSchema,
  enrollTrainingSchema,
  createSuccessionSchema,
  updateSuccessionSchema,
} from './talenta.validation';
import { UserRole } from '@prisma/client';

function checkOwnership(req: Request, resourceUnitId: string): void {
  // SUPER_ADMIN can access anything
  if (req.user?.role === UserRole.SUPER_ADMIN) return;

  // Everyone else (including UNIT_ADMIN) is restricted to their own unit
  if (resourceUnitId !== req.user?.unitId) {
    throw Errors.forbidden('Access denied');
  }
}

function resolveUnitId(req: Request, bodyUnitId?: string): string {
  // Only SUPER_ADMIN can arbitrarily override unitId. UNIT_ADMIN is restricted to their own.
  if (req.user?.role === UserRole.SUPER_ADMIN && bodyUnitId) {
    return bodyUnitId;
  }

  // Otherwise default to their assigned unit
  const unitId = req.user?.unitId;
  if (!unitId) {
    throw Errors.badRequest('Unit ID is required');
  }
  return unitId;
}

/**
 * Unit scope for read/list endpoints. A global SUPER_ADMIN (no assigned unit)
 * gets the cross-unit view unless they filter explicitly via ?unitId=;
 * everyone else is pinned to their own unit.
 */
function resolveListUnitId(req: Request, queryUnitId?: string): string | undefined {
  if (req.user?.role === UserRole.SUPER_ADMIN) {
    return queryUnitId || req.user?.unitId || undefined;
  }

  const unitId = req.user?.unitId;
  if (!unitId) {
    throw Errors.badRequest('Unit ID is required');
  }
  return unitId;
}

// ==================== PROFILES ====================

export const listProfiles = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveListUnitId(req, req.query.unitId as string);
  const profiles = await talentaService.getProfiles(unitId, {
    category: req.query.category as string,
  });
  res.json({ success: true, data: profiles });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await talentaService.getProfileById(req.params.id);
  if (!profile) throw Errors.notFound('Talent profile not found');
  checkOwnership(req, profile.unitId);
  res.json({ success: true, data: profile });
});

export const createProfile = asyncHandler(async (req: Request, res: Response) => {
  const body = createTalentProfileSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  const profile = await talentaService.createProfile({
    ...body,
    unitId,
    userId: body.userId as string,
    currentRole: body.currentRole as string,
  });
  res.status(201).json({ success: true, data: profile });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getProfileById(req.params.id);
  if (!existing) throw Errors.notFound('Talent profile not found');
  checkOwnership(req, existing.unitId);
  const body = updateTalentProfileSchema.parse(req.body);
  const profile = await talentaService.updateProfile(req.params.id, body);
  res.json({ success: true, data: profile });
});

export const deleteProfile = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getProfileById(req.params.id);
  if (!existing) throw Errors.notFound('Talent profile not found');
  checkOwnership(req, existing.unitId);
  await talentaService.deleteProfile(req.params.id);
  res.json({ success: true, message: 'Talent profile deleted' });
});

// ==================== ASSESSMENTS ====================

export const createAssessment = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');
  const body = createAssessmentSchema.parse(req.body);
  const assessment = await talentaService.createAssessment({ ...body, assessorId: userId });
  res.status(201).json({ success: true, data: assessment });
});

// ==================== TRAINING ====================

export const listTrainings = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveListUnitId(req, req.query.unitId as string);
  const trainings = await talentaService.getTrainings(unitId, {
    status: req.query.status as string,
  });
  res.json({ success: true, data: trainings });
});

export const getTraining = asyncHandler(async (req: Request, res: Response) => {
  const training = await talentaService.getTrainingById(req.params.id);
  if (!training) throw Errors.notFound('Training program not found');
  checkOwnership(req, training.unitId);
  res.json({ success: true, data: training });
});

export const createTraining = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');
  const body = createTrainingSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  const training = await talentaService.createTraining({ ...body, unitId, createdById: userId });
  res.status(201).json({ success: true, data: training });
});

export const updateTraining = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getTrainingById(req.params.id);
  if (!existing) throw Errors.notFound('Training program not found');
  checkOwnership(req, existing.unitId);

  const body = updateTrainingSchema.parse(req.body);
  const training = await talentaService.updateTraining(req.params.id, body);
  res.json({ success: true, data: training });
});

export const deleteTraining = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getTrainingById(req.params.id);
  if (!existing) throw Errors.notFound('Training program not found');
  checkOwnership(req, existing.unitId);

  await talentaService.deleteTraining(req.params.id);
  res.json({ success: true, message: 'Training program deleted' });
});

export const enrollTraining = asyncHandler(async (req: Request, res: Response) => {
  const body = enrollTrainingSchema.parse(req.body);

  const program = await talentaService.getTrainingById(body.programId);
  if (!program) throw Errors.notFound('Training program not found');
  checkOwnership(req, program.unitId);

  const enrollment = await talentaService.enrollUser(body.programId, body.userId);
  res.status(201).json({ success: true, data: enrollment });
});

// ==================== SUCCESSION ====================

export const listSuccessions = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveListUnitId(req, req.query.unitId as string);
  const successions = await talentaService.getSuccessions(unitId);
  res.json({ success: true, data: successions });
});

export const createSuccession = asyncHandler(async (req: Request, res: Response) => {
  const body = createSuccessionSchema.parse(req.body);
  const unitId = resolveUnitId(req, body.unitId);
  const succession = await talentaService.createSuccession({ ...body, unitId });
  res.status(201).json({ success: true, data: succession });
});

export const updateSuccession = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getSuccessionById(req.params.id);
  if (!existing) throw Errors.notFound('Succession plan not found');
  checkOwnership(req, existing.unitId);

  const body = updateSuccessionSchema.parse(req.body);
  const succession = await talentaService.updateSuccession(req.params.id, body);
  res.json({ success: true, data: succession });
});

export const deleteSuccession = asyncHandler(async (req: Request, res: Response) => {
  const existing = await talentaService.getSuccessionById(req.params.id);
  if (!existing) throw Errors.notFound('Succession plan not found');
  checkOwnership(req, existing.unitId);

  await talentaService.deleteSuccession(req.params.id);
  res.json({ success: true, message: 'Succession plan deleted' });
});

// ==================== SUGGESTIONS ====================

export const suggestSuccessors = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveListUnitId(req, req.query.unitId as string);
  const positionTitle = req.query.positionTitle as string;
  if (!positionTitle) throw Errors.badRequest('positionTitle query parameter is required');
  // The competency component — the only part of the score grounded in recorded
  // assessments — needs a real position to read requirements from. It was
  // never plumbed through, so it scored 0 for every candidate and the UI drew
  // a "Competency Match 0%" bar that had measured nothing.
  const targetPositionId = req.query.targetPositionId as string | undefined;
  const suggestions = await talentaService.suggestSuccessors(
    positionTitle,
    unitId,
    targetPositionId
  );
  res.json({ success: true, data: suggestions });
});

// ==================== ANALYTICS ====================

export const getTalentAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const unitId = resolveListUnitId(req, req.query.unitId as string);
  const analytics = await talentaService.getTalentAnalytics(unitId);
  res.json({ success: true, data: analytics });
});

export const getCompetencyGap = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const targetPositionId = req.query.targetPositionId as string | undefined;

  // Verify unit-level access before returning competency data
  const profile = await talentaService.getProfileByUserId(userId);
  if (!profile) throw Errors.notFound('Talent profile not found');
  checkOwnership(req, profile.unitId);

  const result = await talentaService.getCompetencyGap(userId, targetPositionId);
  res.json({ success: true, data: result });
});
