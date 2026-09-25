import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Which roles each permit route accepts, through the real router and the real
// authenticate/authorize/validate middleware. The service is mocked: this is
// about the door, not the room.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('../permits.service', () => {
  const ok = vi.fn(async () => ({ id: 'p1' }));
  return {
    listPermits: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20 })),
    getSummary: vi.fn(async () => ({ pending: 0, approved: 0, outside: 0, overdue: 0 })),
    getPermitByCode: ok,
    getPermit: ok,
    createPermit: ok,
    updatePermit: ok,
    approvePermit: ok,
    rejectPermit: ok,
    cancelPermit: ok,
    departPermit: ok,
    returnPermit: ok,
  };
});

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import permitRoutes from '../permits.routes';
import * as service from '../permits.service';

const ROLES = {
  superAdmin: 'SUPER_ADMIN',
  admin: 'SMPIT_ADMIN',
  kepala: 'SMPIT_KEPALA_SEKOLAH',
  pengasuh: 'PESANTREN_PENGASUH',
  waliKelas: 'SMPIT_WALI_KELAS',
  musyrif: 'MUSYRIF',
  tu: 'SMPIT_TATA_USAHA',
  keamanan: 'KEAMANAN',
  perawat: 'PERAWAT',
  wali: 'SMPIT_ORANG_TUA',
  bendahara: 'SMPIT_BENDAHARA',
  pustakawan: 'PUSTAKAWAN',
  pengawas: 'YAYASAN_PENGAWAS',
  ketua: 'YAYASAN_KETUA',
  santri: 'SMPIT_SISWA',
} as const;
type Who = keyof typeof ROLES;

const app = express();
app.use(express.json());
app.use('/permits', permitRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.mocked(verifyToken).mockImplementation(((token: string) => {
    const roleCode = ROLES[token as Who];
    if (!roleCode) throw new Error('bad token');
    return { type: 'access', permissions: [], sub: `u-${token}`, roleCode, unitId: 'unit-smp' };
  }) as unknown as typeof verifyToken);
});

const ID = '22222222-2222-4222-8222-222222222222';
const VALID_CREATE = {
  studentId: '11111111-1111-4111-8111-111111111111',
  type: 'PULANG',
  reason: 'Acara keluarga di rumah',
  startDate: '2026-09-25T13:00:00+07:00',
  endDate: '2026-09-27T17:00:00+07:00',
};

type Call = [method: 'get' | 'post' | 'patch', path: string, body?: object];
const send = (who: Who, [method, path, body]: Call) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${who}`);
  return body ? req.send(body) : req;
};

const everyone = Object.keys(ROLES) as Who[];
const STAFF: Who[] = [
  'superAdmin',
  'admin',
  'kepala',
  'pengasuh',
  'waliKelas',
  'musyrif',
  'tu',
  'keamanan',
  'perawat',
];
const REQUESTERS: Who[] = [...STAFF, 'wali'];
const DECIDERS: Who[] = ['superAdmin', 'admin', 'kepala', 'pengasuh'];

const MATRIX: Array<[string, Call, Who[]]> = [
  ['list', ['get', '/permits'], REQUESTERS],
  ['read one', ['get', `/permits/${ID}`], REQUESTERS],
  ['file', ['post', '/permits', VALID_CREATE], REQUESTERS],
  ['change', ['patch', `/permits/${ID}`, { reason: 'Alasan yang lain sekali' }], REQUESTERS],
  ['withdraw', ['post', `/permits/${ID}/cancel`], REQUESTERS],
  ['summary', ['get', '/permits/summary'], STAFF],
  ['gate lookup', ['get', '/permits/code/PMT-AB23CD'], STAFF],
  ['record departure', ['post', `/permits/${ID}/depart`], STAFF],
  ['record return', ['post', `/permits/${ID}/return`], STAFF],
  ['approve', ['post', `/permits/${ID}/approve`], DECIDERS],
  ['reject', ['post', `/permits/${ID}/reject`, { rejectionNote: 'Bentrok ujian' }], DECIDERS],
];

describe('permit routes — who may call what', () => {
  it.each(MATRIX)('%s', async (_name, call, allowed) => {
    for (const who of everyone) {
      const res = await send(who, call);
      if (allowed.includes(who)) {
        expect(res.status, `${who} ${call[0]} ${call[1]} → ${res.status}`).toBeLessThan(300);
      } else {
        expect(res.status, `${who} ${call[0]} ${call[1]} → ${res.status}`).toBe(403);
      }
    }
  });

  it('no yayasan organ decides a learner’s leave (Pengawas audits those decisions)', () => {
    for (const [, , allowed] of MATRIX) {
      expect(allowed).not.toContain('pengawas');
      expect(allowed).not.toContain('ketua');
    }
  });

  it('the caller comes from the token, never the request', async () => {
    await send('wali', ['post', '/permits', VALID_CREATE]);
    expect(vi.mocked(service.createPermit).mock.calls[0][1]).toMatchObject({
      sub: 'u-wali',
      roleCode: 'SMPIT_ORANG_TUA',
    });
  });

  it('no token is 401', async () => {
    expect((await request(app).get('/permits')).status).toBe(401);
  });
});

describe('permit routes — validation at the edge', () => {
  it.each([
    ['the web’s old field names', { ...VALID_CREATE, type: undefined, permitType: 'PULANG' }],
    ['a type Prisma does not have', { ...VALID_CREATE, type: 'SICK' }],
    ['a return before the departure', { ...VALID_CREATE, endDate: '2026-09-24T13:00:00+07:00' }],
    ['a reason under ten characters', { ...VALID_CREATE, reason: 'pulang' }],
  ])('filing with %s is 400', async (_name, body) => {
    const res = await send('kepala', ['post', '/permits', body]);
    expect(res.status).toBe(400);
    expect(service.createPermit).not.toHaveBeenCalled();
  });

  it('a date without a time is accepted (a whole-day permit)', async () => {
    const body = { ...VALID_CREATE, startDate: '2026-09-25', endDate: '2026-09-27' };
    expect((await send('kepala', ['post', '/permits', body])).status).toBe(201);
  });

  it('reject needs a reason', async () => {
    expect((await send('kepala', ['post', `/permits/${ID}/reject`, {}])).status).toBe(400);
  });

  it('return accepts an empty body', async () => {
    expect((await send('keamanan', ['post', `/permits/${ID}/return`])).status).toBe(200);
  });

  it('an unknown list filter value is 400, not ignored', async () => {
    expect((await send('kepala', ['get', '/permits?status=RETURNED'])).status).toBe(400);
  });

  it.each([`/permits/${ID}/status`, `/permits/${ID}/return`])(
    'PUT %s — the old set-any-status and return routes — is gone',
    async (path) => {
      const res = await request(app).put(path).set('Authorization', 'Bearer superAdmin');
      expect(res.status).toBe(404);
    }
  );
});
