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
    classEnrollment: {
      findMany: vi.fn(),
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
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
  });

  it('passes when there is no authenticated user', async () => {
    await expect(RaportMerdekaService.validateStudentScope(undefined, 's1')).resolves.not.toThrow();
  });

  it('passes for SUPER_ADMIN regardless of unit', async () => {
    await expect(
      RaportMerdekaService.validateStudentScope(
        user({ roleCode: 'SUPER_ADMIN', unitId: null }),
        's1'
      )
    ).resolves.not.toThrow();
  });

  it('passes when the user belongs to the same unit as the student', async () => {
    await expect(RaportMerdekaService.validateStudentScope(user(), 's1')).resolves.not.toThrow();
  });

  it('empty unitId alone is NOT a free pass — non-educator cross-unit assignment still denied', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'CASHIER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({ role: { code: 'CASHIER' } });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(RaportMerdekaService.validateStudentScope(crossUnit, 's1')).rejects.toThrow(
      /akses.*siswa di unit lain/i
    );
  });

  it('DENIES a cross-unit teacher with only an educator assignment in the unit (no class coverage)', async () => {
    // Flag 4 regression: a cross-unit educator assignment used to open every
    // student in that unit. A teacher must now cover the student's own class.
    const crossUnit = user({ unitId: null, roleCode: 'TEACHER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'SMPIT_GURU' },
    });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(RaportMerdekaService.validateStudentScope(crossUnit, 's1')).rejects.toThrow(
      /tidak memiliki akses ke siswa di unit lain/
    );
  });

  it('ALLOWS a cross-unit teacher who covers the student class', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'TEACHER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'SMPIT_GURU' },
    });
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(RaportMerdekaService.validateStudentScope(crossUnit, 's1')).resolves.not.toThrow();
  });

  it('DENIES a same-unit teacher who does NOT cover the student class', async () => {
    // Flag 3 regression: a teacher in the student's own unit used to read every
    // raport of that unit. Same-unit teachers must now prove class coverage.
    const sameUnit = user({ unitId: 'unit-smp-1', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(RaportMerdekaService.validateStudentScope(sameUnit, 's1')).rejects.toThrow(
      /tidak memiliki akses ke siswa di unit lain/
    );
  });

  it('ALLOWS a same-unit teacher who covers the student class', async () => {
    const sameUnit = user({ unitId: 'unit-smp-1', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(RaportMerdekaService.validateStudentScope(sameUnit, 's1')).resolves.not.toThrow();
  });

  it('no assignment and no teacher record is denied', async () => {
    const otherUnit = user({ unitId: 'unit-other' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(RaportMerdekaService.validateStudentScope(otherUnit, 's1')).rejects.toThrow(
      /tidak memiliki akses ke siswa di unit lain/
    );
  });

  it('a cross-unit teacher record grants access', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(RaportMerdekaService.validateStudentScope(otherUnit, 's1')).resolves.not.toThrow();
  });

  it('DENIES a cross-unit teacher whose only exam is in the unit but NOT the student class', async () => {
    // Regression for the scope leak: a teacher with one exam in the student's
    // unit used to open every student of that unit. The narrowed check scopes
    // the lookup to the student's own classes and must deny here.
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(RaportMerdekaService.validateStudentScope(otherUnit, 's1')).rejects.toThrow(
      /tidak memiliki akses ke siswa di unit lain/
    );

    // The teacher lookup must be scoped by the student's class, never by unit.
    const teacherWhere = (prisma.teacher.findFirst as any).mock.calls[0][0].where;
    expect(teacherWhere).not.toHaveProperty('unitId');
    expect(teacherWhere.OR).toContainEqual({
      homeroomClasses: { some: { id: { in: ['class-X'] } } },
    });
    expect(teacherWhere.OR).toContainEqual({ exams: { some: { classId: { in: ['class-X'] } } } });
  });

  it('rejects a student with no active class enrollment for a cross-unit teacher', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([]);

    await expect(RaportMerdekaService.validateStudentScope(otherUnit, 's1')).rejects.toThrow(
      /tidak memiliki akses ke siswa di unit lain/
    );
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });

  it('ALLOWS a cross-unit teacher who is homeroom for the student class', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(RaportMerdekaService.validateStudentScope(otherUnit, 's1')).resolves.not.toThrow();
  });
});
