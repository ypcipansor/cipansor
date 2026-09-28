import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Who reaches which daily-report route. Staff of a unit write and read; a wali
// reads and acknowledges (their own child's — the rows are the service's
// studentScope, tested in daily-report.service.test.ts); the yayasan organs,
// tata usaha and the treasurers have no part in a child's day.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
// The route guard reads persistent suspension state; access-control specs fake the
// account as usable and leave that enforcement to its own suite.
vi.mock('@/utils/user-suspension', () => ({ isUserSuspended: vi.fn(async () => false) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../daily-report.service', () => ({
  dailyReportService: {
    findAll: vi.fn(async () => ({ reports: [], pagination: {} })),
    findById: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
    bulkCreate: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    confirmByParent: vi.fn(async () => ({})),
    getStudentMonthlySummary: vi.fn(async () => ({})),
    getClassDailySummary: vi.fn(async () => ({})),
  },
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import dailyReportRoutes from '../daily-report.routes';
import { dailyReportService } from '../daily-report.service';

const app = express();
app.use(express.json());
app.use('/daily-report', dailyReportRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation(((roleCode: string) => ({
    type: 'access',
    permissions: [],
    sub: `u-${roleCode}`,
    roleCode,
    unitId: 'unit-tk',
  })) as unknown as typeof verifyToken);
});

const ID = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const REPORT = { studentId: STUDENT, reportDate: '2026-09-26' };

type Call = [method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object];
const send = (roleCode: string, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${roleCode}`);
  return body ? req.send(body) : req;
};

const READS: Array<[string, Call]> = [
  ['list', ['get', '/daily-report']],
  ['one report', ['get', `/daily-report/${ID}`]],
  ["a pupil's month", ['get', `/daily-report/summary/student?studentId=${STUDENT}`]],
];
const WRITES: Array<[string, Call]> = [
  ['make', ['post', '/daily-report', REPORT]],
  [
    'make for a class',
    ['post', '/daily-report/bulk', { reportDate: '2026-09-26', reports: [{ studentId: STUDENT }] }],
  ],
  ['change', ['put', `/daily-report/${ID}`, { healthNotes: 'Sehat' }]],
  ['remove', ['delete', `/daily-report/${ID}`]],
  ["a class's day", ['get', '/daily-report/summary/class']],
];
const CONFIRM: Call = ['post', `/daily-report/${ID}/confirm`, { parentFeedback: 'Terima kasih' }];

describe('staff of a unit', () => {
  it.each(['TKQ_GURU', 'SDIT_GURU', 'TKQ_KEPALA_SEKOLAH', 'TKQ_ADMIN', 'MUSYRIF', 'SUPER_ADMIN'])(
    '%s reads and writes',
    async (roleCode) => {
      for (const [what, call] of [...READS, ...WRITES]) {
        const res = await send(roleCode, call);
        expect([200, 201], `${roleCode} ${what}`).toContain(res.status);
      }
    }
  );

  it.each(['TKQ_GURU', 'TKQ_KEPALA_SEKOLAH'])(
    '%s does not acknowledge for a wali (403)',
    async (roleCode) => {
      expect((await send(roleCode, CONFIRM)).status).toBe(403);
    }
  );
});

describe('a wali', () => {
  it('reads and acknowledges', async () => {
    for (const [what, call] of [...READS, ['acknowledge', CONFIRM] as [string, Call]]) {
      expect((await send('TKQ_ORANG_TUA', call)).status, what).toBe(200);
    }
    expect(dailyReportService.confirmByParent).toHaveBeenCalledWith(
      ID,
      { parentFeedback: 'Terima kasih' },
      { sub: 'u-TKQ_ORANG_TUA', roleCode: 'TKQ_ORANG_TUA', unitId: 'unit-tk' }
    );
  });

  it('writes nothing (403)', async () => {
    for (const [what, call] of WRITES) {
      expect((await send('TKQ_ORANG_TUA', call)).status, what).toBe(403);
    }
    expect(dailyReportService.create).not.toHaveBeenCalled();
    expect(dailyReportService.delete).not.toHaveBeenCalled();
  });
});

describe('everyone else', () => {
  it.each([
    'YAYASAN_KETUA',
    'YAYASAN_PEMBINA',
    'TKQ_TATA_USAHA',
    'TKQ_BENDAHARA',
    'SDIT_SISWA',
    'TKQ_KOMITE',
  ])('%s reaches none of it (403)', async (roleCode) => {
    for (const [what, call] of [...READS, ...WRITES, ['acknowledge', CONFIRM] as [string, Call]]) {
      expect((await send(roleCode, call)).status, `${roleCode} ${what}`).toBe(403);
    }
  });
});

describe('the contract at the edge', () => {
  it('a report is dated by calendar day, not a datetime (400)', async () => {
    const res = await send('TKQ_GURU', [
      'post',
      '/daily-report',
      { ...REPORT, reportDate: '2026-09-26T00:00:00.000Z' },
    ]);
    expect(res.status).toBe(400);
  });

  it('the unit and the academic year are not taken from the caller', async () => {
    await send('TKQ_GURU', [
      'post',
      '/daily-report',
      { ...REPORT, unitId: '33333333-3333-4333-8333-333333333333', academicYearId: 'x' },
    ]);
    const input = vi.mocked(dailyReportService.create).mock.calls[0][0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('unitId');
    expect(input).not.toHaveProperty('academicYearId');
  });

  it('a photo must be one this API stored (400 for a link elsewhere)', async () => {
    const res = await send('TKQ_GURU', [
      'post',
      '/daily-report',
      { ...REPORT, photos: [{ url: 'https://example.com/x.png' }] },
    ]);
    expect(res.status).toBe(400);
  });

  it('arrival for a class day is a time of day (400 for anything else)', async () => {
    const res = await send('TKQ_GURU', [
      'post',
      '/daily-report/bulk',
      {
        reportDate: '2026-09-26',
        reports: [{ studentId: STUDENT, arrivalTime: '2026-09-26T07:00:00Z' }],
      },
    ]);
    expect(res.status).toBe(400);
  });
});
