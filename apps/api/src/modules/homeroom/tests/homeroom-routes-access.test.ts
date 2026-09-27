import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Who reaches the homeroom routes at all: teachers — whether one is the wali
// kelas of a class is the service's question (homeroom-access.test.ts) — and a
// unit's kepala sekolah and operator. The yayasan organs, tata usaha,
// treasurers, pupils and their wali do not.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../homeroom.service', () => ({
  homeroomService: {
    getMyClasses: vi.fn(async () => []),
    getClassDashboard: vi.fn(async () => ({})),
    getStudentDetail: vi.fn(async () => ({})),
    createStudentNote: vi.fn(async () => ({})),
    deleteStudentNote: vi.fn(async () => ({})),
  },
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import homeroomRoutes from '../homeroom.routes';
import { homeroomService } from '../homeroom.service';

const app = express();
app.use(express.json());
app.use('/homeroom', homeroomRoutes);
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

const CLASS = '11111111-1111-4111-8111-111111111111';
const PUPIL = '22222222-2222-4222-8222-222222222222';

type Call = [method: 'get' | 'post' | 'delete', path: string, body?: object];
const CALLS: Array<[string, Call]> = [
  ['my classes', ['get', '/homeroom/my-classes']],
  ["a class's dashboard", ['get', `/homeroom/${CLASS}/dashboard`]],
  ['a pupil', ['get', `/homeroom/student/${PUPIL}`]],
  [
    'write a note',
    ['post', '/homeroom/notes', { studentId: PUPIL, type: 'POSITIVE', title: 'Rajin' }],
  ],
  ['remove a note', ['delete', `/homeroom/notes/${CLASS}?noteType=reward`]],
];
const send = (roleCode: string, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${roleCode}`);
  return body ? req.send(body) : req;
};

describe.each([
  'SDIT_GURU',
  'TKQ_GURU',
  'SMPIT_GURU_BK',
  'MUSYRIF',
  'SDIT_KEPALA_SEKOLAH',
  'SDIT_ADMIN',
  'SUPER_ADMIN',
])('%s', (roleCode) => {
  it.each(CALLS)('reaches %s (the service decides the class)', async (_what, call) => {
    const res = await send(roleCode, call);
    expect([200, 201]).toContain(res.status);
  });
});

describe.each([
  'YAYASAN_KETUA',
  'YAYASAN_PENGAWAS',
  'SDIT_TATA_USAHA',
  'SDIT_BENDAHARA',
  'SDIT_ORANG_TUA',
  'SDIT_SISWA',
])('%s', (roleCode) => {
  it.each(CALLS)('is refused %s: 403', async (_what, call) => {
    const res = await send(roleCode, call);
    expect(res.status).toBe(403);
    expect(homeroomService.getMyClasses).not.toHaveBeenCalled();
    expect(homeroomService.createStudentNote).not.toHaveBeenCalled();
  });
});
