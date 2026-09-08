import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RaportMerdekaService } from '../raport-merdeka.service';
import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: vi.fn(),
    },
    classEnrollment: {
      findMany: vi.fn(),
    },
    userRoleAssignment: {
      findFirst: vi.fn(),
    },
    teacher: {
      findFirst: vi.fn(),
    },
  },
}));

const user = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  id: 'user-1',
  sub: 'user-1',
  email: 'user1@cipansor.or.id',
  roleId: 'role-1',
  roleCode: 'SMPIT_GURU',
  permissions: [],
  type: 'access',
  role: 'SMPIT_GURU',
  unitId: 'unit-smp-1',
  ...overrides,
});

describe('RaportMerdekaService.generateBulkRaportMerdeka scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.class.findUnique as any).mockResolvedValue({
      unitId: 'unit-smp-1',
      academicYearId: 'year-1',
    });
    vi.spyOn(RaportMerdekaService, 'generateRaportMerdeka').mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('an educator user with no unitId cannot get a free pass into a class in another unit', async () => {
    const crossUnit = user({ unitId: null });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.generateBulkRaportMerdeka('class-1', 'year-1', 1, crossUnit)
    ).rejects.toThrow(/tidak memiliki akses ke kelas di unit lain/);

    // The scope guard must fire BEFORE any enrollment is fetched or a raport is
    // generated — no cross-unit free pass.
    expect(prisma.classEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('an educator user with a non-educator cross-unit assignment is still denied', async () => {
    const crossUnit = user({ unitId: null });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'CASHIER' },
    });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.generateBulkRaportMerdeka('class-1', 'year-1', 1, crossUnit)
    ).rejects.toThrow(/tidak memiliki akses ke kelas di unit lain/);
  });

  it('an educator user with no unitId but an educator cross-unit assignment opens the class raport', async () => {
    const crossUnit = user({ unitId: null });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'SMPIT_GURU' },
    });
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ student: { id: 's1' } }]);

    const result = await RaportMerdekaService.generateBulkRaportMerdeka(
      'class-1',
      'year-1',
      2,
      crossUnit
    );

    expect(result.totalStudents).toBe(1);
    expect(prisma.classEnrollment.findMany).toHaveBeenCalled();
  });

  it('a user whose unitId matches the class unit passes without an educator assignment check', async () => {
    const sameUnit = user({ unitId: 'unit-smp-1' });
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ student: { id: 's1' } }]);

    const result = await RaportMerdekaService.generateBulkRaportMerdeka(
      'class-1',
      'year-1',
      1,
      sameUnit
    );

    expect(result.totalStudents).toBe(1);
    expect(prisma.userRoleAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('denies a non-educator role even for a same-unit class', async () => {
    const cashier = user({ unitId: 'unit-smp-1', roleCode: 'CASHIER', role: 'CASHIER' });

    await expect(
      RaportMerdekaService.generateBulkRaportMerdeka('class-1', 'year-1', 1, cashier)
    ).rejects.toThrow(/Hanya pendidik dan pengelola/);
  });
});
