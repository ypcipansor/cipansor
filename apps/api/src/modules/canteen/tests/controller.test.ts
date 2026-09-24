import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../canteen.service', () => ({
  categoryService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getBusinessEfficiency: vi.fn(),
  },
  itemService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getLowStockItems: vi.fn(),
  },
  transactionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    getStats: vi.fn(),
  },
  stockMovementService: { getAll: vi.fn(), create: vi.fn() },
}));

vi.mock('../../../utils/resolve-unit-id', () => ({
  resolveUnitId: vi.fn(),
  isSuperAdminUser: vi.fn(),
}));

import * as controller from '../canteen.controller';
import { categoryService, transactionService } from '../canteen.service';
import { resolveUnitId, isSuperAdminUser } from '../../../utils/resolve-unit-id';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1' },
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
  await handler(req, res, vi.fn());
}

describe('canteen controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listCategories: 400 when no unit and not super admin', async () => {
    (resolveUnitId as any).mockReturnValue(undefined);
    (isSuperAdminUser as any).mockReturnValue(false);
    const { req, res } = mockReqRes();
    await run(controller.listCategories, req, res);
    expect((res as any).statusCode).toBe(400);
    expect((res as any).jsonPayload.success).toBe(false);
  });

  it('listCategories: super admin may list across units (no unit)', async () => {
    (resolveUnitId as any).mockReturnValue(undefined);
    (isSuperAdminUser as any).mockReturnValue(true);
    (categoryService.getAll as any).mockResolvedValue([{ id: 'c1' }]);
    const { req, res } = mockReqRes();
    await run(controller.listCategories, req, res);
    expect((res as any).statusCode).toBe(200);
    expect((res as any).jsonPayload.data).toEqual([{ id: 'c1' }]);
  });

  it('createTransaction: 400 when unit resolves but user id is missing', async () => {
    (resolveUnitId as any).mockReturnValue('unit-1');
    const { req, res } = mockReqRes({ user: {} as any });
    await run(controller.createTransaction, req, res);
    expect((res as any).statusCode).toBe(400);
    expect(transactionService.create).not.toHaveBeenCalled();
  });

  it('createTransaction: creates with unit + user and returns 201', async () => {
    (resolveUnitId as any).mockReturnValue('unit-1');
    (transactionService.create as any).mockResolvedValue({ id: 't1' });
    const { req, res } = mockReqRes({ body: { items: [] } as any });
    await run(controller.createTransaction, req, res);
    expect(transactionService.create).toHaveBeenCalledWith('unit-1', 'user-1', { items: [] });
    expect((res as any).statusCode).toBe(201);
  });
});
