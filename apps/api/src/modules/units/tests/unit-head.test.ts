import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Who signs for a unit. Print pages used to write an invented "H. Ahmad
// Fauzi" with an invented NIP under every surat keterangan, rapor and tahfidz
// certificate, and the Rapor Merdeka PDF left the name blank. The head is now
// read from the data: the one person holding the unit's head role. Nobody, or
// two people, leaves the line to be signed by hand rather than print a guess.

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    unit: { findFirst: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { verifyToken } from '@/lib/jwt';
import { errorHandler } from '@/middleware/error';
import unitRoutes from '../unit.routes';
import { findUnitHead } from '../unit-head';

const app = express();
app.use(express.json());
app.use('/units', unitRoutes);
app.use(errorHandler);

const SMP = '11111111-1111-4111-8111-111111111111';
const SD = '22222222-2222-4222-8222-222222222222';
const units: Record<string, object> = {
  [SMP]: { id: SMP, type: 'SMP_IT', name: 'SMP IT', officialName: 'SMP IT Pesantren Cipansor' },
  [SD]: { id: SD, type: 'PESANTREN', name: 'Pesantren Cipansor', officialName: null },
};
const holder = (id: string, name: string, nip: string | null = null) => ({
  user: { id, name, teacher: nip === undefined ? null : { nip } },
});

function signIn(roleCode: string, unitId: string | null) {
  vi.mocked(verifyToken).mockReturnValue({
    type: 'access',
    permissions: [],
    sub: `u-${roleCode}`,
    roleCode,
    unitId,
  } as unknown as ReturnType<typeof verifyToken>);
}
const auth = { Authorization: 'Bearer token' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.unit.findFirst.mockImplementation(
    async (args: { where: { id: string } }) => units[args.where.id] ?? null
  );
  prismaMock.userRoleAssignment.findMany.mockResolvedValue([]);
});

describe('findUnitHead', () => {
  it("names the one holder of the unit's head role, with the NIP and the official name", async () => {
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([
      holder('u1', 'H. Cecep Helmi Syawali, Lc., M.Ag', '19800101'),
    ]);

    expect(await findUnitHead(SMP)).toEqual({
      name: 'H. Cecep Helmi Syawali, Lc., M.Ag',
      nip: '19800101',
      title: 'Kepala SMP IT Pesantren Cipansor',
    });
    const where = prismaMock.userRoleAssignment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      unitId: SMP,
      isActive: true,
      role: { code: 'SMPIT_KEPALA_SEKOLAH' },
      user: { isActive: true, deletedAt: null },
    });
    // An expired assignment does not make a head.
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });

  it('heads the pesantren with its Pimpinan', async () => {
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([
      holder('u2', 'K.H. Muhammad Taufik Ismail, S.Pd', null),
    ]);

    expect(await findUnitHead(SD)).toMatchObject({ title: 'Pimpinan Pesantren', nip: null });
    expect(prismaMock.userRoleAssignment.findMany.mock.calls[0][0].where.role).toEqual({
      code: 'PESANTREN_PENGASUH',
    });
  });

  it('leaves the line blank when nobody holds the role', async () => {
    expect(await findUnitHead(SMP)).toBeNull();
  });

  it('leaves the line blank when two people do — a handover not yet closed', async () => {
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([
      holder('u1', 'Kepala Lama'),
      holder('u3', 'Kepala Baru'),
    ]);

    expect(await findUnitHead(SMP)).toBeNull();
  });

  it('is one person even with two assignments', async () => {
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([
      holder('u1', 'H. Cecep'),
      holder('u1', 'H. Cecep'),
    ]);

    expect(await findUnitHead(SMP)).toMatchObject({ name: 'H. Cecep' });
  });
});

describe('GET /units/:id/head', () => {
  beforeEach(() => {
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([holder('u1', 'H. Cecep')]);
  });

  it("answers a unit's own staff for their unit", async () => {
    signIn('SMPIT_TATA_USAHA', SMP);

    const res = await request(app).get(`/units/${SMP}/head`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'H. Cecep',
      title: 'Kepala SMP IT Pesantren Cipansor',
    });
  });

  it("is 404 for another unit's", async () => {
    signIn('SDIT_TATA_USAHA', SD);

    expect((await request(app).get(`/units/${SMP}/head`).set(auth)).status).toBe(404);
  });

  it("answers the yayasan's organs for every unit", async () => {
    signIn('YAYASAN_KETUA', null);

    expect((await request(app).get(`/units/${SMP}/head`).set(auth)).status).toBe(200);
  });
});
