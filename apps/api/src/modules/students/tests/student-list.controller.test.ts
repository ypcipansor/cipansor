import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../student.service', () => ({
  studentService: { findAll: vi.fn() },
}));

import * as controller from '../student.controller';
import { studentService } from '../student.service';

/**
 * `list` must read the value `validateQuery` produced, never the raw
 * `req.query`. The fallback `(res.locals.validatedQuery || req.query)` let a
 * raw, unvalidated `gender` reach the service and also discarded the schema's
 * page/limit defaults — CodeQL's `js/sensitive-get-query` followed the raw
 * query into the Prisma `where`. These tests pin the handler to
 * `res.locals.validatedQuery` alone.
 */

function mockReqRes(validatedQuery: unknown) {
  const req = {
    query: { gender: 'MALE', page: '3' },
    user: { role: 'ADMIN', roleCode: 'ADMIN', unitId: 'unit-1' },
  } as unknown as Request;

  const res = {
    locals: { validatedQuery },
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
  } as unknown as Response & { jsonPayload: any };

  return { req, res };
}

async function run(handler: any, req: Request, res: Response) {
  await handler(req, res, vi.fn());
}

describe('students controller — list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the validated query (with schema defaults) to the service', async () => {
    (studentService.findAll as any).mockResolvedValue({
      students: [{ id: 's1' }],
      pagination: { page: 1, limit: 20 },
    });
    const validated = { page: 1, limit: 20, gender: 'FEMALE' };
    const { req, res } = mockReqRes(validated);

    await run(controller.list, req, res);

    expect(studentService.findAll).toHaveBeenCalledWith(
      validated,
      expect.objectContaining({ roleCode: 'ADMIN', unitId: 'unit-1' })
    );
    expect((res as any).jsonPayload).toEqual({
      success: true,
      data: [{ id: 's1' }],
      meta: { pagination: { page: 1, limit: 20 } },
    });
  });

  it('does not fall back to the raw req.query when validatedQuery is absent', async () => {
    (studentService.findAll as any).mockResolvedValue({
      students: [],
      pagination: { page: 1, limit: 20 },
    });
    const { req, res } = mockReqRes(undefined);

    await run(controller.list, req, res);

    // The raw query carries `gender: 'MALE', page: '3'`; none of it may reach
    // the service once validation produced nothing.
    const passed = (studentService.findAll as any).mock.calls[0][0];
    expect(passed).not.toBe(req.query);
    expect(passed).toBeUndefined();
  });
});
