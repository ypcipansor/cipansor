import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {},
    staff: {},
    teacher: {},
    staffAttendance: {},
  },
}));

vi.mock('../hr.service', () => ({
  getEmployeeDirectory: vi.fn(),
  getEmployeeById: vi.fn(),
}));

import * as service from '../hr.service';
import { getEmployees, getEmployeeById } from '../hr.controller';

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

describe('hr.controller employee reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getEmployees returns the paginated envelope from the service', async () => {
    (service.getEmployeeDirectory as any).mockResolvedValue({
      data: [{ id: 'user-1', fullName: 'Agus' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const req = {
      query: { status: 'ACTIVE' },
    } as unknown as Request;
    (req as any).res = undefined;
    const res = makeRes();
    // The route's validateQuery middleware normally populates this.
    (res as any).locals = { validatedQuery: { page: 1, limit: 20, status: 'ACTIVE' } };

    await getEmployees(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'user-1', fullName: 'Agus' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('getEmployeeById returns the employee from the service', async () => {
    (service.getEmployeeById as any).mockResolvedValue({ id: 'user-1' });
    const req = { params: { id: 'user-1' } } as unknown as Request;
    const res = makeRes();

    await getEmployeeById(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'user-1' },
    });
  });

  it('getEmployeeById routes a missing employee to next as a 404', async () => {
    (service.getEmployeeById as any).mockResolvedValue(null);
    const req = { params: { id: 'missing' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await getEmployeeById(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
  });
});