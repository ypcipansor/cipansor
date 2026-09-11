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
import { ADMIN_ROLE_CODES, GOVERNANCE_ROLE_CODES } from '@cipansor/shared';
import { seesAllUnits } from '@/utils/resolve-unit-id';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];

/**
 * RoleCodes that may author strategic plans. Faithful to the legacy
 * PRIVILEGED_ROLES bucket (SUPER_ADMIN + UNIT_ADMIN): a roleCode is privileged
 * when it is a system-admin code or a foundation governance code, since
 * GOVERNANCE_ROLE_CODES is what the legacy UNIT_ADMIN string expands to.
 */
const PRIVILEGED_ROLE_CODES: string[] = [...ADMIN_ROLE_CODES, ...GOVERNANCE_ROLE_CODES];

function isPrivileged(user?: PlanUser): boolean {
  if (!user) return false;
  // Canonical path: roleCode. It is also, alone, trustworthy — every roleCode
  // that maps onto the legacy SUPER_ADMIN/UNIT_ADMIN buckets is listed above,
  // while the legacy `role` string is only consulted for pre-roleCode callers.
  if (user.roleCode) return PRIVILEGED_ROLE_CODES.includes(user.roleCode);
  return !!user.role && PRIVILEGED_ROLES.includes(user.role);
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
 * unit-owned plan stays writable by a privileged user within that unit only —
 * mere unit membership (teacher/staff) is not enough to mutate another user's
 * objectives, indicators and activities.
 *
 * The one widening is the plan's own collaborators: a user explicitly shared
 * onto a still-editable (DRAFT/IN_PROGRESS) draft via `addCollaborator` may
 * write it. The membership is per-plan, so it cannot leak across units, and it
 * is revoked the moment the plan leaves DRAFT/IN_PROGRESS — a finalised (or
 * PROPOSED) plan stays frozen for collaborators just as for everyone else.
 */
function canWritePlan(plan: PlanAuth | null | undefined, user?: PlanUser): boolean {
  if (!plan) return false;
  if (plan.isCollaborator && isEditablePlan(plan)) return true;
  const planUnitId = plan.unitId;
  if (!isPrivileged(user)) return false;
  if (planUnitId === null) return seesAll(user);
  return seesAll(user) || planUnitId === user?.unitId;
}

type PlanAuth = {
  id: string;
  unitId: string | null;
  status: string;
  /** True when the current user was explicitly shared this plan's draft. */
  isCollaborator: boolean;
};

/**
 * Statuses in which a plan's subrecords may still be edited. A plan that has
 * been finalised — including one that has been DIAJUKAN (PROPOSED) untuk
 * persetujuan — is frozen: objectives, indicators and activities may no longer
 * be added or changed without resubmitting. Hanya rencana yang masih disusun
 * (DRAFT, IN_PROGRESS) yang boleh diubah subrecord-nya.
 */
const EDITABLE_PLAN_STATUSES = new Set(['DRAFT', 'IN_PROGRESS']);

function isEditablePlan(plan: Pick<PlanAuth, 'status'>): boolean {
  return EDITABLE_PLAN_STATUSES.has(plan.status);
}

/**
 * Shared write gate for subrecord mutations (objective/indicator/activity).
 * Mirrors createObjective's guard: the caller must be able to write the parent
 * plan, and the plan must still be editable (DRAFT/IN_PROGRESS — PROPOSED,
 * setelah diajukan untuk persetujuan, sudah beku). Without this a
 * teacher/staff member who knows a subrecord id could edit or delete another
 * unit's (or the yayasan's) objectives, indicators and activities.
 */
function requireWritableDraftPlan(plan: PlanAuth | null | undefined, user?: PlanUser) {
  if (!plan) throw Errors.notFound('Plan not found');
  if (!canWritePlan(plan, user)) throw Errors.forbidden('Access denied');
  if (!isEditablePlan(plan)) {
    throw Errors.badRequest('Hanya dapat mengubah subrecord pada rencana berstatus DRAFT/IN_PROGRESS');
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
  if (isFoundationDoc && (!isPrivileged(req.user) || !seesAll(req.user))) {
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
      if (!isPrivileged(req.user)) throw Errors.badRequest('Unit ID is required');
      targetUnitId = body.unitId;
    } else {
      // Omitting the unit files the plan as the yayasan's own. That takes the
      // same two-part gate `approvePlan` uses: the admin floor AND foundation
      // scope. `seesAll` alone is too wide — it is also true for cross-unit
      // service staff (perawat, pustakawan, laboran), who read every unit but
      // have no business authoring the yayasan's RPJP.
      if (!isPrivileged(req.user) || !seesAll(req.user)) {
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
  const existing = await perencanaanService.getPlanForAuth(req.params.id, req.user?.sub);
  if (!existing) throw Errors.notFound('Plan not found');

  if (!canWritePlan(existing, req.user)) {
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
  if (!isPrivileged(req.user)) throw Errors.forbidden('Only admins can approve plans');
  if (existing.unitId === null && !seesAll(req.user)) {
    throw Errors.forbidden('Only foundation admins can approve a foundation-wide plan');
  }

  const plan = await perencanaanService.approvePlan(req.params.id, userId);
  res.json({ success: true, data: plan });
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const existing = await perencanaanService.getPlanForAuth(req.params.id, req.user?.sub);
  if (!existing) throw Errors.notFound('Plan not found');

  if (!canWritePlan(existing, req.user)) {
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
  // dalam status yang dapat diedit (belum difinalisasi). Tanpa ini guru/staf
  // biasa dapat menambah sasaran ke plan yayasan atau unit lain hanya dengan
  // tahu planId-nya.
  const plan = await perencanaanService.getPlanForAuth(body.planId, req.user?.sub);
  if (!plan) throw Errors.notFound('Plan not found');
  if (!canWritePlan(plan, req.user)) {
    throw Errors.forbidden('Access denied');
  }
  if (!isEditablePlan(plan)) {
    throw Errors.badRequest('Hanya dapat menambah sasaran pada rencana berstatus DRAFT/IN_PROGRESS');
  }
  const objective = await perencanaanService.createObjective(body);
  res.status(201).json({ success: true, data: objective });
});

export const updateObjective = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getObjectivePlanForAuth(req.params.id, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  const body = updateObjectiveSchema.parse(req.body);
  const objective = await perencanaanService.updateObjective(req.params.id, body);
  res.json({ success: true, data: objective });
});

export const deleteObjective = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getObjectivePlanForAuth(req.params.id, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  await perencanaanService.deleteObjective(req.params.id);
  res.json({ success: true, message: 'Objective deleted' });
});

// ==================== INDICATORS ====================

export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const body = createIndicatorSchema.parse(req.body);
  const plan = await perencanaanService.getObjectivePlanForAuth(body.objectiveId, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  const indicator = await perencanaanService.createIndicator(body);
  res.status(201).json({ success: true, data: indicator });
});

export const updateIndicator = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getIndicatorPlanForAuth(req.params.id, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  const body = updateIndicatorSchema.parse(req.body);
  const indicator = await perencanaanService.updateIndicator(req.params.id, body);
  res.json({ success: true, data: indicator });
});

export const deleteIndicator = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getIndicatorPlanForAuth(req.params.id, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  await perencanaanService.deleteIndicator(req.params.id);
  res.json({ success: true, message: 'Indicator deleted' });
});

// ==================== ACTIVITIES ====================

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const body = createActivitySchema.parse(req.body);
  const plan = await perencanaanService.getObjectivePlanForAuth(body.objectiveId, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  const activity = await perencanaanService.createActivity(body);
  res.status(201).json({ success: true, data: activity });
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getActivityPlanForAuth(req.params.id, req.user?.sub);
  requireWritableDraftPlan(plan, req.user);
  const body = updateActivitySchema.parse(req.body);
  const activity = await perencanaanService.updateActivity(req.params.id, body);
  res.json({ success: true, data: activity });
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  const plan = await perencanaanService.getActivityPlanForAuth(req.params.id, req.user?.sub);
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
    isPrivileged(req.user)
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
    isPrivileged(req.user)
  );
  res.json({ success: true, message: 'Collaborator removed' });
});
