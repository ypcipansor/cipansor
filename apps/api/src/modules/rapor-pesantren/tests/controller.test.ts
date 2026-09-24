import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../rapor-pesantren.service', () => ({
  getRaporConfig: vi.fn(),
  saveRaporConfig: vi.fn(),
  generateRaporPesantren: vi.fn(),
  generateBatchRaporPesantren: vi.fn(),
  getLegerPesantren: vi.fn(),
  listRaporPesantren: vi.fn(),
  getRaporPesantrenById: vi.fn(),
  updateRaporPesantren: vi.fn(),
  deleteRaporPesantren: vi.fn(),
}));

import * as controller from '../rapor-pesantren.controller';
import * as service from '../rapor-pesantren.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = { query: {}, params: {}, body: {}, ...overrides } as unknown as Request;
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
  await handler(req, res, vi.fn());
}

describe('rapor-pesantren controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generate: returns 201 with the generated rapor', async () => {
    (service.generateRaporPesantren as any).mockResolvedValue({ id: 'r1' });
    const { req, res } = mockReqRes({ body: { studentId: 's1' } as any });
    await run(controller.generate, req, res);
    expect((res as any).statusCode).toBe(201);
    expect((res as any).jsonPayload.data).toEqual({ id: 'r1' });
  });

  it('generateBatch: reports success/total in the message', async () => {
    (service.generateBatchRaporPesantren as any).mockResolvedValue({ success: 8, total: 10 });
    const { req, res } = mockReqRes({ body: {} as any });
    await run(controller.generateBatch, req, res);
    expect((res as any).jsonPayload.message).toBe('Generated 8/10 rapor');
  });

  it('getById: 404 when the rapor is missing', async () => {
    (service.getRaporPesantrenById as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { id: 'x' } as any });
    await run(controller.getById, req, res);
    expect((res as any).statusCode).toBe(404);
  });

  it('list: returns a paginated envelope', async () => {
    (service.listRaporPesantren as any).mockResolvedValue({
      data: [{ id: 'r1' }],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const { req, res } = mockReqRes();
    await run(controller.list, req, res);
    expect((res as any).jsonPayload).toMatchObject({
      success: true,
      data: [{ id: 'r1' }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
  });
});
