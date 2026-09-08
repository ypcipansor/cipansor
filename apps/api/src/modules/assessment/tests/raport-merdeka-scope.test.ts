import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RaportMerdekaService } from '../raport-merdeka.service';
import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
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
  roleCode: 'UNIT_ADMIN',
  permissions: [],
  type: 'access',
  role: 'UNIT_ADMIN',
  unitId: 'unit-smp-1',
  ...overrides,
});

describe('RaportMerdekaService.validateStudentScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.student.findUnique as any).mockResolvedValue({ unitId: 'unit-smp-1' });
  });

  it('passes when there is no authenticated user', async () => {
    await expect(RaportMerdekaService.validateStudentScope(undefined, 's1')).resolves.not.toThrow();
  });

  it('passes for SUPER_ADMIN regardless of unit', async () => {
    await expect(
      RaportMerdekaService.validateStudentScope(user({ roleCode: 'SUPER_ADMIN', unitId: null }), 's1')
    ).resolves.not.toThrow();
  });

  it('passes when the user belongs to the same unit as the student', async () => {
    await expect(
      RaportMerdekaService.validateStudentScope(user(), 's1')
    ).resolves.not.toThrow();
  });

  it('empty unitId alone is NOT a free pass — non-educator cross-unit assignment still denied', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'CASHIER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({ role: { code: 'CASHIER' } });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(crossUnit, 's1')
    ).rejects.toThrow(/akses.*siswa di unit lain/i);
  });

  it('a cross-unit assignment with an educator RoleCode opens the raport', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'TEACHER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({ role: { code: 'SMPIT_GURU' } });

    await expect(
      RaportMerdekaService.validateStudentScope(crossUnit, 's1')
    ).resolves.not.toThrow();
  });

  it('no assignment and no teacher record is denied', async () => {
    const otherUnit = user({ unitId: 'unit-other' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
  });

  it('a cross-unit teacher record grants access', async () => {
    const otherUnit = user({ unitId: 'unit-other' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1')
    ).resolves.not.toThrow();
  });
});
