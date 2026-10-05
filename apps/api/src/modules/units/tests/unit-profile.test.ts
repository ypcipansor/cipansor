import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// A unit's profile page (Sistem → Profil Unit): the Edit Unit form saves
// through PATCH, the Super Admin edits every unit and a unit's admin only their
// own — never its type — the NPSN can be recorded, and the statistics are
// counted, not a dash.

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    unit: { findFirst: vi.fn(), update: vi.fn() },
    student: { count: vi.fn() },
    teacher: { count: vi.fn() },
    class: { count: vi.fn() },
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
import { unitService } from '../unit.service';

const app = express();
app.use(express.json());
app.use('/units', unitRoutes);
app.use(errorHandler);

const SMP = '11111111-1111-4111-8111-111111111111';
const SD = '22222222-2222-4222-8222-222222222222';
const smpUnit = { id: SMP, name: 'SMP IT Cipansor', type: 'SMP_IT', npsn: null, deletedAt: null };

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
    async (args: { where: { id?: string; npsn?: string } }) =>
      args.where.id === SMP ? smpUnit : null
  );
  prismaMock.unit.update.mockImplementation(async (args: { data: object }) => ({
    ...smpUnit,
    ...args.data,
  }));
});

describe('editing a unit', () => {
  it("the unit's admin saves their own unit's NPSN through the Edit Unit form (PATCH)", async () => {
    signIn('SMPIT_ADMIN', SMP);

    const res = await request(app)
      .patch(`/units/${SMP}`)
      .set(auth)
      .send({ name: 'SMP IT Cipansor', type: 'SMP_IT', npsn: '69988558', phone: null });

    expect(res.status).toBe(200);
    expect(res.body.data.npsn).toBe('69988558');
    expect(prismaMock.unit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SMP },
        data: expect.objectContaining({ npsn: '69988558', phone: null }),
      })
    );
  });

  it('an NPSN that is not eight digits is refused with a message a person can read', async () => {
    signIn('SMPIT_ADMIN', SMP);

    const res = await request(app).patch(`/units/${SMP}`).set(auth).send({ npsn: '6998855' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('NPSN terdiri dari 8 angka');
    expect(prismaMock.unit.update).not.toHaveBeenCalled();
  });

  it("the unit's admin records the official name and operating permit", async () => {
    signIn('SMPIT_ADMIN', SMP);

    const res = await request(app).patch(`/units/${SMP}`).set(auth).send({
      officialName: '  SMP IT Pesantren Cipansor ',
      operatingPermitNumber: '503/0671/Kep.07/DPMPTSP/2019',
      operatingPermitDate: '2019-05-02',
    });

    expect(res.status).toBe(200);
    const { data } = prismaMock.unit.update.mock.calls[0][0];
    expect(data).toMatchObject({
      officialName: 'SMP IT Pesantren Cipansor',
      operatingPermitNumber: '503/0671/Kep.07/DPMPTSP/2019',
    });
    // A calendar day, stored as that day — not shifted by a time zone.
    expect(data.operatingPermitDate.toISOString()).toBe('2019-05-02T00:00:00.000Z');
  });

  it('null clears them; a field left out is left alone', async () => {
    signIn('SMPIT_ADMIN', SMP);

    await request(app)
      .patch(`/units/${SMP}`)
      .set(auth)
      .send({ operatingPermitNumber: null, operatingPermitDate: null })
      .expect(200);

    const { data } = prismaMock.unit.update.mock.calls[0][0];
    expect(data.operatingPermitNumber).toBeNull();
    expect(data.operatingPermitDate).toBeNull();
    expect(data.officialName).toBeUndefined();
  });

  it.each([
    [{ operatingPermitDate: '02-05-2019' }, 'Tanggal tidak valid'],
    [{ operatingPermitDate: '2019-02-30' }, 'Tanggal tidak valid'],
    [{ officialName: 'SM' }, 'Nama resmi minimal 3 karakter'],
  ])('refuses %j with "%s"', async (body, message) => {
    signIn('SMPIT_ADMIN', SMP);

    const res = await request(app).patch(`/units/${SMP}`).set(auth).send(body);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(message);
    expect(prismaMock.unit.update).not.toHaveBeenCalled();
  });

  it("another unit's admin does not reach it", async () => {
    await expect(
      unitService.update(SMP, { name: 'Diganti' }, { roleCode: 'SDIT_ADMIN', unitId: SD })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.unit.update).not.toHaveBeenCalled();
  });

  it("a unit's admin cannot change its type; saving the same type is fine", async () => {
    const admin = { roleCode: 'SMPIT_ADMIN', unitId: SMP };

    await expect(unitService.update(SMP, { type: 'SMA_QURAN' }, admin)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.unit.update).not.toHaveBeenCalled();

    await expect(unitService.update(SMP, { type: 'SMP_IT' }, admin)).resolves.toBeTruthy();
  });

  it('the Super Admin edits any unit, type included', async () => {
    await unitService.update(SMP, { type: 'SMA_QURAN' }, { roleCode: 'SUPER_ADMIN', unitId: null });

    expect(prismaMock.unit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SMA_QURAN' }) })
    );
  });

  it('an NPSN already recorded for another unit is a conflict, naming that unit', async () => {
    prismaMock.unit.findFirst.mockImplementation(
      async (args: { where: { id?: unknown; npsn?: string } }) =>
        args.where.npsn ? { name: 'SD IT Cipansor' } : smpUnit
    );

    await expect(
      unitService.update(SMP, { npsn: '69988558' }, { roleCode: 'SMPIT_ADMIN', unitId: SMP })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('SD IT Cipansor'),
    });
  });

  it('a kepala sekolah reads the page but does not edit the unit', async () => {
    signIn('SMPIT_KEPALA_SEKOLAH', SMP);

    const res = await request(app).patch(`/units/${SMP}`).set(auth).send({ name: 'Diganti' });

    expect(res.status).toBe(403);
    expect(prismaMock.unit.update).not.toHaveBeenCalled();
  });
});

describe("the unit's statistics", () => {
  beforeEach(() => {
    prismaMock.student.count.mockResolvedValue(212);
    prismaMock.teacher.count.mockResolvedValue(24);
    prismaMock.class.count.mockResolvedValue(9);
  });

  it('counts active santri, teachers with an active account, and classes of the active year', async () => {
    signIn('SMPIT_KEPALA_SEKOLAH', SMP);

    const res = await request(app).get(`/units/${SMP}/summary`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ activeStudents: 212, teachers: 24, classes: 9 });
    expect(prismaMock.student.count).toHaveBeenCalledWith({
      where: { unitId: SMP, deletedAt: null, status: 'active' },
    });
    expect(prismaMock.teacher.count).toHaveBeenCalledWith({
      where: { unitId: SMP, user: { isActive: true, deletedAt: null } },
    });
    expect(prismaMock.class.count).toHaveBeenCalledWith({
      where: { unitId: SMP, deletedAt: null, academicYear: { isActive: true } },
    });
  });

  it("another unit's staff get 404; the yayasan's organs read every unit", async () => {
    signIn('SDIT_KEPALA_SEKOLAH', SD);
    expect((await request(app).get(`/units/${SMP}/summary`).set(auth)).status).toBe(404);

    signIn('YAYASAN_PENGAWAS', null);
    expect((await request(app).get(`/units/${SMP}/summary`).set(auth)).status).toBe(200);
  });
});
