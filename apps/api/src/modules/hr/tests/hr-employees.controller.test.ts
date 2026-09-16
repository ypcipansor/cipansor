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

vi.mock('../../../middleware/auth', () => ({
  requireUser: vi.fn(() => ({
    id: 'actor-1',
    roleCode: 'SDIT_ADMIN',
    unitId: 'unit-1',
    permissions: [],
  })),
}));

import * as service from '../hr.service';
import { getEmployees, getEmployeeById } from '../hr.controller';

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.locals = {};
  return res;
}

/**
 * `asyncHandler` returns a void launcher: the handler's own promise (and any
 * `res.json`/`next` it calls) settles on a later microtask. Flush before
 * asserting.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('hr.controller employee reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getEmployees returns the paginated envelope and forwards the actor', async () => {
    (service.getEmployeeDirectory as any).mockResolvedValue({
      data: [{ id: 'user-1', fullName: 'Agus' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const req = {
      query: { status: 'ACTIVE' },
    } as unknown as Request;
    const res = makeRes();
    // The route's validateQuery middleware normally populates this.
    res.locals = { validatedQuery: { page: 1, limit: 20, status: 'ACTIVE' } };

    getEmployees(req, res, vi.fn());
    await flush();

    // The actor is what scopes the directory and gates the sensitive columns.
    expect(service.getEmployeeDirectory).toHaveBeenCalledWith(
      { page: 1, limit: 20, status: 'ACTIVE' },
      { id: 'actor-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'user-1', fullName: 'Agus' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('getEmployeeById returns the employee from the service and forwards the actor', async () => {
    (service.getEmployeeById as any).mockResolvedValue({ id: 'user-1' });
    const req = { params: { id: 'user-1' } } as unknown as Request;
    const res = makeRes();

    getEmployeeById(req, res, vi.fn());
    await flush();

    expect(service.getEmployeeById).toHaveBeenCalledWith('user-1', {
      id: 'actor-1',
      roleCode: 'SDIT_ADMIN',
      unitId: 'unit-1',
    });
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

    getEmployeeById(req, res, next);
    // asyncHandler settles on a later microtask than the call itself, so let
    // the rejection propagate to `next` before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
  });
});