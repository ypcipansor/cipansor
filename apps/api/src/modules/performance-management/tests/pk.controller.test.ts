import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../pk.service', () => ({
  pkService: {
    getSupervisors: vi.fn(),
    assertUnitScope: vi.fn(),
    createIndicator: vi.fn(),
    updateIndicator: vi.fn(),
    deleteIndicator: vi.fn(),
    updatePK: vi.fn(),
  },
}));

vi.mock('../pk.validation', () => ({
  createPKSchema: { parse: vi.fn((x) => x) },
  updatePKSchema: { parse: vi.fn((x) => x) },
  rejectPKSchema: { parse: vi.fn((x) => x) },
  createPKIndicatorSchema: { parse: vi.fn((x) => x) },
  updatePKIndicatorSchema: { parse: vi.fn((x) => x) },
}));

import * as pkController from '../pk.controller';
import { pkService } from '../pk.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) {
      (this as any).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
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

describe('pkController.listSupervisors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes req.user caller context to pkService.getSupervisors', async () => {
    const mockSupervisors = [{ id: 'sup-1', name: 'Ahmad Boss' }];
    vi.mocked(pkService.getSupervisors).mockResolvedValue(mockSupervisors as any);

    const userObj = { sub: 'user-123', roleCode: 'SDIT_GURU', unitId: 'unit-sdit' };
    const { req, res } = mockReqRes({ user: userObj as any });

    await run(pkController.listSupervisors, req, res);

    // Id pemanggil ikut dikirim: dari peran ORANG ITU-lah saran atasan
    // penilai dihitung, jadi konteks peran saja tidak cukup.
    expect(pkService.getSupervisors).toHaveBeenCalledWith(userObj, 'user-123');
    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload.data).toEqual(mockSupervisors);
  });
});

describe('pkController.createIndicator — unit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pkService.createIndicator).mockResolvedValue({ id: 'ind-1' } as any);
  });

  it('memanggil assertUnitScope({ pkId }) sebelum menulis indikator', async () => {
    const { req, res } = mockReqRes({
      body: { pkId: 'pk-lain', title: 'T', target: 1, unit: '%', weight: 20 },
    });

    await run(pkController.createIndicator, req, res);

    expect(pkService.assertUnitScope).toHaveBeenCalledWith(
      { pkId: 'pk-lain' },
      expect.objectContaining({ roleCode: 'SDIT_GURU', unitId: 'unit-sd' })
    );
    expect(pkService.createIndicator).toHaveBeenCalledTimes(1);
  });

  it('tidak memanggil service bila unit scope ditolak', async () => {
    vi.mocked(pkService.assertUnitScope).mockRejectedValue(new Error('unit lain'));

    const { req, res } = mockReqRes({
      body: { pkId: 'pk-lain', title: 'T', target: 1, unit: '%', weight: 20 },
    });

    await expect(run(pkController.createIndicator, req, res)).rejects.toThrowError();

    expect(pkService.createIndicator).not.toHaveBeenCalled();
  });
});

describe('pkController.updatePK — menyerahkan scope penuh ke service (Bug regresi #1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pkService.assertUnitScope).mockResolvedValue(undefined);
    vi.mocked(pkService.updatePK).mockResolvedValue({ id: 'pk-1' } as any);
  });

  it('memanggil assertUnitScope({ pkId }) lalu menyerahkan caller utuh ke updatePK', async () => {
    const changedBody = { notes: 'revisi', strategicPlanId: 'plan-baru' };
    const userObj = { sub: 'user-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' };
    const { req, res } = mockReqRes({
      params: { id: 'pk-1' },
      body: changedBody,
      user: userObj as any,
    });
    vi.mocked(pkService.updatePK).mockResolvedValue({ id: 'pk-1' } as any);

    await run(pkController.updatePK, req, res);

    expect(pkService.assertUnitScope).toHaveBeenCalledWith(
      { pkId: 'pk-1' },
      expect.objectContaining({ roleCode: 'SDIT_GURU', unitId: 'unit-sd' })
    );
    // Caller utuh (bukan sekadar { id, isAdmin }) diteruskan agar updatePK dapat
    // memvalidasi scope rencana Tujuan yang baru.
    expect(pkService.updatePK).toHaveBeenCalledWith(
      'pk-1',
      expect.objectContaining({ id: 'user-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' }),
      changedBody
    );
    expect(res.statusCode).toBe(200);
  });

  it('tidak meneruskan ke updatePK bila assertUnitScope menolak unit', async () => {
    vi.mocked(pkService.assertUnitScope).mockRejectedValue(new Error('unit lain'));
    const { req, res } = mockReqRes({ params: { id: 'pk-1' }, body: { notes: 'x' } });

    await expect(run(pkController.updatePK, req, res)).rejects.toThrowError();
    expect(pkService.updatePK).not.toHaveBeenCalled();
  });
});
