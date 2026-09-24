import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../payroll.service', () => ({
  salaryComponentService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    seedDefaults: vi.fn(),
  },
  employeeSalaryService: {
    list: vi.fn(),
    getByStaffId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  payrollPeriodService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    markAsPaid: vi.fn(),
    cancel: vi.fn(),
    delete: vi.fn(),
  },
  payrollService: {
    list: vi.fn(),
    getById: vi.fn(),
    generate: vi.fn(),
    adjustItem: vi.fn(),
    getSummary: vi.fn(),
  },
}));

import * as controller from '../payroll.controller';
import { salaryComponentService, payrollPeriodService, payrollService } from '../payroll.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { id: 'user-1' },
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

describe('payroll controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listComponents: returns the service list', async () => {
    (salaryComponentService.list as any).mockResolvedValue([{ id: 'c1' }]);
    const { req, res } = mockReqRes();
    await run(controller.listComponents, req, res);
    expect((res as any).jsonPayload).toEqual({ success: true, data: [{ id: 'c1' }] });
  });

  it('getComponent: 404 when missing', async () => {
    (salaryComponentService.getById as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { id: 'x' } as any });
    await run(controller.getComponent, req, res);
    expect((res as any).statusCode).toBe(404);
  });

  it('createPeriod: passes the authenticated user id and returns 201', async () => {
    (payrollPeriodService.create as any).mockResolvedValue({ id: 'p1' });
    const { req, res } = mockReqRes({ body: { month: 1, year: 2026 } as any });
    await run(controller.createPeriod, req, res);
    expect(payrollPeriodService.create).toHaveBeenCalledWith({ month: 1, year: 2026 }, 'user-1');
    expect((res as any).statusCode).toBe(201);
  });

  it('generate: reports created/updated counts in the message', async () => {
    (payrollService.generate as any).mockResolvedValue({ created: 3, updated: 1 });
    const { req, res } = mockReqRes({ body: { periodId: 'p1' } as any });
    await run(controller.generate, req, res);
    expect((res as any).jsonPayload.message).toBe('3 slip gaji dibuat, 1 diperbarui');
  });
});
