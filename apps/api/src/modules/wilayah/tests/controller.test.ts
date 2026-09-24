import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../wilayah.service', () => ({
  listProvinces: vi.fn(),
  getProvinceById: vi.fn(),
  createProvince: vi.fn(),
  listRegencies: vi.fn(),
  getRegencyById: vi.fn(),
  createRegency: vi.fn(),
  listDistricts: vi.fn(),
  getDistrictById: vi.fn(),
  createDistrict: vi.fn(),
  listVillages: vi.fn(),
  getVillageById: vi.fn(),
  createVillage: vi.fn(),
}));

import * as controller from '../wilayah.controller';
import * as service from '../wilayah.service';

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

describe('wilayah controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listRegencies: forwards province + search filters', async () => {
    (service.listRegencies as any).mockResolvedValue([{ id: 'r1' }]);
    const { req, res } = mockReqRes({ query: { provinceId: 'p1', search: 'ban' } as any });
    await run(controller.listRegencies, req, res);
    expect(service.listRegencies).toHaveBeenCalledWith({ provinceId: 'p1', search: 'ban' });
    expect((res as any).jsonPayload.data).toEqual([{ id: 'r1' }]);
  });

  it('getVillage: 404 when the village is missing', async () => {
    (service.getVillageById as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { id: 'x' } as any });
    await run(controller.getVillage, req, res);
    expect((res as any).statusCode).toBe(404);
  });

  it('listVillages: surfaces the pagination envelope with numeric paging', async () => {
    (service.listVillages as any).mockResolvedValue({
      villages: [{ id: 'v1' }],
      pagination: { page: 2, limit: 50, total: 60, totalPages: 2 },
    });
    const { req, res } = mockReqRes({ query: { page: '2' } as any });
    await run(controller.listVillages, req, res);
    expect(service.listVillages).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 50 })
    );
    expect((res as any).jsonPayload.pagination.page).toBe(2);
  });

  it('createProvince: returns 201 with the created province', async () => {
    (service.createProvince as any).mockResolvedValue({ id: 'p1', name: 'Jawa Barat' });
    const { req, res } = mockReqRes({ body: { code: '32', name: 'Jawa Barat' } as any });
    await run(controller.createProvince, req, res);
    expect(service.createProvince).toHaveBeenCalledWith({ code: '32', name: 'Jawa Barat' });
    expect((res as any).statusCode).toBe(201);
  });
});
