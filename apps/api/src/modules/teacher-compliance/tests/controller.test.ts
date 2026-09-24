import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../teacher-compliance.service', () => ({
  getComplianceByTeacher: vi.fn(),
  findTeacherById: vi.fn(),
  isNikTaken: vi.fn(),
  updateCompliance: vi.fn(),
  getCompletenessReport: vi.fn(),
  getSimtunReady: vi.fn(),
  getCertificationReport: vi.fn(),
  bulkUpdate: vi.fn(),
}));

import * as controller from '../teacher-compliance.controller';
import * as service from '../teacher-compliance.service';

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

describe('teacher-compliance controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getByTeacher: 404 when the teacher does not exist', async () => {
    (service.getComplianceByTeacher as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { teacherId: 'x' } as any });
    await run(controller.getByTeacher, req, res);
    expect((res as any).statusCode).toBe(404);
  });

  it('update: 400 when the new NIK belongs to another teacher', async () => {
    (service.findTeacherById as any).mockResolvedValue({ id: 't1', nik: 'old' });
    (service.isNikTaken as any).mockResolvedValue(true);
    const { req, res } = mockReqRes({
      params: { teacherId: 't1' } as any,
      body: { nik: 'dupe' } as any,
    });
    await run(controller.update, req, res);
    expect((res as any).statusCode).toBe(400);
    expect((res as any).jsonPayload.message).toBe('NIK already exists');
    expect(service.updateCompliance).not.toHaveBeenCalled();
  });

  it('update: persists and echoes the updated record', async () => {
    (service.findTeacherById as any).mockResolvedValue({ id: 't1', nik: 'n' });
    (service.updateCompliance as any).mockResolvedValue({ id: 't1', pangkat: 'IIIa' });
    const { req, res } = mockReqRes({
      params: { teacherId: 't1' } as any,
      body: { pangkat: 'IIIa' } as any,
    });
    await run(controller.update, req, res);
    expect(service.updateCompliance).toHaveBeenCalledWith('t1', { pangkat: 'IIIa' });
    expect((res as any).jsonPayload.data).toEqual({ id: 't1', pangkat: 'IIIa' });
  });

  it('bulkUpdate: 400 when the updates array is empty', async () => {
    const { req, res } = mockReqRes({ body: { updates: [] } as any });
    await run(controller.bulkUpdate, req, res);
    expect((res as any).statusCode).toBe(400);
    expect(service.bulkUpdate).not.toHaveBeenCalled();
  });
});
