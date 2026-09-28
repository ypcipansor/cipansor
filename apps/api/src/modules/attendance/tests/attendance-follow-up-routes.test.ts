import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Who reaches Tindak Lanjut Absensi: the people who can be a wali kelas or a
// musyrif — whose absences they are is the service's question
// (attendance-follow-up.test.ts). The path is static and must not be taken
// for an attendance id; the body is the shared contract.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../attendance.service', () => ({ attendanceService: { findById: vi.fn() } }));
vi.mock('../attendance-follow-up.service', () => ({
  listFollowUps: vi.fn(async () => []),
  recordFollowUp: vi.fn(async () => ({ attendanceId: 'a-1' })),
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import attendanceRoutes from '../attendance.routes';
import { attendanceService } from '../attendance.service';
import { listFollowUps, recordFollowUp } from '../attendance-follow-up.service';

const app = express();
app.use(express.json());
app.use('/attendance', attendanceRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation(((roleCode: string) => ({
    type: 'access',
    permissions: [],
    sub: `u-${roleCode}`,
    roleCode,
    unitId: 'unit-sd',
  })) as unknown as typeof verifyToken);
});

const RECORD = '33333333-3333-4333-8333-333333333333';
const as = (roleCode: string) => ({ Authorization: `Bearer ${roleCode}` });

describe('GET /attendance/follow-ups', () => {
  it.each(['SDIT_GURU', 'SMPIT_GURU', 'MUSYRIF', 'USTADZ'])(
    '%s reaches the list, as themselves',
    async (roleCode) => {
      const res = await request(app).get('/attendance/follow-ups').set(as(roleCode));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(listFollowUps).toHaveBeenCalledWith(
        expect.objectContaining({ sub: `u-${roleCode}`, roleCode })
      );
      expect(attendanceService.findById).not.toHaveBeenCalled();
    }
  );

  it.each(['SDIT_ORANG_TUA', 'SDIT_SISWA', 'SDIT_TATA_USAHA', 'YAYASAN_KETUA'])(
    '%s is refused: 403',
    async (roleCode) => {
      const res = await request(app).get('/attendance/follow-ups').set(as(roleCode));
      expect(res.status).toBe(403);
      expect(listFollowUps).not.toHaveBeenCalled();
    }
  );
});

describe('POST /attendance/:id/follow-ups', () => {
  const post = (roleCode: string, body: object, id = RECORD) =>
    request(app).post(`/attendance/${id}/follow-ups`).set(as(roleCode)).send(body);

  it('records a contact for a wali kelas: 201', async () => {
    const res = await post('SDIT_GURU', {
      channel: 'PHONE',
      outcome: 'ILL',
      note: ' demam ',
    });
    expect(res.status).toBe(201);
    expect(recordFollowUp).toHaveBeenCalledWith(
      RECORD,
      { channel: 'PHONE', outcome: 'ILL', note: 'demam' },
      expect.objectContaining({ sub: 'u-SDIT_GURU' })
    );
  });

  it.each([
    ['no outcome', { channel: 'PHONE' }],
    ['an outcome outside the list', { channel: 'PHONE', outcome: 'PRESENT' }],
    ['a channel outside the list', { channel: 'SMS', outcome: 'ILL' }],
    ['a note over 1000 characters', { channel: 'PHONE', outcome: 'ILL', note: 'x'.repeat(1001) }],
  ])('refuses %s: 400', async (_what, body) => {
    const res = await post('SDIT_GURU', body);
    expect(res.status).toBe(400);
    expect(recordFollowUp).not.toHaveBeenCalled();
  });

  it('refuses an id that is not one: 400', async () => {
    const res = await post('SDIT_GURU', { channel: 'PHONE', outcome: 'ILL' }, 'not-an-id');
    expect(res.status).toBe(400);
    expect(recordFollowUp).not.toHaveBeenCalled();
  });

  it('refuses a wali santri: 403', async () => {
    const res = await post('SDIT_ORANG_TUA', { channel: 'PHONE', outcome: 'ILL' });
    expect(res.status).toBe(403);
    expect(recordFollowUp).not.toHaveBeenCalled();
  });
});
