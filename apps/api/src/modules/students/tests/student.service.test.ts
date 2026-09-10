import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentService } from '../student.service';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    studentParent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    userRoleAssignment: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    unit: {
      findFirst: vi.fn(),
    },
    grade: {
      findMany: vi.fn(),
    },
    attendance: {
      groupBy: vi.fn(),
    },
    violation: {
      aggregate: vi.fn(),
    },
    reward: {
      aggregate: vi.fn(),
    },
    classEnrollment: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    roomAssignment: {
      updateMany: vi.fn(),
    },
    alumni: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
}));

describe('StudentService', () => {
  let service: StudentService;

  beforeEach(() => {
    service = new StudentService();
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated students filtered by unit for admin', async () => {
      const mockStudents = [
        { id: '1', name: 'Student 1', enrollments: [] },
        { id: '2', name: 'Student 2', enrollments: [] },
      ];

      (prisma.student.findMany as any).mockResolvedValue(mockStudents);
      (prisma.student.count as any).mockResolvedValue(2);

      const result = await service.findAll(
        { page: 1, limit: 10, unitId: 'unit-1' },
        { role: 'ADMIN' as any, unitId: 'unit-1' }
      );

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            unitId: 'unit-1',
          }),
          skip: 0,
          take: 10,
        })
      );

      expect(result.students).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should allow SUPER_ADMIN to view all units', async () => {
      (prisma.student.findMany as any).mockResolvedValue([]);
      (prisma.student.count as any).mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 10 },
        { role: UserRole.SUPER_ADMIN, roleCode: 'SUPER_ADMIN', unitId: null }
      );

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            unitId: expect.anything(),
          }),
        })
      );
    });
  });

  describe('create', () => {
    const mockInput = {
      name: 'New Student',
      nisn: '0012345678',
      nik: '3201000000000001',
      gender: 'MALE' as const,
      birthDate: new Date('2010-01-01'),
      birthPlace: 'Jakarta',
      address: 'Test Address',
      parentName: 'Parent',
      parentPhone: '08123456789',
      unitId: 'unit-1',
    };

    function mockGuardianPath() {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.studentParent.findFirst as any).mockResolvedValue(null);
      (prisma.studentParent.create as any).mockResolvedValue({ id: 'link-1' });
      (prisma.studentParent.findMany as any).mockResolvedValue([
        { student: { unitId: 'unit-1', unit: { type: 'SD_IT' } } },
      ]);
      (prisma.userRoleAssignment.findMany as any).mockResolvedValue([]);
      (prisma.userRoleAssignment.create as any).mockResolvedValue({ id: 'ura-1' });
      (prisma.role.findFirst as any).mockResolvedValue({ id: 'role-ortu' });
    }

    it('should create student and user successfully', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' });
      mockGuardianPath();

      const mockCreatedUser = { id: 'user-1', email: '0012345678@student.cipansor.local' };
      const mockCreatedStudent = { id: 'student-1', userId: 'user-1', ...mockInput };

      (prisma.user.create as any).mockResolvedValue(mockCreatedUser);
      (prisma.student.create as any).mockResolvedValue(mockCreatedStudent);

      const result = await service.create(mockInput);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: mockInput.name,
            role: UserRole.STUDENT,
          }),
        })
      );
      expect(prisma.student.create).toHaveBeenCalled();
      expect(result).toEqual(mockCreatedStudent);
    });

    it('should throw error if NISN already exists', async () => {
      (prisma.student.findFirst as any).mockResolvedValue({ id: 'existing' });

      await expect(service.create(mockInput)).rejects.toThrow('NISN already exists');
    });
  });

  describe('graduation and alumni lookup', () => {
    it('should mark student as graduated alumni', async () => {
      const mockStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'u1',
        unit: { id: 'u1', type: 'SD_IT' },
        status: 'active',
        gender: 'MALE',
        birthPlace: 'Jakarta',
        birthDate: new Date(),
        parentPhone: '08123456789',
        address: 'Jl. Test',
        user: { name: 'Student 1', email: 's1@cipansor.local' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);
      (prisma.student.update as any).mockResolvedValue({
        id: 's1',
        status: 'alumni',
        graduateYear: 2026,
      });
      (prisma.role.findMany as any).mockResolvedValue([
        { id: 'student-role-1' },
        { id: 'student-role-2' },
      ]);

      const result = await service.graduateStudent('s1', 2026);

      expect(prisma.classEnrollment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 's1', status: 'active' },
        data: { status: 'completed' },
      });
      expect(prisma.roomAssignment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 's1', isActive: true },
        data: { isActive: false, endedAt: expect.any(Date) },
      });
      // Graduation must revoke the student's login access so they do not keep
      // authenticated student roles after becoming alumni.
      expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isActive: true,
          roleId: { in: ['student-role-1', 'student-role-2'] },
        },
        data: { isActive: false, isPrimary: false },
      });
      expect(result.status).toBe('alumni');
      expect(result.graduateYear).toBe(2026);
    });

    it('should key each graduation snapshot on (studentId, unitId, graduationYear) instead of overwriting the single row', async () => {
      const mockStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'u2', // student has since progressed to a new unit
        unit: { id: 'u2', type: 'SMP_IT' },
        status: 'active',
        gender: 'MALE',
        birthPlace: 'Bandung',
        birthDate: new Date('2010-05-01'),
        parentPhone: '081298765432',
        address: 'Jl. Baru',
        user: { name: 'Student 1 Updated', email: 's1-new@cipansor.local' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);
      (prisma.student.update as any).mockResolvedValue({
        id: 's1',
        status: 'alumni',
        graduateYear: 2026,
      });
      (prisma.role.findMany as any).mockResolvedValue([]);

      await service.graduateStudent('s1', 2026);

      // ISSUE #3: the Alumni row is keyed on the composite (studentId, unitId,
      // graduationYear) so a graduation in a NEW unit/year creates its own row
      // and never erases the Alumni snapshot from the student's prior unit. The
      // `update` branch refreshes the profile of the SAME snapshot in place and
      // MUST NOT mutate its composite identity (unitId / graduationYear).
      const upsertCall = (prisma.alumni.upsert as any).mock.calls[0][0];
      expect(upsertCall.where).toEqual({
        studentId_unitId_graduationYear: {
          studentId: 's1',
          unitId: 'u2',
          graduationYear: 2026,
        },
      });
      expect(upsertCall.create).toEqual(
        expect.objectContaining({
          studentId: 's1',
          unitId: 'u2',
          graduationYear: 2026,
          registrationNo: expect.stringContaining('u2-'.toUpperCase()),
          name: 'Student 1 Updated',
          status: 'ACTIVE',
        })
      );
      // The update branch must not move the row to another unit/year.
      expect(upsertCall.update).toEqual(
        expect.objectContaining({
          name: 'Student 1 Updated',
          gender: 'MALE',
          birthPlace: 'Bandung',
          birthDate: mockStudent.birthDate,
          email: 's1-new@cipansor.local',
          phone: '081298765432',
          address: 'Jl. Baru',
          status: 'ACTIVE',
        })
      );
      expect(upsertCall.update).not.toHaveProperty('unitId');
      expect(upsertCall.update).not.toHaveProperty('graduationYear');
    });

    it('should find internal alumni by NIK or NISN', async () => {
      const mockStudent = {
        id: 's1',
        nisn: '0012345678',
        nik: '3201000000000001',
        status: 'alumni',
      };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);

      const result = await service.findInternalAlumniByIdentifier('0012345678');

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ nik: '0012345678' }, { nisn: '0012345678' }],
          }),
        })
      );
      expect(result).toEqual({
        ...mockStudent,
        nisn: '0012345678',
      });
    });

    it('should NOT scope the alumni lookup to the caller unit (cross-unit re-enrollment)', async () => {
      const mockStudent = { id: 's9', nisn: '0012345678', status: 'alumni', unitId: 'unit-sdit' };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);

      // A target-unit (SMP IT) caller searching for an alumnus still recorded in
      // the source unit (SD IT) must be able to find it — the lookup is the
      // entry point to the legitimate progression flow.
      const caller = { roleCode: 'SMPIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'unit-smpit' };
      const result = await service.findInternalAlumniByIdentifier('0012345678', caller);

      const findFirstCall = (prisma.student.findFirst as any).mock.calls[0][0];
      expect(findFirstCall.where).toEqual(
        expect.objectContaining({ status: 'alumni', OR: [{ nik: '0012345678' }, { nisn: '0012345678' }] })
      );
      // The lookup must NOT be pinned to the caller's unit, but it IS pinned to
      // `status: 'alumni'` so an active student in another unit is never matched.
      expect(findFirstCall.where.unitId).toBeUndefined();
      expect(result).toEqual(mockStudent);
    });

    it('should reject a caller from a different unit when graduating', async () => {
      const mockStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'u-sdit',
        unit: { id: 'u-sdit', type: 'SD_IT' },
        status: 'active',
        gender: 'MALE',
        birthPlace: 'Jakarta',
        birthDate: new Date(),
        parentPhone: '08123456789',
        address: 'Jl. Test',
        user: { name: 'Student 1', email: 's1@cipansor.local' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);

      // An SMP IT staffer has no business graduating an SD IT student.
      const caller = { roleCode: 'SMPIT_ADMIN', role: 'UNIT_ADMIN', unitId: 'u-smpit' };
      await expect(service.graduateStudent('s1', 2026, caller)).rejects.toThrow(
        'You can only graduate students in your own unit'
      );
      expect(prisma.classEnrollment.updateMany).not.toHaveBeenCalled();
    });

    it('should allow a foundation/cross-unit caller to graduate across units', async () => {
      const mockStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'u-sdit',
        unit: { id: 'u-sdit', type: 'SD_IT' },
        status: 'active',
        gender: 'MALE',
        birthPlace: 'Jakarta',
        birthDate: new Date(),
        parentPhone: '08123456789',
        address: 'Jl. Test',
        user: { name: 'Student 1', email: 's1@cipansor.local' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);
      (prisma.student.update as any).mockResolvedValue({
        id: 's1',
        status: 'alumni',
        graduateYear: 2026,
      });
      (prisma.role.findMany as any).mockResolvedValue([]);

      const caller = { roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null };
      const result = await service.graduateStudent('s1', 2026, caller);

      expect(result.status).toBe('alumni');
      // seesAllUnits callers are not subject to the caller-unit restriction.
      expect(prisma.classEnrollment.updateMany).toHaveBeenCalled();
    });
  });

  describe('create — lifelong-identifier rule', () => {
    it('should reject a non-TK student created without any permanent identifier', async () => {
      const input = {
        name: 'No Identity',
        gender: 'MALE' as const,
        birthDate: new Date('2012-01-01'),
        birthPlace: 'Jakarta',
        address: 'Test Address',
        parentName: 'Parent',
        parentPhone: '08123456789',
        unitId: 'unit-sdit',
      };
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-sdit', type: 'SD_IT' });

      await expect(service.create(input as any)).rejects.toThrow(
        'NISN atau NIK wajib diisi untuk menerima siswa'
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.student.create).not.toHaveBeenCalled();
    });

    it('should allow a TK_QURAN student created without any permanent identifier', async () => {
      const input = {
        name: 'TK Kid',
        gender: 'MALE' as const,
        birthDate: new Date('2019-01-01'),
        birthPlace: 'Jakarta',
        address: 'Test Address',
        parentName: 'Parent',
        parentPhone: '08123456789',
        unitId: 'unit-tk',
      };
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-tk', type: 'TK_QURAN' });
      (prisma.user.create as any).mockResolvedValue({ id: 'user-1', email: 'x@student.cipansor.local' });
      (prisma.student.create as any).mockResolvedValue({ id: 'student-1', userId: 'user-1' });
      (prisma.studentParent.findFirst as any).mockResolvedValue(null);
      (prisma.studentParent.create as any).mockResolvedValue({ id: 'link-1' });
      (prisma.studentParent.findMany as any).mockResolvedValue([
        { student: { unitId: 'unit-tk', unit: { type: 'TK_QURAN' } } },
      ]);
      (prisma.userRoleAssignment.findMany as any).mockResolvedValue([]);
      (prisma.userRoleAssignment.create as any).mockResolvedValue({ id: 'ura-1' });
      (prisma.role.findFirst as any).mockResolvedValue({ id: 'role-ortu' });

      const result = await service.create(input as any);
      expect(result.id).toBe('student-1');
      expect(prisma.student.create).toHaveBeenCalled();
    });
  });

  describe('update — must not wipe a non-TK student identity', () => {
    it('should reject clearing both identifiers for a non-TK student that has one', async () => {
      const existingStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'unit-sdit',
        nisn: '0012345678',
        nik: null,
        user: { id: 'user-1' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(existingStudent);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-sdit', type: 'SD_IT' });

      await expect(
        service.update('s1', { nisn: null, nik: null } as any, {
          role: 'UNIT_ADMIN',
          roleCode: 'SDIT_ADMIN',
          unitId: 'unit-sdit',
        })
      ).rejects.toThrow('Minimal satu identifier wajib diisi (NISN atau NIK)');
    });

    it('should allow a TK_QURAN student to clear both identifiers', async () => {
      const existingStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'unit-tk',
        nisn: null,
        nik: '3201000000000001',
        user: { id: 'user-1' },
      };
      (prisma.student.findFirst as any).mockResolvedValue(existingStudent);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-tk', type: 'TK_QURAN' });
      (prisma.student.update as any).mockResolvedValue({
        id: 's1',
        nisn: null,
        nik: null,
        status: 'active',
      });

      const result = await service.update('s1', { nisn: null, nik: null } as any);
      expect(result.nisn).toBeNull();
      expect(prisma.student.update).toHaveBeenCalled();
    });
    it('should reject a PARTIAL clear that would leave a non-TK student without any identifier (ISSUE #6)', async () => {
      // Bug: a payload sending only `nisn: null` (omitting `nik`) previously
      // slipped past the "clears BOTH" guard and the non-alumni update wrote
      // `nisn: null` while leaving `nik` untouched-but-absent, ending with a
      // non-TK student that has neither NISN nor NIK.
      const existingStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'unit-sdit',
        nisn: '0012345678',
        nik: null,
        user: { id: 'user-1' },
      };
      // Send `nisn: null` while OMITTING `nik` (undefined). The effective
      // identity after merge is (nisn=null, nik=existing=null) = empty, so a
      // non-TK student must be rejected even though only one field was sent.
      (prisma.student.findFirst as any).mockResolvedValue(existingStudent);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-sdit', type: 'SD_IT' });

      await expect(service.update('s1', { nisn: null } as any)).rejects.toThrow(
        'Minimal satu identifier wajib diisi (NISN atau NIK)'
      );
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('should KEEP the existing identifier when only one field is sent (no accidental erase)', async () => {
      const existingStudent = {
        id: 's1',
        userId: 'user-1',
        unitId: 'unit-sdit',
        nisn: '0012345678',
        nik: null,
        user: { id: 'user-1' },
      };
      // Updating `nik` while omitting `nisn` (undefined) must KEEP the retained
      // NISN — the effective identity stays non-empty, so the update proceeds.
      // The main student lookup returns the existing record; the NISN/NIK
      // uniqueness probes return null (no other student holds that value).
      (prisma.student.findFirst as any).mockResolvedValueOnce(existingStudent);
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-sdit', type: 'SD_IT' });
      (prisma.student.update as any).mockResolvedValue({
        id: 's1',
        nisn: '0012345678',
        nik: '3201000000000002',
        status: 'active',
      });

      const result = await service.update('s1', { nik: '3201000000000002' } as any);
      expect(result.nik).toBe('3201000000000002');
      expect(result.nisn).toBe('0012345678');
      expect(prisma.student.update).toHaveBeenCalled();
    });
  });
});
