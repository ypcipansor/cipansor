import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { RoleCode } from '@prisma/client';

// The SPMB summary read 0 for the Kepala Sekolah (403 at the route: TEACHER
// was not on the list) and for the Ketua (403 in the service: no unitId).
// Both hold ADMISSION_VIEW; the yayasan decided on 2026-09-23 that the kepala
// unit decides admissions and the yayasan reads along.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    registrant: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    registrantDocument: { findMany: vi.fn() },
    admissionPeriod: { findUnique: vi.fn() },
    admissionWave: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    role: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { authorizeOrPermission } from '@/middleware/auth';
import { readsAllUnits } from '../admissions.access';
import * as service from '../admissions.service';
import { waveService } from '../ppdb-wave.service';

const ketua = { id: 'u-ketua', role: 'UNIT_ADMIN', roleCode: 'YAYASAN_KETUA', unitId: null };
const kepala = {
  id: 'u-kepala',
  role: 'TEACHER',
  roleCode: 'SMPIT_KEPALA_SEKOLAH',
  unitId: 'unit-smp',
};
const perawat = { id: 'u-perawat', role: 'STAFF', roleCode: 'PERAWAT', unitId: 'unit-smp' };

function run(mw: ReturnType<typeof authorizeOrPermission>, user?: Record<string, unknown>) {
  const next = vi.fn();
  mw({ user } as unknown as Request, {} as Response, next as unknown as NextFunction);
  return next.mock.calls[0]?.[0];
}

describe('authorizeOrPermission', () => {
  const mw = authorizeOrPermission([RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'], 'ADMISSION_VIEW');

  it('admits the Kepala Sekolah by ADMISSION_VIEW although TEACHER is not listed', () => {
    expect(run(mw, { roleCode: 'SMPIT_KEPALA_SEKOLAH', permissions: ['ADMISSION_VIEW'] })).toBe(
      undefined
    );
  });

  it('keeps everyone the legacy list admitted, e.g. the bendahara who records fees', () => {
    expect(run(mw, { roleCode: 'SMPIT_BENDAHARA', permissions: ['FINANCE_VIEW'] })).toBe(undefined);
  });

  it('still refuses a teacher with neither', () => {
    expect(run(mw, { roleCode: 'SMPIT_GURU', permissions: ['STUDENT_VIEW'] }).statusCode).toBe(403);
  });

  it('refuses an anonymous request with 401', () => {
    expect(run(mw, undefined).statusCode).toBe(401);
  });
});

describe('readsAllUnits', () => {
  it('is the yayasan board and Super Admin only', () => {
    expect(readsAllUnits(ketua)).toBe(true);
    expect(readsAllUnits({ role: 'SUPER_ADMIN', roleCode: 'SUPER_ADMIN' })).toBe(true);
    expect(readsAllUnits(kepala)).toBe(false);
    // Cross-unit service roles reach these routes through STAFF; they must
    // stay on their own unit, not widen to every unit.
    expect(readsAllUnits(perawat)).toBe(false);
    expect(readsAllUnits({ role: 'STAFF', roleCode: 'PESANTREN_TATA_USAHA' })).toBe(false);
  });
});

describe('SPMB reads by the people who decide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.registrant.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.registrant.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.admissionWave.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.admissionWave.count).mockResolvedValue(0 as any);
  });

  it('the Ketua lists registrants of every unit instead of a 403', async () => {
    await service.getRegistrants({ page: 1, limit: 10 }, ketua as any);
    const arg = vi.mocked(prisma.registrant.findMany).mock.calls[0][0] as any;
    expect(arg.where.admissionPeriod).toBeUndefined();
  });

  it('the Kepala Sekolah lists only their own unit', async () => {
    await service.getRegistrants({ page: 1, limit: 10 }, kepala as any);
    const arg = vi.mocked(prisma.registrant.findMany).mock.calls[0][0] as any;
    expect(arg.where.admissionPeriod).toEqual({ unitId: 'unit-smp' });
  });

  it('the Ketua opens one registrant of any unit', async () => {
    vi.mocked(prisma.registrant.findUnique).mockResolvedValue({
      id: 'r1',
      admissionPeriod: { unitId: 'unit-sma' },
    } as any);
    await expect(service.getRegistrantById('r1', ketua as any)).resolves.toMatchObject({
      id: 'r1',
    });
  });

  it("the Kepala still cannot open another unit's registrant", async () => {
    vi.mocked(prisma.registrant.findUnique).mockResolvedValue({
      id: 'r1',
      admissionPeriod: { unitId: 'unit-sma' },
    } as any);
    await expect(service.getRegistrantById('r1', kepala as any)).rejects.toThrow(
      'Access to this unit is not allowed'
    );
  });

  it('the Ketua lists waves of every unit', async () => {
    await waveService.findAll({ page: 1, limit: 10 }, ketua as any);
    const arg = vi.mocked(prisma.admissionWave.findMany).mock.calls[0][0] as any;
    expect(arg.where.period).toBeUndefined();
  });

  it('reading is not changing: the Ketua still cannot update a registrant', async () => {
    await expect(service.updateRegistrant('r1', {} as any, ketua as any)).rejects.toThrow(
      'Access to this unit is not allowed'
    );
  });
});
