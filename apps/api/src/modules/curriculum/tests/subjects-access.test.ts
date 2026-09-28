import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { RoleCode, SubjectType } from '@prisma/client';
import { CURRICULUM_MANAGER_ROLE_CODES, SUBJECT_TYPE_VALUES } from '@cipansor/shared';

// Who may write subjects and guru pengampu, through the real router and
// middleware, and what reaches the service. The service is mocked: this is
// about the door and the contract at it; the unit scope is the service's.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../curriculum.service', () => ({
  getSubjects: vi.fn(async () => ({ data: [], meta: {} })),
  createSubject: vi.fn(async () => ({ id: 's1' })),
  updateSubject: vi.fn(async () => ({ id: 's1' })),
  deleteSubject: vi.fn(async () => undefined),
  assignTeacherToSubject: vi.fn(async () => ({ id: 'ts1' })),
  removeTeacherFromSubject: vi.fn(async () => undefined),
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import curriculumRoutes from '../curriculum.routes';
import * as service from '../curriculum.service';

const ROLES = {
  superAdmin: 'SUPER_ADMIN',
  adminSmp: 'SMPIT_ADMIN',
  kepala: 'SMPIT_KEPALA_SEKOLAH',
  guru: 'SMPIT_GURU',
  guruBk: 'SMPIT_GURU_BK',
  ketua: 'YAYASAN_KETUA',
  tu: 'SMPIT_TATA_USAHA',
  santri: 'SMPIT_SISWA',
  wali: 'SMPIT_ORANG_TUA',
} as const;
type Who = keyof typeof ROLES;

const app = express();
app.use(express.json());
app.use('/curriculum', curriculumRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation(((token: string) => {
    const roleCode = ROLES[token as Who];
    if (!roleCode) throw new Error('bad token');
    return { type: 'access', permissions: [], sub: `u-${token}`, roleCode, unitId: 'unit-smp' };
  }) as unknown as typeof verifyToken);
});

const U = '33333333-3333-4333-8333-333333333333';
const T = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const MAPEL = { unitId: U, code: 'mtk', name: 'Matematika', type: 'ACADEMIC', credits: 5 };

type Call = [method: 'post' | 'patch' | 'delete', path: string, body?: object];
const send = (who: Who, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${who}`);
  return body ? req.send(body) : req;
};

const everyone = Object.keys(ROLES) as Who[];
const MANAGERS: Who[] = ['superAdmin', 'adminSmp', 'kepala'];

const WRITES: Array<[string, Call]> = [
  ['add a subject', ['post', '/curriculum/subjects', MAPEL]],
  ['edit a subject', ['patch', `/curriculum/subjects/${S}`, { credits: 4 }]],
  ['delete a subject', ['delete', `/curriculum/subjects/${S}`]],
  [
    'assign a guru pengampu',
    ['post', '/curriculum/teacher-subjects', { teacherId: T, subjectId: S }],
  ],
  ['end a guru pengampu', ['delete', '/curriculum/teacher-subjects/ts1']],
];

describe('subject writes — who may call what', () => {
  it.each(WRITES)('%s', async (_name, call) => {
    for (const who of everyone) {
      const res = await send(who, call);
      const label = `${who} ${call[0]} ${call[1]} → ${res.status}`;
      if (MANAGERS.includes(who)) expect(res.status, label).toBeLessThan(300);
      else expect(res.status, label).toBe(403);
    }
  });

  it('every manager code is a real role code; the organs and teachers are not managers', () => {
    for (const code of CURRICULUM_MANAGER_ROLE_CODES)
      expect(Object.values(RoleCode)).toContain(code);
    expect(CURRICULUM_MANAGER_ROLE_CODES).not.toContain('YAYASAN_KETUA');
    expect(CURRICULUM_MANAGER_ROLE_CODES).not.toContain('SMPIT_GURU');
  });

  it('the shared subject types are Prisma’s', () => {
    expect([...SUBJECT_TYPE_VALUES].sort()).toEqual(Object.values(SubjectType).sort());
  });
});

describe('subject writes — the contract at the edge', () => {
  it('the actor reaches the service, with the code upper-cased and defaults filled', async () => {
    await send('adminSmp', ['post', '/curriculum/subjects', MAPEL]);
    expect(vi.mocked(service.createSubject).mock.calls[0]).toEqual([
      expect.objectContaining({ roleCode: 'SMPIT_ADMIN', unitId: 'unit-smp' }),
      { ...MAPEL, code: 'MTK', passingScore: 70, isActive: true },
    ]);
  });

  // What the web used to send.
  it('the old web types and fields are refused before the service', async () => {
    const res = await send('adminSmp', [
      'post',
      '/curriculum/subjects',
      { ...MAPEL, type: 'REQUIRED', hoursPerWeek: 4 },
    ]);
    expect(res.status).toBe(400);
    expect(service.createSubject).not.toHaveBeenCalled();
  });

  it('an edit carries only what was sent, and never moves the subject to another unit', async () => {
    await send('adminSmp', ['patch', `/curriculum/subjects/${S}`, { credits: 4, unitId: U }]);
    expect(vi.mocked(service.updateSubject).mock.calls[0].slice(1)).toEqual([S, { credits: 4 }]);
  });

  it('the list reads isActive=false as false', async () => {
    const res = await request(app)
      .get('/curriculum/subjects?isActive=false')
      .set('Authorization', 'Bearer guru');
    expect(res.status).toBe(200);
    expect(vi.mocked(service.getSubjects).mock.calls[0][0]).toMatchObject({ isActive: false });
  });
});
