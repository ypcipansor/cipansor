import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// A student's counselling history is a staff page. A wali reads their own
// child's shared sessions through /parent/children/:studentId/counseling,
// which checks the relationship; this route checks only the unit.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../counseling.service', () => ({
  counselingService: {
    getStudentHistory: vi.fn(async () => []),
    getStatistics: vi.fn(async () => ({})),
  },
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import counselingRoutes from '../counseling.routes';
import { counselingService } from '../counseling.service';

const app = express();
app.use(express.json());
app.use('/counseling', counselingRoutes);
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

const history = (roleCode: string) =>
  request(app)
    .get('/counseling/students/22222222-2222-4222-8222-222222222222/history')
    .set('Authorization', `Bearer ${roleCode}`);

describe('GET /counseling/students/:studentId/history', () => {
  it.each(['SMPIT_ORANG_TUA', 'SDIT_ORANG_TUA'])('%s is refused (403)', async (roleCode) => {
    expect((await history(roleCode)).status).toBe(403);
    expect(counselingService.getStudentHistory).not.toHaveBeenCalled();
  });

  it.each(['SMPIT_GURU', 'SMPIT_GURU_BK', 'SMPIT_KEPALA_SEKOLAH'])(
    '%s reaches it',
    async (roleCode) => {
      expect((await history(roleCode)).status).toBe(200);
    }
  );
});

describe('GET /counseling/statistics', () => {
  const stats = (roleCode: string) =>
    request(app).get('/counseling/statistics').set('Authorization', `Bearer ${roleCode}`);

  it.each(['SMPIT_ADMIN', 'SMPIT_GURU', 'SMPIT_GURU_BK', 'SMAQ_GURU_BK', 'SMPIT_KEPALA_SEKOLAH'])(
    '%s reads the counts of what it is sent',
    async (roleCode) => {
      expect((await stats(roleCode)).status).toBe(200);
    }
  );

  it('a wali does not (403)', async () => {
    expect((await stats('SMPIT_ORANG_TUA')).status).toBe(403);
  });
});
