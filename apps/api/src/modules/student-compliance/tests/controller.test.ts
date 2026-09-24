import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../student-compliance.service', () => ({
  getComplianceByStudent: vi.fn(),
  updateCompliance: vi.fn(),
  getCompletenessReport: vi.fn(),
  getDapodikReady: vi.fn(),
  bulkUpdate: vi.fn(),
}));

import * as controller from '../student-compliance.controller';
import * as service from '../student-compliance.service';

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
  const next = vi.fn();
  await handler(req, res, next);
  return next;
}

// Pemeriksaan isi body (skema ketat) ada di rute — lihat compliance-schema.test.ts;
// 404/409/wilayah ada di service — lihat update-compliance.test.ts. Controller
// hanya meneruskan, dan itu yang diuji di sini.
const tu = { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: 'unit-sdit' };

describe('student-compliance controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getByStudent: 404 when the student does not exist', async () => {
    (service.getComplianceByStudent as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { studentId: 'x' } as any, user: tu as any });
    await run(controller.getByStudent, req, res);
    expect((res as any).statusCode).toBe(404);
    // Pemanggil ikut diteruskan: lingkup unitnya diputuskan service.
    expect(service.getComplianceByStudent).toHaveBeenCalledWith('x', tu);
  });

  it('update: meneruskan body tervalidasi ke service dan mengembalikan hasilnya', async () => {
    (service.updateCompliance as any).mockResolvedValue({ id: 's1', nisn: '0012345678' });
    const { req, res } = mockReqRes({
      params: { studentId: 's1' } as any,
      body: { nisn: '0012345678' } as any,
      user: tu as any,
    });
    await run(controller.update, req, res);
    expect(service.updateCompliance).toHaveBeenCalledWith('s1', { nisn: '0012345678' }, tu);
    expect((res as any).jsonPayload.data).toEqual({ id: 's1', nisn: '0012345678' });
  });

  it('update: galat service (mis. 409 NISN terpakai) diteruskan ke middleware galat', async () => {
    const galat = Object.assign(new Error('NISN ini sudah tercatat pada santri lain.'), {
      code: 'CONFLICT',
    });
    (service.updateCompliance as any).mockRejectedValue(galat);
    const { req, res } = mockReqRes({
      params: { studentId: 's1' } as any,
      body: { nisn: '0099999999' } as any,
      user: tu as any,
    });
    const next = await run(controller.update, req, res);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(galat));
  });

  it('bulkUpdate: meneruskan baris dan melaporkan jumlah sukses/gagal', async () => {
    (service.bulkUpdate as any).mockResolvedValue({
      successful: [{ studentId: 's1', success: true }],
      failed: [{ studentId: 's2', error: 'NISN ini sudah tercatat pada santri lain.' }],
    });
    const updates = [
      { studentId: 's1', rt: '001' },
      { studentId: 's2', nisn: '0012345678' },
    ];
    const { req, res } = mockReqRes({ body: { updates } as any, user: tu as any });
    await run(controller.bulkUpdate, req, res);
    expect(service.bulkUpdate).toHaveBeenCalledWith(updates, tu);
    expect((res as any).jsonPayload.message).toBe('1 santri disimpan, 1 gagal');
  });
});
