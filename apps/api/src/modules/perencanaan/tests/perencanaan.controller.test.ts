import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/utils/resolve-unit-id', () => ({
  seesAllUnits: vi.fn(({ roleCode }: { roleCode?: string }) => roleCode === 'YAYASAN_KETUA' || roleCode === 'SUPER_ADMIN'),
}));

vi.mock('../perencanaan.service', () => ({
  perencanaanService: {
    getPlanForAuth: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    createObjective: vi.fn(),
    updateObjective: vi.fn(),
    deleteObjective: vi.fn(),
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
