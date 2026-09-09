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
    updatePlan: vi.fn(),
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
      user: ownUnitAdmin,
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
});