import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/utils/resolve-unit-id', () => ({
  seesAllUnits: vi.fn(({ roleCode }: { roleCode?: string }) => roleCode === 'YAYASAN_KETUA' || roleCode === 'SUPER_ADMIN'),
}));

vi.mock('../perencanaan.service', () => ({
  perencanaanService: {
    getPlanForAuth: vi.fn(),
    getObjectivePlanForAuth: vi.fn(),
    getIndicatorPlanForAuth: vi.fn(),
    getActivityPlanForAuth: vi.fn(),
    createPlan: vi.fn(),
    approvePlan: vi.fn(),
    advanceReview: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    createObjective: vi.fn(),
    updateObjective: vi.fn(),
    deleteObjective: vi.fn(),
    createIndicator: vi.fn(),
    updateIndicator: vi.fn(),
    deleteIndicator: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
  },
}));

vi.mock('../perencanaan.validation', () => ({
  createPlanSchema: { parse: vi.fn((x: any) => x) },
  updatePlanSchema: { parse: vi.fn((x: any) => x) },
  createObjectiveSchema: { parse: vi.fn((x: any) => x) },
  updateObjectiveSchema: { parse: vi.fn((x: any) => x) },
  createIndicatorSchema: { parse: vi.fn((x: any) => x) },
  updateIndicatorSchema: { parse: vi.fn((x: any) => x) },
  createActivitySchema: { parse: vi.fn((x: any) => x) },
  updateActivitySchema: { parse: vi.fn((x: any) => x) },
  listPlanQuerySchema: { parse: vi.fn((x: any) => x) },
  submitForReviewSchema: { parse: vi.fn((x: any) => x) },
  reviewResultSchema: { parse: vi.fn((x: any) => x) },
  proposeToPembinaSchema: { parse: vi.fn((x: any) => x) },
  decidePlanSchema: { parse: vi.fn((x: any) => x) },
}));

import * as perencanaanController from '../perencanaan.controller';
import { perencanaanService } from '../perencanaan.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1', role: 'TEACHER', roleCode: 'SDIT_GURU', unitId: 'unit-sdit' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) { (this as any).statusCode = code; return this; },
    json(payload: unknown) { (this as any).jsonPayload = payload; return this; },
  } as unknown as Response & { statusCode: number; jsonPayload: any };

  return { req, res };
}

async function run(handler: any, req: Request, res: Response) {
  let nextError: any = null;
  await handler(req, res, (err?: any) => {
    nextError = err;
  });
  // asyncHandler menyambungkan rejection ke next() secara mikro-task; beri
  // waktu satu putaran event-loop agar error yang dilempar service sampai.
  await new Promise((r) => setTimeout(r, 0));
  if (nextError) throw nextError;
}

describe('perencanaanController.createPlan — dokumen tingkat yayasan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak pemanggil unit-scoped yang membuat RPJP (dokumen yayasan)', async () => {
    const { req, res } = mockReqRes({
      user: { sub: 'user-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' } as any,
      body: { title: 'RPJP 2026-2045', type: 'RPJP' },
    });

    await expect(run(perencanaanController.createPlan, req, res)).rejects.toThrowError(
      /tingkat yayasan/i,
    );

    expect(perencanaanService.createPlan).not.toHaveBeenCalled();
  });

  it('membuat RPJP tanpa unit untuk pemanggil ber-scope yayasan', async () => {
    const { req, res } = mockReqRes({
      user: { sub: 'user-1', role: 'SUPER_ADMIN', roleCode: 'YAYASAN_KETUA', unitId: null } as any,
      body: { title: 'RPJP 2026-2045', type: 'RPJP' },
    });
    vi.mocked(perencanaanService.createPlan).mockResolvedValue({ id: 'rpjp-1' } as any);

    await run(perencanaanController.createPlan, req, res);

    expect(perencanaanService.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RPJP', unitId: null }),
    );
  });
});

describe('perencanaanController.createObjective — write access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak guru/staf biasa pada plan unit lain (403)', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-smpit',
      unitId: 'unit-smpit',
      status: 'DRAFT',
    } as any);

    const { req, res } = mockReqRes({
      user: { sub: 'user-1', role: 'TEACHER', roleCode: 'SDIT_GURU', unitId: 'unit-sdit' } as any,
      body: { planId: 'plan-smpit', title: 'Sasaran X' },
    });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );

    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it('menolak menambah sasaran pada plan yang tidak lagi DRAFT', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-sdit',
      unitId: 'unit-sdit',
      status: 'APPROVED',
    } as any);

    const { req, res } = mockReqRes({
      user: { sub: 'user-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' } as any,
      body: { planId: 'plan-sdit', title: 'Sasaran X' },
    });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(
      /DRAFT/i,
    );

    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it('mengizinkan admin unit yang ditunjuk pada plan unitnya sendiri yang DRAFT', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-sdit',
      unitId: 'unit-sdit',
      status: 'DRAFT',
    } as any);
    vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);

    const { req, res } = mockReqRes({
      user: { sub: 'user-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' } as any,
      body: { planId: 'plan-sdit', title: 'Sasaran X' },
    });

    await run(perencanaanController.createObjective, req, res);

    expect(perencanaanService.createObjective).toHaveBeenCalledTimes(1);
  });
});
describe('perencanaanController — write guard pada subrecord lintas unit (Bug regresi #1)', () => {
  beforeEach(() => vi.clearAllMocks());

  const planSmpit = { id: 'plan-smpit', unitId: 'unit-smpit', status: 'DRAFT' } as any;
  const planApproved = { id: 'plan-smpit', unitId: 'unit-smpit', status: 'APPROVED' } as any;
  const planSdit = { id: 'plan-sdit', unitId: 'unit-sdit', status: 'DRAFT' } as any;

  const crossUnitUser = {
    sub: 'user-1',
    role: 'TEACHER',
    roleCode: 'SDIT_GURU',
    unitId: 'unit-sdit',
  } as any;
  const ownUnitAdmin = {
    sub: 'user-1',
    role: 'UNIT_ADMIN',
    roleCode: 'SDIT_ADMIN',
    unitId: 'unit-sdit',
  } as any;

  it('menolak updateObjective pada plan unit lain (103: cross-unit)', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'obj-smpit' },
      body: { title: 'Ubah sasaran unit lain' },
    });

    await expect(run(perencanaanController.updateObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.updateObjective).not.toHaveBeenCalled();
  });

  it('menolak updateObjective pada plan yang bukan DRAFT', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planApproved);
    const { req, res } = mockReqRes({
      user: {
        sub: 'user-1',
        role: 'UNIT_ADMIN',
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-smpit',
      } as any,
      params: { id: 'obj-smpit' },
      body: { title: 'Ubah sasaran plan approved' },
    });

    await expect(run(perencanaanController.updateObjective, req, res)).rejects.toThrowError(
      /DRAFT/i,
    );
    expect(perencanaanService.updateObjective).not.toHaveBeenCalled();
  });

  it('mengizinkan updateObjective untuk admin unit pada plan unitnya sendiri yang DRAFT', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planSdit);
    vi.mocked(perencanaanService.updateObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({
      user: ownUnitAdmin,
      params: { id: 'obj-1' },
      body: { title: 'Sasaran OK' },
    });

    await run(perencanaanController.updateObjective, req, res);
    expect(perencanaanService.updateObjective).toHaveBeenCalledTimes(1);
  });

  it('menolak deleteObjective pada plan unit lain', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'obj-smpit' },
    });

    await expect(run(perencanaanController.deleteObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.deleteObjective).not.toHaveBeenCalled();
  });

  it('menolak createIndicator pada objective milik unit lain', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      body: { objectiveId: 'obj-smpit', name: 'Indikator X', unit: '%', targetValue: 90 },
    });

    await expect(run(perencanaanController.createIndicator, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.createIndicator).not.toHaveBeenCalled();
  });

  it('menolak updateIndicator pada indikator milik unit lain', async () => {
    vi.mocked(perencanaanService.getIndicatorPlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'ind-smpit' },
      body: { name: 'Ubah indikator unit lain' },
    });

    await expect(run(perencanaanController.updateIndicator, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.updateIndicator).not.toHaveBeenCalled();
  });

  it('mengizinkan updateIndicator untuk admin unit pada plan unitnya sendiri yang DRAFT', async () => {
    vi.mocked(perencanaanService.getIndicatorPlanForAuth).mockResolvedValue(planSdit);
    vi.mocked(perencanaanService.updateIndicator).mockResolvedValue({ id: 'ind-1' } as any);
    const { req, res } = mockReqRes({
      user: ownUnitAdmin,
      params: { id: 'ind-1' },
      body: { name: 'Indikator OK' },
    });

    await run(perencanaanController.updateIndicator, req, res);
    expect(perencanaanService.updateIndicator).toHaveBeenCalledTimes(1);
  });

  it('menolak deleteIndicator pada indikator milik unit lain', async () => {
    vi.mocked(perencanaanService.getIndicatorPlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'ind-smpit' },
    });

    await expect(run(perencanaanController.deleteIndicator, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.deleteIndicator).not.toHaveBeenCalled();
  });

  it('menolak createActivity pada objective milik unit lain', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      body: { objectiveId: 'obj-smpit', title: 'Kegiatan X' },
    });

    await expect(run(perencanaanController.createActivity, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.createActivity).not.toHaveBeenCalled();
  });

  it('menolak updateActivity pada aktivitas milik unit lain', async () => {
    vi.mocked(perencanaanService.getActivityPlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'act-smpit' },
      body: { title: 'Ubah kegiatan unit lain' },
    });

    await expect(run(perencanaanController.updateActivity, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.updateActivity).not.toHaveBeenCalled();
  });

  it('menolak deleteActivity pada aktivitas milik unit lain', async () => {
    vi.mocked(perencanaanService.getActivityPlanForAuth).mockResolvedValue(planSmpit);
    const { req, res } = mockReqRes({
      user: crossUnitUser,
      params: { id: 'act-smpit' },
    });

    await expect(run(perencanaanController.deleteActivity, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.deleteActivity).not.toHaveBeenCalled();
  });

  // Regression (e2e perencanaan-finance): a plan in IN_PROGRESS is a plan still
  // being worked on — subrecords must remain writable. Only finalised plans
  // (APPROVED/COMPLETED/CANCELLED/PROPOSED-as-final) are frozen.
  it('mengizinkan createActivity pada plan unit sendiri yang berstatus IN_PROGRESS', async () => {
    const planInProgress = { id: 'plan-smpit', unitId: 'unit-smpit', status: 'IN_PROGRESS' } as any;
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planInProgress);
    vi.mocked(perencanaanService.createActivity).mockResolvedValue({ id: 'act-1' } as any);
    const { req, res } = mockReqRes({
      user: {
        sub: 'user-1',
        role: 'UNIT_ADMIN',
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-smpit',
      } as any,
      body: { objectiveId: 'obj-smpit', title: 'Kegiatan pada plan berjalan' },
    });

    await run(perencanaanController.createActivity, req, res);

    expect(perencanaanService.createActivity).toHaveBeenCalledTimes(1);
  });

  it('menolak createActivity pada plan yang sudah difinalisasi (APPROVED)', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(planApproved);
    const { req, res } = mockReqRes({
      user: {
        sub: 'user-1',
        role: 'UNIT_ADMIN',
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-smpit',
      } as any,
      body: { objectiveId: 'obj-smpit', title: 'Kegiatan pada plan final' },
    });

    await expect(run(perencanaanController.createActivity, req, res)).rejects.toThrowError(/DRAFT/i);
    expect(perencanaanService.createActivity).not.toHaveBeenCalled();
  });

  it('mengizinkan createObjective pada plan unit sendiri yang berstatus IN_PROGRESS', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-smpit',
      unitId: 'unit-smpit',
      status: 'IN_PROGRESS',
    } as any);
    vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({
      user: {
        sub: 'user-1',
        role: 'UNIT_ADMIN',
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-smpit',
      } as any,
      body: { planId: 'plan-smpit', title: 'Sasaran pada plan berjalan' },
    });

    await run(perencanaanController.createObjective, req, res);

    expect(perencanaanService.createObjective).toHaveBeenCalledTimes(1);
  });
});

describe('perencanaanController — rencana PROPOSED beku (Bug regresi #4)', () => {
  beforeEach(() => vi.clearAllMocks());

  const proposer = {
    sub: 'user-1',
    role: 'UNIT_ADMIN',
    roleCode: 'SMPIT_ADMIN',
    unitId: 'unit-smpit',
  } as any;

  it('menolak menambah sasaran pada plan yang sudah DIAJUKAN (PROPOSED)', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-smpit',
      unitId: 'unit-smpit',
      status: 'PROPOSED',
    } as any);

    const { req, res } = mockReqRes({
      user: proposer,
      body: { planId: 'plan-smpit', title: 'Sasaran setelah pengajuan' },
    });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(
      /DRAFT\/IN_PROGRESS/i,
    );
    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it('menolak memperbarui sasaran pada plan PROPOSED melalui write gate', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue({
      id: 'plan-smpit',
      unitId: 'unit-smpit',
      status: 'PROPOSED',
    } as any);

    const { req, res } = mockReqRes({
      user: proposer,
      params: { id: 'obj-smpit' },
      body: { title: 'Sasaran berubah' },
    });

    await expect(run(perencanaanController.updateObjective, req, res)).rejects.toThrowError(
      /DRAFT\/IN_PROGRESS/i,
    );
    expect(perencanaanService.updateObjective).not.toHaveBeenCalled();
  });

  it('mengizinkan mutasi subrecord pada plan DRAFT dan IN_PROGRESS', async () => {
    for (const status of ['DRAFT', 'IN_PROGRESS']) {
      vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
        id: 'plan-smpit',
        unitId: 'unit-smpit',
        status,
      } as any);
      vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);

      const { req, res } = mockReqRes({
        user: proposer,
        body: { planId: 'plan-smpit', title: `Sasaran pada plan ${status}` },
      });

      await run(perencanaanController.createObjective, req, res);

      expect(perencanaanService.createObjective).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();
    }
  });
});
describe('perencanaanController — same-unit teacher cannot write (Bug regresi #1)', () => {
  beforeEach(() => vi.clearAllMocks());

  const ownUnitPlan = { id: 'plan-sdit', unitId: 'unit-sdit', status: 'DRAFT' } as any;

  const sameUnitTeacher = {
    sub: 'user-1',
    role: 'TEACHER',
    roleCode: 'SDIT_GURU',
    unitId: 'unit-sdit',
  } as any;
  const ownUnitAdmin = {
    sub: 'user-1',
    role: 'UNIT_ADMIN',
    roleCode: 'SDIT_ADMIN',
    unitId: 'unit-sdit',
  } as any;

  it('menolak guru seunit membuat objective pada plan unitnya sendiri (403)', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue(ownUnitPlan);
    const { req, res } = mockReqRes({
      user: sameUnitTeacher,
      body: { planId: 'plan-sdit', title: 'Sasaran oleh guru seunit' },
    });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it('menolak guru seunit menghapus activity pada plan unitnya sendiri (403)', async () => {
    vi.mocked(perencanaanService.getActivityPlanForAuth).mockResolvedValue(ownUnitPlan);
    const { req, res } = mockReqRes({
      user: sameUnitTeacher,
      params: { id: 'act-sdit' },
    });

    await expect(run(perencanaanController.deleteActivity, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.deleteActivity).not.toHaveBeenCalled();
  });

  it('mengizinkan admin unit yang sah membuat objective pada plan unitnya sendiri', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue(ownUnitPlan);
    vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({
      user: ownUnitAdmin,
      body: { planId: 'plan-sdit', title: 'Sasaran oleh admin unit' },
    });

    await run(perencanaanController.createObjective, req, res);

    expect(perencanaanService.createObjective).toHaveBeenCalledTimes(1);
  });
});
describe('perencanaanController — collaborator dapat mengedit subrecord draft (BUG 2)', () => {
  beforeEach(() => vi.clearAllMocks());

  // Collaborator: non-privileged (guru) yang di-share ke sebuah plan DRAFT.
  const collaboratorUser = {
    sub: 'user-collab',
    role: 'TEACHER',
    roleCode: 'SDIT_GURU',
    unitId: 'unit-sdit',
  } as any;
  const collaboratorPlan = {
    id: 'plan-sdit',
    unitId: 'unit-sdit',
    status: 'DRAFT',
    isCollaborator: true,
  } as any;
  const collaboratorPlanInProgress = {
    id: 'plan-sdit',
    unitId: 'unit-sdit',
    status: 'IN_PROGRESS',
    isCollaborator: true,
  } as any;
  const collaboratorApprovedPlan = {
    id: 'plan-sdit',
    unitId: 'unit-sdit',
    status: 'APPROVED',
    isCollaborator: true,
  } as any;

  it('mengizinkan kolaborator non-privileged membuat objective pada plan DRAFT', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue(collaboratorPlan);
    vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({
      user: collaboratorUser,
      body: { planId: 'plan-sdit', title: 'Sasaran oleh kolaborator' },
    });

    await run(perencanaanController.createObjective, req, res);

    expect(perencanaanService.createObjective).toHaveBeenCalledTimes(1);
  });

  it('mengizinkan kolaborator memperbarui subrecord pada plan IN_PROGRESS', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(
      collaboratorPlanInProgress
    );
    vi.mocked(perencanaanService.updateObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({
      user: collaboratorUser,
      params: { id: 'obj-1' },
      body: { title: 'Sasaran diperbarui kolaborator' },
    });

    await run(perencanaanController.updateObjective, req, res);

    expect(perencanaanService.updateObjective).toHaveBeenCalledTimes(1);
  });

  it('menolak kolaborator menulis subrecord pada plan yang sudah difinalisasi', async () => {
    vi.mocked(perencanaanService.getObjectivePlanForAuth).mockResolvedValue(
      collaboratorApprovedPlan
    );
    const { req, res } = mockReqRes({
      user: collaboratorUser,
      params: { id: 'obj-1' },
      body: { title: 'Percobaan edit plan final' },
    });

    // Kolaborator yang sah tetapi pada plan final (APPROVED) tidak boleh
    // menulis: akses tulis kolaborator hanya berlaku selama DRAFT/IN_PROGRESS.
    await expect(run(perencanaanController.updateObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.updateObjective).not.toHaveBeenCalled();
  });

  it('tetap menolak guru seunit yang BUKAN kolaborator (tidak melonggarkan akses)', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'plan-sdit',
      unitId: 'unit-sdit',
      status: 'DRAFT',
      isCollaborator: false,
    } as any);
    const { req, res } = mockReqRes({
      user: {
        sub: 'user-1',
        role: 'TEACHER',
        roleCode: 'SDIT_GURU',
        unitId: 'unit-sdit',
      } as any,
      body: { planId: 'plan-sdit', title: 'Sasaran oleh guru seunit biasa' },
    });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(
      /403|forbidden|Access denied/i,
    );
    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });
});

describe('perencanaanController — kepala sekolah menyusun RKA unitnya (keputusan 2026-09-11)', () => {
  beforeEach(() => vi.clearAllMocks());
  const kepsek = { sub: 'u-kepsek', role: 'TEACHER', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sdit' };

  it('mengizinkan kepala sekolah menambah sasaran pada RKA unitnya sendiri', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'rka-sdit', unitId: 'unit-sdit', status: 'DRAFT', isCollaborator: false,
    } as any);
    vi.mocked(perencanaanService.createObjective).mockResolvedValue({ id: 'obj-1' } as any);
    const { req, res } = mockReqRes({ user: kepsek as any, body: { planId: 'rka-sdit', title: 'Sasaran literasi' } });

    await run(perencanaanController.createObjective, req, res);
    expect(perencanaanService.createObjective).toHaveBeenCalled();
  });

  it('menolak kepala sekolah menulis RKA unit lain', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
      id: 'rka-smpit', unitId: 'unit-smpit', status: 'DRAFT', isCollaborator: false,
    } as any);
    const { req, res } = mockReqRes({ user: kepsek as any, body: { planId: 'rka-smpit', title: 'Sasaran X' } });

    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(/Access denied/);
    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it('kepala sekolah membuat RKA untuk unitnya sendiri', async () => {
    vi.mocked(perencanaanService.createPlan).mockResolvedValue({ id: 'rka-sdit' } as any);
    const { req, res } = mockReqRes({ user: kepsek as any, body: { title: 'RKA SD IT 2027', type: 'RKA' } });

    await run(perencanaanController.createPlan, req, res);
    expect(perencanaanService.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RKA', unitId: 'unit-sdit' }),
    );
  });

  it('guru tidak lagi dapat membuat dokumen RKA kosong untuk unitnya', async () => {
    const { req, res } = mockReqRes({
      user: { sub: 'u-guru', role: 'TEACHER', roleCode: 'SDIT_GURU', unitId: 'unit-sdit' } as any,
      body: { title: 'RKA SD IT 2027', type: 'RKA' },
    });

    await expect(run(perencanaanController.createPlan, req, res)).rejects.toThrowError(
      /kepala sekolah dan admin unit/,
    );
    expect(perencanaanService.createPlan).not.toHaveBeenCalled();
  });
});

describe('perencanaanController — Pembina dan Pengawas tidak menyusun dokumen', () => {
  beforeEach(() => vi.clearAllMocks());
  const organ = (roleCode: string) => ({ sub: `u-${roleCode}`, role: 'UNIT_ADMIN', roleCode, unitId: null });

  it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS'])('%s tidak dapat membuat RPJP', async (roleCode) => {
    const { req, res } = mockReqRes({ user: organ(roleCode) as any, body: { title: 'RPJP 2027-2045', type: 'RPJP' } });

    await expect(run(perencanaanController.createPlan, req, res)).rejects.toThrowError(
      /hanya disusun oleh Pengurus/,
    );
    expect(perencanaanService.createPlan).not.toHaveBeenCalled();
  });

  it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS'])(
    '%s yang membuat RKA tanpa unit ditolak karena wewenang, bukan karena unitnya kosong',
    async (roleCode) => {
      // Ditemukan pada jalan-langsung: jawabannya dulu 400 "Unit ID is
      // required", seolah cukup menambahkan unit.
      const { req, res } = mockReqRes({
        user: organ(roleCode) as any,
        body: { title: 'RKA Yayasan 2028', type: 'RKA' },
      });

      await expect(run(perencanaanController.createPlan, req, res)).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringMatching(/disusun oleh Pengurus yayasan/),
      });
      expect(perencanaanService.createPlan).not.toHaveBeenCalled();
    },
  );

  it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS'])(
    '%s tidak dapat menambah sasaran pada RKA Yayasan',
    async (roleCode) => {
      vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({
        id: 'rka-yys', unitId: null, status: 'DRAFT', isCollaborator: false,
      } as any);
      const { req, res } = mockReqRes({ user: organ(roleCode) as any, body: { planId: 'rka-yys', title: 'Sasaran' } });

      await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrowError(/Access denied/);
      expect(perencanaanService.createObjective).not.toHaveBeenCalled();
    },
  );
});

describe('perencanaanController.approvePlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dokumen yayasan — penetapannya lewat alur Pengawas → Pembina', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ id: 'rka-yys', unitId: null, status: 'DRAFT' } as any);
    const { req, res } = mockReqRes({
      user: { sub: 'u-pembina', role: 'UNIT_ADMIN', roleCode: 'YAYASAN_PEMBINA', unitId: null } as any,
      params: { id: 'rka-yys' } as any,
    });

    await expect(run(perencanaanController.approvePlan, req, res)).rejects.toThrowError(/alur/);
    expect(perencanaanService.approvePlan).not.toHaveBeenCalled();
  });

  it.each(['SUPER_ADMIN', 'SDIT_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'YAYASAN_BENDAHARA'])(
    'RKA unit tidak disahkan oleh %s',
    async (roleCode) => {
      vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ id: 'rka-sdit', unitId: 'unit-sdit', status: 'DRAFT' } as any);
      const { req, res } = mockReqRes({
        user: { sub: 'u-x', role: 'UNIT_ADMIN', roleCode, unitId: 'unit-sdit' } as any,
        params: { id: 'rka-sdit' } as any,
      });

      await expect(run(perencanaanController.approvePlan, req, res)).rejects.toThrowError(/Ketua Pengurus/);
      expect(perencanaanService.approvePlan).not.toHaveBeenCalled();
    },
  );

  it('Ketua Pengurus mengesahkan RKA unit', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ id: 'rka-sdit', unitId: 'unit-sdit', status: 'DRAFT' } as any);
    vi.mocked(perencanaanService.approvePlan).mockResolvedValue({ id: 'rka-sdit', status: 'APPROVED' } as any);
    const { req, res } = mockReqRes({
      user: { sub: 'u-ketua', role: 'UNIT_ADMIN', roleCode: 'YAYASAN_KETUA', unitId: null } as any,
      params: { id: 'rka-sdit' } as any,
    });

    await run(perencanaanController.approvePlan, req, res);
    expect(perencanaanService.approvePlan).toHaveBeenCalledWith('rka-sdit', 'u-ketua');
  });

  it('RKA unit yang sedang berjalan tidak "disahkan" ulang — itu memundurkannya ke APPROVED', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ id: 'rka-sdit', unitId: 'unit-sdit', status: 'IN_PROGRESS' } as any);
    const { req, res } = mockReqRes({
      user: { sub: 'u-ketua', role: 'UNIT_ADMIN', roleCode: 'YAYASAN_KETUA', unitId: null } as any,
      params: { id: 'rka-sdit' } as any,
    });

    await expect(run(perencanaanController.approvePlan, req, res)).rejects.toThrowError(/Draft atau Diajukan/);
    expect(perencanaanService.approvePlan).not.toHaveBeenCalled();
  });
});

describe('perencanaanController — alur pengesahan dokumen yayasan', () => {
  const as = (roleCode: string) => ({ sub: `u-${roleCode}`, role: 'UNIT_ADMIN', roleCode, unitId: null });
  const plan = { id: 'rka-yys', unitId: null, status: 'DRAFT', reviewStage: null, isCollaborator: false };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue(plan as any);
    vi.mocked(perencanaanService.advanceReview).mockResolvedValue({ id: 'rka-yys' } as any);
  });

  const call = (handler: any, roleCode: string, body: any = {}) => {
    const { req, res } = mockReqRes({ user: as(roleCode) as any, params: { id: 'rka-yys' } as any, body });
    return run(handler, req, res);
  };

  it('Ketua Pengurus mengajukan draft ke Pengawas', async () => {
    await call(perencanaanController.submitForReview, 'YAYASAN_KETUA');
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        from: [null, 'DIKEMBALIKAN'],
        to: 'DIREVIU_PENGAWAS',
        status: 'DRAFT',
        event: expect.objectContaining({ action: 'AJUKAN_REVIU', actorRoleCode: 'YAYASAN_KETUA' }),
      }),
    );
  });

  it.each(['YAYASAN_SEKRETARIS', 'YAYASAN_PENGAWAS', 'YAYASAN_PEMBINA', 'SUPER_ADMIN'])(
    '%s tidak dapat mengajukan ke Pengawas',
    async (roleCode) => {
      await expect(call(perencanaanController.submitForReview, roleCode)).rejects.toThrowError(/Ketua Pengurus/);
      expect(perencanaanService.advanceReview).not.toHaveBeenCalled();
    },
  );

  it('hanya Pengawas yang mengirim hasil reviu', async () => {
    await expect(
      call(perencanaanController.submitReviewResult, 'YAYASAN_KETUA', { notes: 'Hasil reviu lengkap' }),
    ).rejects.toThrowError(/Pengawas/);

    await call(perencanaanController.submitReviewResult, 'YAYASAN_PENGAWAS', { notes: 'Hasil reviu lengkap' });
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ['DIREVIU_PENGAWAS'],
        to: 'HASIL_REVIU',
        event: expect.objectContaining({ action: 'KIRIM_HASIL_REVIU', notes: 'Hasil reviu lengkap' }),
      }),
    );
  });

  it('Ketua Pengurus mengajukan ke Pembina beserta tanggapan atas reviu', async () => {
    await call(perencanaanController.proposeToPembina, 'YAYASAN_KETUA', {
      revised: false,
      notes: 'Tidak direvisi: angka pagu sudah sesuai keputusan rapat pengurus.',
    });
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ['HASIL_REVIU'],
        to: 'DIAJUKAN_PEMBINA',
        status: 'PROPOSED',
        event: expect.objectContaining({ action: 'AJUKAN_PENETAPAN', revised: false }),
      }),
    );
  });

  it('Pembina menetapkan dokumen', async () => {
    await call(perencanaanController.decidePlan, 'YAYASAN_PEMBINA', { decision: 'TETAPKAN' });
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ['DIAJUKAN_PEMBINA'],
        to: 'DITETAPKAN',
        status: 'APPROVED',
        approve: true,
        event: expect.objectContaining({ action: 'TETAPKAN', actorRoleCode: 'YAYASAN_PEMBINA' }),
      }),
    );
  });

  it('Pembina mengembalikan dokumen untuk diperbaiki', async () => {
    await call(perencanaanController.decidePlan, 'YAYASAN_PEMBINA', {
      decision: 'KEMBALIKAN',
      notes: 'Sasaran kemandirian ekonomi belum punya indikator terukur.',
    });
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'DIKEMBALIKAN', status: 'DRAFT', approve: false }),
    );
  });

  it.each(['YAYASAN_KETUA', 'YAYASAN_PENGAWAS', 'SUPER_ADMIN'])('%s tidak dapat menetapkan', async (roleCode) => {
    await expect(call(perencanaanController.decidePlan, roleCode, { decision: 'TETAPKAN' })).rejects.toThrowError(
      /Pembina/,
    );
    expect(perencanaanService.advanceReview).not.toHaveBeenCalled();
  });

  it('dokumen PROPOSED lama tanpa tahap tetap dapat masuk alur', async () => {
    // Diajukan sebelum alur ini ada: /approve kini menolak semua dokumen
    // yayasan, jadi tanpa jalan masuk ini ia tidak dapat diapa-apakan lagi.
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, status: 'PROPOSED' } as any);
    await call(perencanaanController.submitForReview, 'YAYASAN_KETUA');
    expect(perencanaanService.advanceReview).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'DIREVIU_PENGAWAS', status: 'DRAFT' }),
    );
  });

  it('dokumen yang sudah berlaku tidak diajukan ulang', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, status: 'IN_PROGRESS' } as any);
    await expect(call(perencanaanController.submitForReview, 'YAYASAN_KETUA')).rejects.toThrowError(/Draft/);
    expect(perencanaanService.advanceReview).not.toHaveBeenCalled();
  });

  it('alur ini tidak berlaku untuk RKA unit', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, unitId: 'unit-sdit' } as any);
    await expect(call(perencanaanController.submitForReview, 'YAYASAN_KETUA')).rejects.toThrowError(
      /hanya untuk dokumen tingkat yayasan/,
    );
  });

  it('dokumen yang sedang direviu Pengawas tidak dapat diubah', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, reviewStage: 'DIREVIU_PENGAWAS' } as any);
    const { req, res } = mockReqRes({
      user: as('YAYASAN_KETUA') as any,
      params: { id: 'rka-yys' } as any,
      body: { title: 'Judul baru' },
    });
    await expect(run(perencanaanController.updatePlan, req, res)).rejects.toThrowError(/sedang direviu/);
    expect(perencanaanService.updatePlan).not.toHaveBeenCalled();
  });

  it('sasaran tidak dapat ditambah saat dokumen menunggu keputusan Pembina', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, reviewStage: 'DIAJUKAN_PEMBINA' } as any);
    const { req, res } = mockReqRes({ user: as('YAYASAN_KETUA') as any, body: { planId: 'rka-yys', title: 'Sasaran' } });
    await expect(run(perencanaanController.createObjective, req, res)).rejects.toThrow();
    expect(perencanaanService.createObjective).not.toHaveBeenCalled();
  });

  it.each([
    ['dokumen yayasan yang sudah ditetapkan Pembina', { status: 'APPROVED', reviewStage: 'DITETAPKAN' }],
    ['RKA unit yang sudah disahkan Ketua Pengurus', { unitId: 'unit-sdit', status: 'APPROVED', reviewStage: null }],
  ])('kepala %s tidak dapat ditulis ulang', async (_label, over) => {
    // Subrecord-nya sudah beku sejak dulu; kepalanya (judul, anggaran, visi,
    // misi) tidak — tanda tangan pengesah jadi menutupi teks yang tak ia lihat.
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, ...over } as any);
    const { req, res } = mockReqRes({
      user: as('YAYASAN_KETUA') as any,
      params: { id: 'rka-yys' } as any,
      body: { budget: 999 },
    });
    await expect(run(perencanaanController.updatePlan, req, res)).rejects.toThrowError(/Draft atau Berjalan/);
    expect(perencanaanService.updatePlan).not.toHaveBeenCalled();
  });

  it('draf yang dikembalikan Pembina dapat diperbaiki lagi', async () => {
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, reviewStage: 'DIKEMBALIKAN' } as any);
    vi.mocked(perencanaanService.updatePlan).mockResolvedValue({ id: 'rka-yys' } as any);
    const { req, res } = mockReqRes({
      user: as('YAYASAN_KETUA') as any,
      params: { id: 'rka-yys' } as any,
      body: { description: 'Baseline IKU masuk batang tubuh.' },
    });
    await run(perencanaanController.updatePlan, req, res);
    expect(perencanaanService.updatePlan).toHaveBeenCalledWith('rka-yys', { description: 'Baseline IKU masuk batang tubuh.' });
  });

  it.each([
    ['sedang direviu Pengawas', { status: 'DRAFT', reviewStage: 'DIREVIU_PENGAWAS' }],
    ['menunggu keputusan Pembina', { status: 'PROPOSED', reviewStage: 'DIAJUKAN_PEMBINA' }],
    ['sudah ditetapkan', { status: 'APPROVED', reviewStage: 'DITETAPKAN' }],
    ['sedang berjalan', { status: 'IN_PROGRESS', reviewStage: null }],
  ])('dokumen yang %s tidak dapat dihapus', async (_label, over) => {
    // Menghapusnya ikut menghapus riwayat pengesahannya (onDelete: Cascade).
    vi.mocked(perencanaanService.getPlanForAuth).mockResolvedValue({ ...plan, ...over } as any);
    const { req, res } = mockReqRes({ user: as('YAYASAN_KETUA') as any, params: { id: 'rka-yys' } as any });
    await expect(run(perencanaanController.deletePlan, req, res)).rejects.toThrowError(/Hanya draf/);
    expect(perencanaanService.deletePlan).not.toHaveBeenCalled();
  });

  it('draf yang belum diajukan dapat dihapus penyusunnya', async () => {
    const { req, res } = mockReqRes({ user: as('YAYASAN_KETUA') as any, params: { id: 'rka-yys' } as any });
    await run(perencanaanController.deletePlan, req, res);
    expect(perencanaanService.deletePlan).toHaveBeenCalledWith('rka-yys');
  });
});
