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
    await expect(
      RaportMerdekaService.validateStudentScope(undefined, 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('passes for SUPER_ADMIN regardless of unit', async () => {
    await expect(
      RaportMerdekaService.validateStudentScope(
        user({ roleCode: 'SUPER_ADMIN', unitId: null }),
        's1',
        'ay-2024'
      )
    ).resolves.not.toThrow();
  });

  it('passes when the user belongs to the same unit as the student', async () => {
    await expect(
      RaportMerdekaService.validateStudentScope(user(), 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('empty unitId alone is NOT a free pass — non-educator cross-unit assignment still denied', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'CASHIER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({ role: { code: 'CASHIER' } });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(crossUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/akses.*siswa di unit lain/i);
  });

  it('DENIES a cross-unit teacher with only an educator assignment in the unit (no class coverage)', async () => {
    // Flag 4 regression: a cross-unit educator assignment used to open every
    // student in that unit. A teacher must now cover the student's own class.
    const crossUnit = user({ unitId: null, roleCode: 'TEACHER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'SMPIT_GURU' },
    });
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(crossUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
  });

  it('ALLOWS a cross-unit teacher who covers the student class', async () => {
    const crossUnit = user({ unitId: null, roleCode: 'TEACHER' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      role: { code: 'SMPIT_GURU' },
    });
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(crossUnit, 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('DENIES a same-unit teacher who does NOT cover the student class', async () => {
    // Flag 3 regression: a teacher in the student's own unit used to read every
    // raport of that unit. Same-unit teachers must now prove class coverage.
    const sameUnit = user({ unitId: 'unit-smp-1', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(sameUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
  });

  it('ALLOWS a same-unit teacher who covers the student class', async () => {
    const sameUnit = user({ unitId: 'unit-smp-1', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(sameUnit, 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('no assignment and no teacher record is denied', async () => {
    const otherUnit = user({ unitId: 'unit-other' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
  });

  it('a cross-unit teacher record grants access', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('DENIES a cross-unit teacher whose only exam is in the unit but NOT the student class', async () => {
    // Regression for the scope leak: a teacher with one exam in the student's
    // unit used to open every student of that unit. The narrowed check scopes
    // the lookup to the student's own classes and must deny here.
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);

    // The teacher lookup must be scoped by the student's class, never by unit.
    const teacherWhere = (prisma.teacher.findFirst as any).mock.calls[0][0].where;
    expect(teacherWhere).not.toHaveProperty('unitId');
    expect(teacherWhere.OR).toContainEqual({
      homeroomClasses: { some: { id: { in: ['class-X'] }, deletedAt: null } },
    });
    expect(teacherWhere.OR).toContainEqual({ exams: { some: { classId: { in: ['class-X'] } } } });
  });

  it('rejects a student with no class enrollment for the requested academic year for a cross-unit teacher', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([]);

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });

  it('ALLOWS a cross-unit teacher who is homeroom for the student class', async () => {
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).resolves.not.toThrow();
  });

  it('scopes the enrollment lookup to the REQUESTED academic year (not the current enrollment)', async () => {
    // Cross-year regression: a teacher who teaches a student THIS year must not
    // inherit access to the student's past-year raports, because those were
    // sat in classes the teacher never taught.
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    // The student has an active enrollment in this year's class, but the
    // enrollment query must filter by the requested academicYearId.
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    (prisma.teacher.findFirst as any).mockResolvedValue({ id: 'teacher-1' });

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2024')
    ).resolves.not.toThrow();

    const enrollmentWhere = (prisma.classEnrollment.findMany as any).mock.calls[0][0].where;
    expect(enrollmentWhere).toEqual({ studentId: 's1', class: { academicYearId: 'ay-2024' } });
  });

  it('DENIES a teacher who only covers the student in THIS year when asked for a PAST year', async () => {
    // Cross-year regression core: the student's CURRENT enrollment is active,
    // but their requested (past) year's enrollment is a DIFFERENT class the
    // teacher does not cover. The enrollment lookup must be filtered by the
    // requested academic year so the teacher's current-year coverage cannot
    // open the past-year raport.
    const otherUnit = user({ unitId: 'unit-other', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    // Past year enrollment resolves to an empty set of classes for this teacher.
    (prisma.classEnrollment.findMany as any).mockResolvedValue([]);

    await expect(
      RaportMerdekaService.validateStudentScope(otherUnit, 's1', 'ay-2023')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });

  it('teacherSubjects must be ACTIVE — an inactive assignment does not grant access', async () => {
    // Regression: previously the teacher lookup matched `TeacherSubject` rows
    // without checking `isActive`, so a deactivated teaching assignment kept
    // raport access alive. The OR branches must now require `isActive: true`.
    const sameUnit = user({ unitId: 'unit-smp-1', roleCode: 'SMPIT_GURU' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.classEnrollment.findMany as any).mockResolvedValue([{ classId: 'class-X' }]);
    // A teacher exists, but only via an INACTIVE subject assignment → denied.
    (prisma.teacher.findFirst as any).mockResolvedValue(null);

    await expect(
      RaportMerdekaService.validateStudentScope(sameUnit, 's1', 'ay-2024')
    ).rejects.toThrow(/tidak memiliki akses ke siswa di unit lain/);

    const teacherWhere = (prisma.teacher.findFirst as any).mock.calls[0][0].where;
    expect(teacherWhere.OR).toContainEqual({
      teacherSubjects: { some: { classId: { in: ['class-X'] }, isActive: true } },
    });
    expect(teacherWhere.OR).toContainEqual({
      unitId: 'unit-smp-1',
      teacherSubjects: { some: { classId: null, isActive: true } },
    });
  });
});
