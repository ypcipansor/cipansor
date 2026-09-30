import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../hr.service', () => ({
  selfCheckIn: vi.fn(),
  selfCheckOut: vi.fn(),
  getMyAttendance: vi.fn(),
  resolveStaffIdForUser: vi.fn(),
  resolveDelegatedStaffId: vi.fn(),
  scopedUnitId: vi.fn((_user: unknown, requested?: string | null) => requested ?? null),
}));

import * as service from '../hr.service';
import { selfCheckIn, selfCheckOut, getMyAttendanceToday } from '../attendance-settings.controller';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1', role: 'STAFF', roleCode: 'SDIT_TATA_USAHA', unitId: null },
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
  const next = vi.fn();
  await handler(req, res, next);
  return next;
}

beforeEach(() => {
  vi.clearAllMocks();
  (service.resolveStaffIdForUser as any).mockResolvedValue('staff-self');
  (service.resolveDelegatedStaffId as any).mockResolvedValue('staff-other');
  (service.selfCheckIn as any).mockResolvedValue({ lateMinutes: 0, withinRadius: true });
  (service.selfCheckOut as any).mockResolvedValue({ withinRadius: true });
  (service.getMyAttendance as any).mockResolvedValue({ date: '2026-03-02', canCheckIn: true });
});

describe('self attendance — whose row may be written', () => {
  it('a caller with no staffId is pinned to their own Staff row', async () => {
    const { req, res } = mockReqRes({ body: { latitude: -6.5, longitude: 106.8 } });
    await run(selfCheckIn, req, res);

    expect(service.resolveStaffIdForUser).toHaveBeenCalledWith('user-1');
    expect(service.selfCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-self' })
    );
  });

  it('a caller naming another staff member is delegated to the service guard', async () => {
    const { req, res } = mockReqRes({
      body: { staffId: '11111111-1111-4111-8111-111111111111' },
    });
    await run(selfCheckIn, req, res);

    expect(service.resolveDelegatedStaffId).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1' }),
      '11111111-1111-4111-8111-111111111111'
    );
    expect(service.selfCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-other' })
    );
  });

  it('a refused delegation never reaches the write', async () => {
    (service.resolveDelegatedStaffId as any).mockRejectedValue(
      Object.assign(new Error('Hanya admin unit'), { code: 'FORBIDDEN' })
    );
    const { req, res } = mockReqRes({
      body: { staffId: '11111111-1111-4111-8111-111111111111' },
    });
    const next = await run(selfCheckIn, req, res);

    expect(service.selfCheckIn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('check-out applies the same rule as check-in', async () => {
    const { req, res } = mockReqRes({
      body: { staffId: '11111111-1111-4111-8111-111111111111' },
    });
    await run(selfCheckOut, req, res);

    expect(service.resolveDelegatedStaffId).toHaveBeenCalled();
    expect(service.selfCheckOut).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-other' })
    );
  });

  it('a caller with no Staff profile surfaces the not-found', async () => {
    (service.resolveStaffIdForUser as any).mockRejectedValue(
      Object.assign(new Error('Profil pegawai'), { code: 'NOT_FOUND' })
    );
    const { req, res } = mockReqRes();
    const next = await run(selfCheckIn, req, res);

    expect(service.selfCheckIn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('getMyAttendanceToday', () => {
  it('asks for the WIB day, not the container day', async () => {
    const { req, res } = mockReqRes();
    await run(getMyAttendanceToday, req, res);

    const day = (service.getMyAttendance as any).mock.calls[0][1];
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day).toBe(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }));
  });
});
