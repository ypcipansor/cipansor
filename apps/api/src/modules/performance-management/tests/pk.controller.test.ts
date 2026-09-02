import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../pk.service', () => ({
  pkService: {
    getSupervisors: vi.fn(),
  },
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

    expect(pkService.getSupervisors).toHaveBeenCalledWith(userObj);
    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload.data).toEqual(mockSupervisors);
  });
});
