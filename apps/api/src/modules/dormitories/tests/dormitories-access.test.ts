import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Gender, RoleCode } from '@prisma/client';
import {
  DORMITORY_GENDER_VALUES,
  DORMITORY_MANAGER_ROLE_CODES,
  LEGACY_ROLE_EXPANSION,
} from '@cipansor/shared';

// Who may write asrama, kamar and placements, through the real router and
// middleware, and what reaches the service. The service is mocked: this is
// about the door and the contract at it.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../dormitories.service', () => ({
  createDormitory: vi.fn(async () => ({ id: 'd1' })),
  updateDormitory: vi.fn(async () => ({ id: 'd1' })),
  deleteDormitory: vi.fn(async () => undefined),
  createRoom: vi.fn(async () => ({ id: 'r1' })),
  updateRoom: vi.fn(async () => ({ id: 'r1' })),
  deleteRoom: vi.fn(async () => undefined),
  createRoomAssignment: vi.fn(async () => ({ id: 'a1' })),
  updateRoomAssignment: vi.fn(async () => ({ id: 'a1' })),
  endRoomAssignment: vi.fn(async () => undefined),
  getRoomAssignments: vi.fn(async () => ({ data: [], meta: {} })),
  getRooms: vi.fn(async () => ({ data: [], meta: {} })),
}));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import dormitoryRoutes from '../dormitories.routes';
import * as service from '../dormitories.service';

const ROLES = {
  superAdmin: 'SUPER_ADMIN',
  adminSmp: 'SMPIT_ADMIN',
  ketua: 'YAYASAN_KETUA',
  kiai: 'PESANTREN_PENGASUH',
  tuPesantren: 'PESANTREN_TATA_USAHA',
  musyrif: 'MUSYRIF',
  kepala: 'SMPIT_KEPALA_SEKOLAH',
  guru: 'SMPIT_GURU',
  bendahara: 'SMPIT_BENDAHARA',
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
const R = '22222222-2222-4222-8222-222222222222';
const S = '11111111-1111-4111-8111-111111111111';
const ASRAMA = { name: 'Asrama Putra Al-Fatih', code: 'AP-09', gender: 'MALE', capacity: 40 };
const KAMAR = { dormitoryId: D, name: 'Kamar 101', capacity: 4 };

type Call = [method: 'post' | 'put' | 'delete', path: string, body?: object];
const send = (who: Who, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${who}`);
  return body ? req.send(body) : req;
};

const everyone = Object.keys(ROLES) as Who[];
const MANAGERS: Who[] = ['superAdmin', 'adminSmp', 'ketua'];

const WRITES: Array<[string, Call]> = [
  ['add an asrama', ['post', '/dormitories', ASRAMA]],
  ['edit an asrama', ['put', `/dormitories/${D}`, { capacity: 50 }]],
  ['delete an asrama', ['delete', `/dormitories/${D}`]],
  ['add a kamar', ['post', '/dormitories/rooms', KAMAR]],
  ['edit a kamar', ['put', `/dormitories/rooms/${R}`, { capacity: 6 }]],
  ['delete a kamar', ['delete', `/dormitories/rooms/${R}`]],
  ['place a santri', ['post', '/dormitories/assignments', { studentId: S, roomId: R }]],
  ['note on a placement', ['put', '/dormitories/assignments/p1', { notes: 'x' }]],
  ['end a placement', ['delete', '/dormitories/assignments/p1']],
];

describe('asrama writes — who may call what', () => {
  it.each(WRITES)('%s', async (_name, call) => {
    for (const who of everyone) {
      const res = await send(who, call);
      const label = `${who} ${call[0]} ${call[1]} → ${res.status}`;
      if (MANAGERS.includes(who)) expect(res.status, label).toBeLessThan(300);
      else expect(res.status, label).toBe(403);
    }
  });

  // Moving the writers onto one shared list was not meant to change who they
  // are; that is a decision for the yayasan (progress.md).
  it('the managers are exactly who the legacy SUPER_ADMIN and UNIT_ADMIN buckets admitted', () => {
    expect([...DORMITORY_MANAGER_ROLE_CODES].sort()).toEqual(
      [...LEGACY_ROLE_EXPANSION.SUPER_ADMIN, ...LEGACY_ROLE_EXPANSION.UNIT_ADMIN].sort()
    );
    for (const code of DORMITORY_MANAGER_ROLE_CODES)
      expect(Object.values(RoleCode)).toContain(code);
  });

  it('the shared gender values are Prisma’s', () => {
    expect([...DORMITORY_GENDER_VALUES].sort()).toEqual(Object.values(Gender).sort());
  });
});

describe('asrama writes — the contract at the edge', () => {
  // What the web used to send: `type` for the gender. It was 400 then too,
  // with nothing on the page to say why.
  it('an asrama without `gender` is refused before the service', async () => {
    const { gender: _g, ...withoutGender } = ASRAMA;
    const res = await send('superAdmin', [
      'post',
      '/dormitories',
      { ...withoutGender, type: 'MALE' },
    ]);
    expect(res.status).toBe(400);
    expect(service.createDormitory).not.toHaveBeenCalled();
  });

  it('fields no column holds do not reach the service', async () => {
    await send('superAdmin', [
      'post',
      '/dormitories',
      { ...ASRAMA, supervisorId: S, facilities: 'AC', isActive: true },
    ]);
    expect(vi.mocked(service.createDormitory).mock.calls[0][0]).toEqual({
      ...ASRAMA,
      unitId: null,
    });
  });

  it('an edit sends only what was given — no defaults fill the rest', async () => {
    await send('superAdmin', ['put', `/dormitories/rooms/${R}`, { capacity: 6 }]);
    expect(vi.mocked(service.updateRoom).mock.calls[0]).toEqual([R, { capacity: 6 }]);
  });

  it('a kamar with no name or no capacity is refused', async () => {
    const res = await send('superAdmin', ['post', '/dormitories/rooms', { dormitoryId: D }]);
    expect(res.status).toBe(400);
    expect(service.createRoom).not.toHaveBeenCalled();
  });

  // PUT /assignments/:id took roomId and isActive, and so moved or revived a
  // placement past every rule POST checks.
  it('a placement is changed only in its note', async () => {
    await send('superAdmin', [
      'put',
      '/dormitories/assignments/p1',
      { notes: 'pindah lantai', roomId: R, isActive: true },
    ]);
    expect(vi.mocked(service.updateRoomAssignment).mock.calls[0]).toEqual([
      'p1',
      { notes: 'pindah lantai' },
    ]);
  });
});

describe('asrama reads — query flags', () => {
  // The query is parsed twice (validateQuery, then the controller), and the
  // asrama page asks for `isActive=true`; the flag has to survive both.
  it.each([
    ['/dormitories/assignments/list', 'getRoomAssignments'],
    ['/dormitories/rooms/list', 'getRooms'],
  ] as const)('%s reads isActive as the boolean it says', async (path, fn) => {
    for (const [flag, value] of [
      ['true', true],
      ['false', false],
    ] as const) {
      const res = await request(app)
        .get(`${path}?isActive=${flag}&limit=100`)
        .set('Authorization', 'Bearer superAdmin');
      expect(res.status, `${path} isActive=${flag}`).toBe(200);
      expect(vi.mocked(service[fn]).mock.calls.at(-1)?.[0]).toMatchObject({ isActive: value });
    }
  });
});
