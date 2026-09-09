import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { Errors } from '@/middleware/error';
import { perencanaanService } from './perencanaan.service';
import {
  createPlanSchema,
  updatePlanSchema,
  createObjectiveSchema,
  updateObjectiveSchema,
  createIndicatorSchema,
  updateIndicatorSchema,
  createActivitySchema,
  updateActivitySchema,
  listPlanQuerySchema,
} from './perencanaan.validation';
import { UserRole } from '@prisma/client';
import { seesAllUnits } from '@/utils/resolve-unit-id';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];

function isPrivileged(role?: string): boolean {
  return role ? PRIVILEGED_ROLES.includes(role) : false;
}

type PlanUser = { role?: string; roleCode?: string | null; unitId?: string | null };

/** Foundation scope: the yayasan board and super admin oversee every unit. */
function seesAll(user?: PlanUser): boolean {
  return user ? seesAllUnits({ roleCode: user.roleCode, role: user.role }) : false;
}

/**
 * Read gate. Foundation-wide plans (unitId null) are the yayasan's governing
 * documents — RPJP, Renstra and the consolidated RKA — and are readable by any
 * caller who reaches these staff-only endpoints. Otherwise a caller reads their
 * own unit's plans, and a foundation-scoped caller reads every unit's.
 */
function canReadPlan(planUnitId: string | null, user?: PlanUser): boolean {
  if (planUnitId === null) return true;
  if (seesAll(user)) return true;
  return planUnitId === user?.unitId;
}

/**
 * Write gate — deliberately narrower than the read gate (mutations must never
 * widen). A foundation-wide plan may be written only by a foundation-scoped
 * caller, so a single-unit admin cannot rewrite the yayasan's RPJP. A
 * unit-owned plan stays writable by a privileged user or that unit, exactly as
 * before.
 */
function canWritePlan(planUnitId: string | null, user?: PlanUser): boolean {
  if (planUnitId === null) return seesAll(user);
  return isPrivileged(user?.role) || planUnitId === user?.unitId;
}

type PlanAuth = { id: string; unitId: string | null; status: string };

/**
 * Shared write gate for subrecord mutations (objective/indicator/activity).
 * Mirrors createObjective's guard: the caller must be able to write the parent
 * plan, and the plan must still be DRAFT. Without this a teacher/staff member
 * who knows a subrecord id could edit or delete another unit's (or the
 * yayasan's) objectives, indicators and activities.
 */
function requireWritableDraftPlan(plan: PlanAuth | null | undefined, user?: PlanUser) {
  if (!plan) throw Errors.notFound('Plan not found');
  if (!canWritePlan(plan.unitId, user)) throw Errors.forbidden('Access denied');
  if (plan.status !== 'DRAFT') {
    throw Errors.badRequest('Hanya dapat mengubah subrecord pada rencana berstatus DRAFT');
  }
}

// ==================== PLANS ====================

export const listPlans = asyncHandler(async (req: Request, res: Response) => {
  const foundationScope = seesAll(req.user);
  const unitId = req.user?.unitId ?? null;

  // A caller with neither foundation scope nor a unit has nothing to scope to.
  // (The board has no unitId but is foundation-scoped, so it passes here where
  // the old check demanded a resolvable unit and shut the board out entirely.)
  if (!foundationScope && !unitId) throw Errors.unauthorized('Unit ID required');

  // A foundation-scoped caller may narrow to one unit with ?unitId=…; that
  // unit's plans plus the foundation-wide ones are returned. Without it they
  // see every unit.
  const requestedUnit =
    foundationScope && req.query.unitId ? String(req.query.unitId) : null;
  const targetUnitId = requestedUnit ?? unitId;

  const query = listPlanQuerySchema.parse({
    type: req.query.type,
    status: req.query.status,
  });

  const plans = await perencanaanService.getPlans(targetUnitId, {
    ...query,
    collaboratorId: req.user?.sub,
    seesAllUnits: foundationScope && !requestedUnit,
  });
  res.json({ success: true, data: plans });
});

export const getPlanRealizationTrend = asyncHandler(async (req: Request, res: Response) => {
  const planAuth = await perencanaanService.getPlanForAuth(req.params.id);
  if (!planAuth) throw Errors.notFound('Plan not found');
  if (!canReadPlan(planAuth.unitId, req.user)) {
    throw Errors.forbidden('Access denied');
  }

  const trend = await perencanaanService.getPlanRealizationTrend(req.params.id);
  if (!trend) throw Errors.notFound('Plan not found');
  res.json({ success: true, data: trend });
});

export const getPlan = asyncHandler(async (req: Request, res: Response) => {
  // Lightweight auth check first to avoid expensive journal aggregation for unauthorized users
  const planAuth = await perencanaanService.getPlanForAuth(req.params.id);
  if (!planAuth) throw Errors.notFound('Plan not found');

  if (!canReadPlan(planAuth.unitId, req.user)) {
    throw Errors.forbidden('Access denied');
  }

  const plan = await perencanaanService.getPlanById(req.params.id);
  if (!plan) throw Errors.notFound('Plan not found');

  res.json({ success: true, data: plan });
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const body = createPlanSchema.parse(req.body);

  // RPJP dan RENSTRA adalah dokumen tingkat yayasan (unitId null). Seorang
  // pemanggil unit-scoped yang berusaha membuatnya akan menempelkan
  // targetUnitId ke unitnya sendiri, sehingga dokumen yayasan tercatat milik
  // satu unit dan memblokir root yayasan yang sebenarnya. Tolak dengan jelas.
  const isFoundationDoc = body.type === 'RPJP' || body.type === 'RENSTRA';
  if (isFoundationDoc && (!isPrivileged(req.user?.role) || !seesAll(req.user))) {
    throw Errors.forbidden(
      `${body.type} adalah dokumen tingkat yayasan dan hanya boleh dibuat oleh pengurus yayasan atau super admin.`
    );
  }

  // A yayasan-level document (RPJP, Renstra, RKA Yayasan) has NO unit — that
  // is what makes it the foundation's own plan rather than a school's. Until
  // now this branch demanded a unit from everyone, so the three documents at
  // the top of the cascade could only ever be written by the seed: a super
  // admin carries no unitId, and the fallback rejected the request outright.
  let targetUnitId: string | null | undefined = req.user?.unitId ?? null;

  if (isFoundationDoc) {
    // Dokumen tingkat yayasan selalu tanpa unit — apa pun unitId JWT-nya.
    targetUnitId = null;
  } else if (!targetUnitId) {
    if (body.unitId) {
      // Naming someone else's unit is the privileged write that already
      // existed (SUPER_ADMIN / UNIT_ADMIN).
      if (!isPrivileged(req.user?.role)) throw Errors.badRequest('Unit ID is required');
      targetUnitId = body.unitId;
    } else {
      // Omitting the unit files the plan as the yayasan's own. That takes the
      // same two-part gate `approvePlan` uses: the admin floor AND foundation
      // scope. `seesAll` alone is too wide — it is also true for cross-unit
      // service staff (perawat, pustakawan, laboran), who read every unit but
      // have no business authoring the yayasan's RPJP.
      if (!isPrivileged(req.user?.role) || !seesAll(req.user)) {
        throw Errors.badRequest('Unit ID is required');
      }
      targetUnitId = null;
    }
  }

  const plan = await perencanaanService.createPlan({
    ...body,
    unitId: targetUnitId,
    createdById: userId,
  });

  res.status(201).json({ success: true, data: plan });
});

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const existing = await perencanaanService.getPlanForAuth(req.params.id);
  if (!existing) throw Errors.notFound('Plan not found');

  if (!canWritePlan(existing.unitId, req.user)) {
    throw Errors.forbidden('Access denied');
  }

  const body = updatePlanSchema.parse(req.body);
  const { unitId: _, ...updateData } = body;

  const plan = await perencanaanService.updatePlan(req.params.id, updateData);
  res.json({ success: true, data: plan });
});

export const approvePlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) throw Errors.unauthorized('User context missing');

  const existing = await perencanaanService.getPlanForAuth(req.params.id);
  if (!existing) throw Errors.notFound('Plan not found');

  // Keep the original "admins only" floor, then add the foundation tightening:
  // a foundation-wide plan may be approved only by a foundation-scoped caller,
  // so a single-unit admin cannot ratify the yayasan's RPJP/Renstra.
  if (!isPrivileged(req.user?.role)) throw Errors.forbidden('Only admins can approve plans');
  if (existing.unitId === null && !seesAll(req.user)) {
    throw Errors.forbidden('Only foundation admins can approve a foundation-wide plan');
  }

  const plan = await perencanaanService.approvePlan(req.params.id, userId);
  res.json({ success: true, data: plan });
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const existing = await perencanaanService.getPlanForAuth(req.params.id);
  if (!existing) throw Errors.notFound('Plan not found');

  if (!canWritePlan(existing.unitId, req.user)) {
    throw Errors.forbidden('Access denied');
  }

  await perencanaanService.deletePlan(req.params.id);
  res.json({ success: true, message: 'Plan deleted' });
});

// ==================== OBJECTIVES ====================

export const createObjective = asyncHandler(async (req: Request, res: Response) => {
  const body = createObjectiveSchema.parse(req.body);
  // Sasaran adalah mutasi pada rencana induk: cek akses tulis yang sama dengan
  // updatePlan — harus bisa menulis unit plan tersebut, dan plan harus masih
  // DRAFT. Tanpa ini guru/staf biasa dapat menambah sasaran ke plan yayasan
  // atau unit lain hanya dengan tahu planId-nya.
  const plan = await perencanaanService.getPlanForAuth(body.planId);
  if (!plan) throw Errors.notFound('Plan not found');
  if (!canWritePlan(plan.unitId, req.user)) {
    throw Errors.forbidden('Access denied');
  }
  if (plan.status !== 'DRAFT') {
    throw Errors.badRequest('Hanya dapat menambah sasaran pada rencana berstatus DRAFT');
  }
  const objective = await perencanaanService.createObjective(body);
  res.status(201).json({ success: true, data: objective });
});

export const updateObjective = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getObjectivePlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  const body = updateObjectiveSchema.parse(req.body);
  const objective = await perencanaanService.updateObjective(req.params.id, body);
  res.json({ success: true, data: objective });
});

export const deleteObjective = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getObjectivePlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  await perencanaanService.deleteObjective(req.params.id);
  res.json({ success: true, message: 'Objective deleted' });
});

// ==================== INDICATORS ====================

export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const body = createIndicatorSchema.parse(req.body);
  const plan = await perencanaanService.getObjectivePlanForAuth(body.objectiveId);
  requireWritableDraftPlan(plan, req.user);
  const indicator = await perencanaanService.createIndicator(body);
  res.status(201).json({ success: true, data: indicator });
});

export const updateIndicator = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getIndicatorPlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  const body = updateIndicatorSchema.parse(req.body);
  const indicator = await perencanaanService.updateIndicator(req.params.id, body);
  res.json({ success: true, data: indicator });
});

export const deleteIndicator = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getIndicatorPlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  await perencanaanService.deleteIndicator(req.params.id);
  res.json({ success: true, message: 'Indicator deleted' });
});

// ==================== ACTIVITIES ====================

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const body = createActivitySchema.parse(req.body);
  const plan = await perencanaanService.getObjectivePlanForAuth(body.objectiveId);
  requireWritableDraftPlan(plan, req.user);
  const activity = await perencanaanService.createActivity(body);
  res.status(201).json({ success: true, data: activity });
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getActivityPlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  const body = updateActivitySchema.parse(req.body);
  const activity = await perencanaanService.updateActivity(req.params.id, body);
  res.json({ success: true, data: activity });
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getActivityPlanForAuth(req.params.id);
  requireWritableDraftPlan(plan, req.user);
  await perencanaanService.deleteActivity(req.params.id);
  res.json({ success: true, message: 'Activity deleted' });
});

// ==================== COLLABORATION ====================

export const addCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const callerId = req.user?.sub;
  if (!callerId) throw Errors.unauthorized();
  const { userId } = req.body as { userId?: string };
  if (!userId) throw Errors.badRequest('User ID is required');

  const collaborator = await perencanaanService.addCollaborator(
    req.params.id,
    userId,
    callerId,
    isPrivileged(req.user?.role)
  );
  res.status(201).json({ success: true, data: collaborator });
});

export const removeCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const callerId = req.user?.sub;
  if (!callerId) throw Errors.unauthorized();

  await perencanaanService.removeCollaborator(
    req.params.id,
    req.params.userId,
    callerId,
    isPrivileged(req.user?.role)
  );
  res.json({ success: true, message: 'Collaborator removed' });
});
