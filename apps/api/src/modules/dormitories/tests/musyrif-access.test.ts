import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { RoleCode } from '@prisma/client';
import {
  MUSYRIF_ASSIGNER_ROLE_CODES,
  MUSYRIF_CANDIDATE_ROLE_CODES,
  MUSYRIF_READER_ROLE_CODES,
} from '@cipansor/shared';

// Who may call the musyrif-assignment routes, through the real router and
// middleware. The service is mocked: this is about the door.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../musyrif.service', () => ({
  listAssignments: vi.fn(async () => []),
  listCandidates: vi.fn(async () => []),
  assign: vi.fn(async () => ({ id: 'a1' })),
  endAssignment: vi.fn(async () => undefined),
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import dormitoryRoutes from '../dormitories.routes';
import * as service from '../musyrif.service';

const ROLES = {
  superAdmin: 'SUPER_ADMIN',
  kiai: 'PESANTREN_PENGASUH',
  musyrif: 'MUSYRIF',
  ustadz: 'USTADZ',
  tuPesantren: 'PESANTREN_TATA_USAHA',
  adminSmp: 'SMPIT_ADMIN',
  kepala: 'SMPIT_KEPALA_SEKOLAH',
  guru: 'SMPIT_GURU',
  ketua: 'YAYASAN_KETUA',
  wali: 'SMPIT_ORANG_TUA',
} as const;
type Who = keyof typeof ROLES;

const app = express();
app.use(express.json());
app.use('/dormitories', dormitoryRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockImplementation(((token: string) => {
    const roleCode = ROLES[token as Who];
    if (!roleCode) throw new Error('bad token');
    return { type: 'access', permissions: [], sub: `u-${token}`, roleCode, unitId: 'unit-x' };
  }) as unknown as typeof verifyToken);
});

const D = '33333333-3333-4333-8333-333333333333';
const BODY = { userId: '11111111-1111-4111-8111-111111111111', role: 'PEMBINA' };

type Call = [method: 'get' | 'post', path: string, body?: object];
const send = (who: Who, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${who}`);
  return body ? req.send(body) : req;
};

const everyone = Object.keys(ROLES) as Who[];
const ASSIGNERS: Who[] = ['superAdmin', 'kiai'];
const READERS: Who[] = [...ASSIGNERS, 'musyrif', 'ustadz'];

const MATRIX: Array<[string, Call, Who[]]> = [
  ['list', ['get', `/dormitories/${D}/musyrif`], READERS],
  ['candidates', ['get', `/dormitories/${D}/musyrif/candidates?q=ah`], ASSIGNERS],
  ['assign', ['post', `/dormitories/${D}/musyrif`, BODY], ASSIGNERS],
  ['end', ['post', `/dormitories/${D}/musyrif/asg-1/end`], ASSIGNERS],
];

describe('musyrif assignment routes — who may call what', () => {
  it.each(MATRIX)('%s', async (_name, call, allowed) => {
    for (const who of everyone) {
      const res = await send(who, call);
      const label = `${who} ${call[0]} ${call[1]} → ${res.status}`;
      if (allowed.includes(who)) expect(res.status, label).toBeLessThan(300);
      else expect(res.status, label).toBe(403);
    }
  });

  it('a school’s admin does not staff the asrama, which houses several schools', () => {
    for (const [, , allowed] of MATRIX) expect(allowed).not.toContain('adminSmp');
  });

  it('every role code in the shared lists exists', () => {
    const known = new Set<string>(Object.values(RoleCode));
    for (const code of [
      ...MUSYRIF_ASSIGNER_ROLE_CODES,
      ...MUSYRIF_READER_ROLE_CODES,
      ...MUSYRIF_CANDIDATE_ROLE_CODES,
    ]) {
      expect(known.has(code), code).toBe(true);
    }
  });
});

describe('musyrif assignment routes — validation at the edge', () => {
  it.each([
    ['no person', {}],
    ['a person id that is not a uuid', { userId: 'ustadz-salman' }],
    ['a duty the column does not know', { ...BODY, role: 'WALI_KAMAR' }],
    ['a kamar id that is not a uuid', { ...BODY, roomId: 'A1' }],
  ])('assigning with %s is 400', async (_name, body) => {
    const res = await send('kiai', ['post', `/dormitories/${D}/musyrif`, body]);
    expect(res.status).toBe(400);
    expect(service.assign).not.toHaveBeenCalled();
  });

  it('the duty defaults to pembina', async () => {
    await send('kiai', ['post', `/dormitories/${D}/musyrif`, { userId: BODY.userId }]);
    expect(vi.mocked(service.assign).mock.calls[0][1]).toMatchObject({ role: 'PEMBINA' });
  });
});
