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
  submitForReviewSchema,
  reviewResultSchema,
  proposeToPembinaSchema,
  decidePlanSchema,
} from './perencanaan.validation';
import { UserRole } from '@prisma/client';
import {
  ADMIN_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
  PENGURUS_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
} from '@cipansor/shared';
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
function isSuperAdmin(user?: PlanUser): boolean {
  if (!user) return false;
  if (user.roleCode) return user.roleCode === UserRole.SUPER_ADMIN;
  return user.role === UserRole.SUPER_ADMIN;
}

/** Pengurus yayasan — the organ that drafts the yayasan's plans (UU 16/2001 Ps. 31). */
function isPengurus(user?: PlanUser): boolean {
  return !!user?.roleCode && PENGURUS_ROLE_CODES.includes(user.roleCode);
}

/**
 * Who may author a yayasan-level document (RPJP, Renstra, RKA Yayasan):
 * Pengurus and super admin. Never Pembina, who ratifies it, nor Pengawas, who
 * reviews it — neither drafts what they then judge.
 */
function canAuthorFoundationPlan(user?: PlanUser): boolean {
  return isSuperAdmin(user) || isPengurus(user);
}

/**
 * Who may author a unit's plan: that unit's own kepala sekolah and admin —
 * the head drafts the RKA Unit because it is the document their PK then
 * anchors to — plus Pengurus and super admin. Guru and staff do not; they
 * contribute as collaborators invited onto a draft.
 */
function canAuthorUnitPlan(user: PlanUser | undefined, unitId: string): boolean {
  if (!user) return false;
  if (isSuperAdmin(user) || isPengurus(user)) return true;
  const code = user.roleCode ?? '';
  if (ADMIN_ROLE_CODES.includes(code) || PRINCIPAL_ROLE_CODES.includes(code)) {
    return user.unitId === unitId;
  }
  // Pre-roleCode caller: the legacy UNIT_ADMIN bucket, on its own unit only.
  return !user.roleCode && user.role === UserRole.UNIT_ADMIN && user.unitId === unitId;
}

function canWritePlan(plan: PlanAuth | null | undefined, user?: PlanUser): boolean {
  if (!plan) return false;
  if (plan.isCollaborator && isEditablePlan(plan)) return true;
  return plan.unitId === null
    ? canAuthorFoundationPlan(user)
    : canAuthorUnitPlan(user, plan.unitId);
}

type PlanAuth = {
  id: string;
  unitId: string | null;
  status: string;
  /** True when the current user was explicitly shared this plan's draft. */
  isCollaborator: boolean;
  type?: string;
  /** Ratification stage of a yayasan document; null for unit plans. */
  reviewStage?: string | null;
};

/**
 * Statuses in which a plan's subrecords may still be edited. A plan that has
 * been finalised — including one that has been DIAJUKAN (PROPOSED) untuk
 * persetujuan — is frozen: objectives, indicators and activities may no longer
 * be added or changed without resubmitting. Hanya rencana yang masih disusun
 * (DRAFT, IN_PROGRESS) yang boleh diubah subrecord-nya.
 */
const EDITABLE_PLAN_STATUSES = new Set(['DRAFT', 'IN_PROGRESS']);

/**
 * Stages in which a yayasan document is in someone ELSE's hands — Pengawas is
 * reviewing it, or Pembina is deciding on it. Changing it underneath them
 * would make the review, or the ratification, about a different document.
 */
const LOCKED_REVIEW_STAGES = new Set(['DIREVIU_PENGAWAS', 'DIAJUKAN_PEMBINA']);

function isEditablePlan(plan: Pick<PlanAuth, 'status' | 'reviewStage'>): boolean {
  return (
    EDITABLE_PLAN_STATUSES.has(plan.status) && !LOCKED_REVIEW_STAGES.has(plan.reviewStage ?? '')
  );
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

  // RPJP dan Renstra selalu dokumen tingkat yayasan (unitId null); RKA tanpa
  // unit adalah RKA Yayasan. Ketiganya disusun Pengurus — bukan Pembina yang
  // mengesahkannya, bukan Pengawas yang mereviunya.
  const isFoundationDoc = body.type === 'RPJP' || body.type === 'RENSTRA';
  if (isFoundationDoc && !canAuthorFoundationPlan(req.user)) {
    throw Errors.forbidden(
      `${body.type} adalah dokumen tingkat yayasan dan hanya disusun oleh Pengurus yayasan.`
    );
  }

  let targetUnitId: string | null;
  if (isFoundationDoc) {
    targetUnitId = null;
  } else if (req.user?.unitId) {
    targetUnitId = req.user.unitId;
  } else if (body.unitId) {
    targetUnitId = body.unitId;
  } else {
    // Omitting the unit files the plan as the yayasan's own RKA — which only
    // Pengurus drafts. "Unit ID is required" told Pengawas and Pembina to add a
    // unit, when the answer is that this document is not theirs to write.
    if (!canAuthorFoundationPlan(req.user)) {
      throw Errors.forbidden(
        'RKA Yayasan disusun oleh Pengurus yayasan. RKA unit disusun kepala sekolah atau admin unitnya.'
      );
    }
    targetUnitId = null;
  }

  if (targetUnitId !== null && !canAuthorUnitPlan(req.user, targetUnitId)) {
    throw Errors.forbidden(
      'RKA unit disusun oleh kepala sekolah dan admin unit itu sendiri. Guru dan staf ikut ' +
        'menyusun sebagai kolaborator yang diundang pada draft.'
    );
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
  if (LOCKED_REVIEW_STAGES.has(existing.reviewStage ?? '')) {
    throw Errors.badRequest(
      'Dokumen ini sedang direviu Pengawas atau menunggu keputusan Pembina, jadi belum dapat diubah.'
    );
  }
  // The header obeys the same rule its subrecords already did. A ratified
  // document is what Pembina — or, for an RKA Unit, Ketua Pengurus — put their
  // name to; rewriting its title or budget afterwards would make that
  // signature cover words they never saw.
  if (!isEditablePlan(existing)) {
    throw Errors.badRequest('Hanya rencana berstatus Draft atau Berjalan yang dapat diubah.');
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

  // A yayasan document is not approved with one button: Pengurus submits,
  // Pengawas reviews, Pembina ratifies (UU 16/2001 Ps. 28 ayat 2 huruf d,
  // Ps. 40 ayat 1). That flow lives under /:id/review/*.
  if (existing.unitId === null) {
    throw Errors.badRequest(
      'Dokumen tingkat yayasan ditetapkan Pembina setelah direviu Pengawas. Ajukan lewat alur ' +
        'pengesahan, bukan tombol setujui langsung.'
    );
  }
  // An RKA Unit is ratified by Ketua Pengurus — the mandate giver whose PK
  // with the kepala unit then anchors to it (PermenPANRB 53/2014 C.1.b.2).
  if (req.user?.roleCode !== KETUA_PENGURUS) {
    throw Errors.forbidden('RKA unit disahkan oleh Ketua Pengurus.');
  }
  if (existing.status === 'APPROVED') throw Errors.badRequest('Rencana ini sudah disahkan.');
  // Approving a running or closed RKA would push it back to APPROVED.
  if (existing.status !== 'DRAFT' && existing.status !== 'PROPOSED') {
    throw Errors.badRequest('Hanya RKA berstatus Draft atau Diajukan yang dapat disahkan.');
  }

  const plan = await perencanaanService.approvePlan(req.params.id, userId);
  res.json({ success: true, data: plan });
});

// ==================== PENGESAHAN DOKUMEN YAYASAN ====================

const KETUA_PENGURUS = 'YAYASAN_KETUA';
const PENGAWAS = 'YAYASAN_PENGAWAS';
const PEMBINA = 'YAYASAN_PEMBINA';

/** The acting organ, or a refusal naming who takes this step. */
function requireOrgan(req: Request, roleCode: string, who: string): string {
  const actorId = req.user?.sub;
  if (!actorId) throw Errors.unauthorized('User context missing');
  if (req.user?.roleCode !== roleCode) {
    throw Errors.forbidden(`Langkah ini dilakukan oleh ${who}.`);
  }
  return actorId;
}

async function loadFoundationPlan(id: string) {
  const plan = await perencanaanService.getPlanForAuth(id);
  if (!plan) throw Errors.notFound('Plan not found');
  if (plan.unitId !== null) {
    throw Errors.badRequest(
      'Alur Pengawas → Pembina hanya untuk dokumen tingkat yayasan. RKA unit disahkan Ketua Pengurus.'
    );
  }
  return plan;
}

/** Ketua Pengurus, for the Pengurus, submits a draft to Pengawas for review. */
export const submitForReview = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireOrgan(req, KETUA_PENGURUS, 'Ketua Pengurus atas nama Pengurus');
  const body = submitForReviewSchema.parse(req.body);
  const plan = await loadFoundationPlan(req.params.id);
  // A PROPOSED document with no stage was "diajukan" before this flow existed.
  // /approve now refuses every yayasan document, so unless it may enter here
  // it can be neither submitted nor ratified.
  const legacyProposed = plan.status === 'PROPOSED' && plan.reviewStage == null;
  if (plan.status !== 'DRAFT' && !legacyProposed) {
    throw Errors.badRequest('Hanya dokumen berstatus Draft yang dapat diajukan ke Pengawas.');
  }
  const data = await perencanaanService.advanceReview({
    planId: plan.id,
    from: [null, 'DIKEMBALIKAN'],
    to: 'DIREVIU_PENGAWAS',
    status: 'DRAFT',
    event: { action: 'AJUKAN_REVIU', actorId, actorRoleCode: KETUA_PENGURUS, notes: body.notes },
  });
  res.json({ success: true, data });
});

/** Pengawas sends the review back to Pengurus. */
export const submitReviewResult = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireOrgan(req, PENGAWAS, 'Pengawas');
  const body = reviewResultSchema.parse(req.body);
  const plan = await loadFoundationPlan(req.params.id);
  const data = await perencanaanService.advanceReview({
    planId: plan.id,
    from: ['DIREVIU_PENGAWAS'],
    to: 'HASIL_REVIU',
    status: 'DRAFT',
    event: { action: 'KIRIM_HASIL_REVIU', actorId, actorRoleCode: PENGAWAS, notes: body.notes },
  });
  res.json({ success: true, data });
});

/**
 * Ketua Pengurus answers the review — revised, or not and why — and submits
 * the document together with that review to Pembina.
 */
export const proposeToPembina = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireOrgan(req, KETUA_PENGURUS, 'Ketua Pengurus atas nama Pengurus');
  const body = proposeToPembinaSchema.parse(req.body);
  const plan = await loadFoundationPlan(req.params.id);
  const data = await perencanaanService.advanceReview({
    planId: plan.id,
    from: ['HASIL_REVIU'],
    to: 'DIAJUKAN_PEMBINA',
    status: 'PROPOSED',
    event: {
      action: 'AJUKAN_PENETAPAN',
      actorId,
      actorRoleCode: KETUA_PENGURUS,
      notes: body.notes,
      revised: body.revised,
    },
  });
  res.json({ success: true, data });
});

/** Pembina ratifies the document, or returns it to Pengurus for improvement. */
export const decidePlan = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireOrgan(req, PEMBINA, 'Pembina');
  const body = decidePlanSchema.parse(req.body);
  const plan = await loadFoundationPlan(req.params.id);
  const tetapkan = body.decision === 'TETAPKAN';
  const data = await perencanaanService.advanceReview({
    planId: plan.id,
    from: ['DIAJUKAN_PEMBINA'],
    to: tetapkan ? 'DITETAPKAN' : 'DIKEMBALIKAN',
    status: tetapkan ? 'APPROVED' : 'DRAFT',
    approve: tetapkan,
    event: {
      action: tetapkan ? 'TETAPKAN' : 'KEMBALIKAN',
      actorId,
      actorRoleCode: PEMBINA,
      notes: body.notes,
    },
  });
  res.json({ success: true, data });
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const existing = await perencanaanService.getPlanForAuth(req.params.id, req.user?.sub);
  if (!existing) throw Errors.notFound('Plan not found');

  if (!canWritePlan(existing, req.user)) {
    throw Errors.forbidden('Access denied');
  }
  // Only a draft nobody else is holding may go. A ratified or running plan is
  // what PKs and realisation hang on, and deleting it cascades its
  // ratification history away with it.
  if (existing.status !== 'DRAFT' || LOCKED_REVIEW_STAGES.has(existing.reviewStage ?? '')) {
    throw Errors.badRequest(
      'Hanya draf yang dapat dihapus — bukan rencana yang sedang direviu, sudah disahkan, atau sedang berjalan.'
    );
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
