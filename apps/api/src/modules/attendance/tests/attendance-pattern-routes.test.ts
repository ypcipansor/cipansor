import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Who reaches Pola Kehadiran: the people who can be a wali kelas, a guru BK or
// a musyrif — whose santri they are told about is the service's question
// (attendance-pattern.test.ts). The path is static and must not be taken for
// an attendance id.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../attendance.service', () => ({ attendanceService: { findById: vi.fn() } }));
vi.mock('../attendance-pattern.service', () => ({ listPatterns: vi.fn(async () => []) }));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import attendanceRoutes from '../attendance.routes';
import { attendanceService } from '../attendance.service';
import { listPatterns } from '../attendance-pattern.service';

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
    unitId: 'unit-smp',
  })) as unknown as typeof verifyToken);
});

const as = (roleCode: string) => ({ Authorization: `Bearer ${roleCode}` });

describe('GET /attendance/patterns', () => {
  it.each(['SMPIT_GURU', 'SMPIT_GURU_BK', 'SDIT_GURU', 'MUSYRIF'])(
    '%s reaches the list, as themselves',
    async (roleCode) => {
      const res = await request(app).get('/attendance/patterns').set(as(roleCode));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(listPatterns).toHaveBeenCalledWith(
        expect.objectContaining({ sub: `u-${roleCode}`, roleCode, unitId: 'unit-smp' })
      );
      expect(attendanceService.findById).not.toHaveBeenCalled();
    }
  );

  it.each(['SMPIT_ORANG_TUA', 'SMPIT_SISWA', 'SMPIT_TATA_USAHA', 'YAYASAN_KETUA'])(
    '%s is refused: 403',
    async (roleCode) => {
      const res = await request(app).get('/attendance/patterns').set(as(roleCode));
      expect(res.status).toBe(403);
      expect(listPatterns).not.toHaveBeenCalled();
    }
  );
});
