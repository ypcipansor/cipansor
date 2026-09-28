import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../sanad-certificate.service', () => ({
  SanadCertificateService: { findAllSanadRecords: vi.fn() },
}));

import * as controller from '../sanad-certificate.controller';
import { SanadCertificateService } from '../sanad-certificate.service';

/**
 * `listSanadRecords` must read `res.locals.validatedQuery`, never the raw
 * `req.query`. The old `|| req.query` fallback dropped the schema's page/limit
 * defaults (a plain `?limit=50` then 500'd on `skip = NaN`) and let an
 * unvalidated `hasCertificate` reach the service — the path CodeQL's
 * `js/sensitive-get-query` reported.
 */

function mockReqRes(validatedQuery: unknown) {
  const req = {
    query: { hasCertificate: 'true', page: '4' },
    user: { role: 'ADMIN', roleCode: 'ADMIN', unitId: 'unit-1', sub: 'user-1' },
  } as unknown as Request;

  const res = {
    locals: { validatedQuery },
    jsonPayload: undefined as unknown,
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

describe('sanad-certificate controller — listSanadRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the validated query (with defaults) to the service', async () => {
    (SanadCertificateService.findAllSanadRecords as any).mockResolvedValue({
      records: [{ id: 'r1' }],
      pagination: { page: 1, limit: 20 },
    });
    const validated = { page: 1, limit: 20, hasCertificate: true };
    const { req, res } = mockReqRes(validated);

    await run(controller.listSanadRecords, req, res);

    expect(SanadCertificateService.findAllSanadRecords).toHaveBeenCalledWith(
      validated,
      expect.objectContaining({ userId: 'user-1' })
    );
    expect((res as any).jsonPayload).toEqual({
      success: true,
      data: [{ id: 'r1' }],
      pagination: { page: 1, limit: 20 },
    });
  });

  it('does not fall back to the raw req.query when validatedQuery is absent', async () => {
    (SanadCertificateService.findAllSanadRecords as any).mockResolvedValue({
      records: [],
      pagination: { page: 1, limit: 20 },
    });
    const { req, res } = mockReqRes(undefined);

    await run(controller.listSanadRecords, req, res);

    const passed = (SanadCertificateService.findAllSanadRecords as any).mock.calls[0][0];
    expect(passed).not.toBe(req.query);
    expect(passed).toBeUndefined();
  });
});
