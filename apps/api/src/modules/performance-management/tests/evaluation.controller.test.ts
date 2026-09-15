import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../pk.service', () => ({
  pkService: {
    assertUnitScope: vi.fn(),
    assertAccess: vi.fn(),
  },
}));

vi.mock('../evaluation.service', () => ({
  evaluationService: {
    createEvaluation: vi.fn(),
    getEvaluationById: vi.fn(),
    updateIndicatorRealization: vi.fn(),
    updateBehaviorScore: vi.fn(),
  },
}));

vi.mock('../evaluation.validation', () => ({
  createEvaluationSchema: { parse: vi.fn((x) => x) },
  updateIndicatorRealizationSchema: { parse: vi.fn((x) => x) },
  updateBehaviorScoreSchema: { parse: vi.fn((x) => x) },
  createBehavioralValueSchema: { parse: vi.fn((x) => x) },
  updateBehavioralValueSchema: { parse: vi.fn((x) => x) },
  approveEvaluationSchema: { parse: vi.fn((x) => x) },
}));

import * as evaluationController from '../evaluation.controller';
import { pkService } from '../pk.service';
import { evaluationService } from '../evaluation.service';

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

describe('evaluationController.createEvaluation — unit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluationService.createEvaluation).mockResolvedValue({ id: 'ev-1' } as any);
  });

  it('memanggil assertUnitScope({ pkId }) sebelum menulis evaluasi', async () => {
    const { req, res } = mockReqRes({ body: { pkId: 'pk-lain' } });

    await run(evaluationController.createEvaluation, req, res);

    expect(pkService.assertUnitScope).toHaveBeenCalledWith(
      { pkId: 'pk-lain' },
      expect.objectContaining({ roleCode: 'SDIT_GURU', unitId: 'unit-sd' }),
    );
    expect(evaluationService.createEvaluation).toHaveBeenCalledTimes(1);
  });

  it('tidak memanggil service bila unit scope ditolak', async () => {
    vi.mocked(pkService.assertUnitScope).mockRejectedValue(new Error('unit lain'));

    const { req, res } = mockReqRes({ body: { pkId: 'pk-lain' } });

    await expect(run(evaluationController.createEvaluation, req, res)).rejects.toThrowError();

    expect(evaluationService.createEvaluation).not.toHaveBeenCalled();
  });
});
