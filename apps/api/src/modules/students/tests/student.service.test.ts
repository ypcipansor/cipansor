import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentService } from '../student.service';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // Needed by linkGuardian: creating a student must also produce the
    // guardian account, the StudentParent row and the guardian's unit role.
    studentParent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    userRoleAssignment: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    unit: {
      findFirst: vi.fn(),
    },
    // Santri yang dibuat tanpa rombel tetap mendapat baris riwayat unit,
    // disandarkan pada tahun ajaran aktif (utils/student-unit-history).
    academicYear: {
      findFirst: vi.fn(),
    },
    studentUnitEnrollment: {
      upsert: vi.fn(),
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
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

// Mock Password utility
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

      // Verify unitId is NOT enforced in where clause
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            unitId: expect.anything(), // Should check what 'where' actually contains
          }),
        })
      );
    });

    it('lets the yayasan board see every unit despite having no unitId', async () => {
      (prisma.student.findMany as any).mockResolvedValue([]);
      (prisma.student.count as any).mockResolvedValue(0);

      // A foundation role carries no unitId. The old check tested the legacy
      // `role`, which deriveLegacyRole maps to 'UNIT_ADMIN' for every YAYASAN_*
      // code, so this fell into the unit branch and filtered on 'none'.
      await service.findAll(
        { page: 1, limit: 10 },
        { role: 'UNIT_ADMIN' as any, roleCode: 'YAYASAN_KETUA', unitId: null }
      );

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ unitId: expect.anything() }),
        })
      );
    });

    it('lets boarding staff see santri from other academic units', async () => {
      (prisma.student.findMany as any).mockResolvedValue([]);
      (prisma.student.count as any).mockResolvedValue(0);

      // A muhafidz is seeded into SMP IT because a user has one unitId, but the
      // santri they teach are spread across SD IT and SMP IT.
      await service.findAll(
        { page: 1, limit: 10 },
        { role: 'TEACHER' as any, roleCode: 'MUHAFIDZ', unitId: 'unit-smpit' }
      );

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ unitId: expect.anything() }),
        })
      );
    });

    it('still pins an ordinary unit role to its own unit', async () => {
      (prisma.student.findMany as any).mockResolvedValue([]);
      (prisma.student.count as any).mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 10 },
        { role: 'TEACHER' as any, roleCode: 'SDIT_GURU', unitId: 'unit-sdit' }
      );

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-sdit' }),
        })
      );
    });
  });

  describe('create', () => {
    const mockInput = {
      name: 'New Student',
      nis: '12345',
      gender: 'MALE' as const,
      birthDate: new Date('2010-01-01'),
      birthPlace: 'Jakarta',
      address: 'Test Address',
      parentName: 'Parent',
      parentPhone: '08123456789',
      unitId: 'unit-1',
    };

    /** Mocks the guardian side so create() can run end to end. */
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
      // Setup mocks
      (prisma.student.findFirst as any).mockResolvedValue(null); // No existing NIS
      (prisma.user.findFirst as any).mockResolvedValue(null); // No existing Email
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1' }); // Unit exists
      mockGuardianPath();

      const mockCreatedUser = { id: 'user-1', email: '12345@student.cipansor.local' };
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

    it('should throw error if NIS already exists', async () => {
      (prisma.student.findFirst as any).mockResolvedValue({ id: 'existing' });

      await expect(service.create(mockInput)).rejects.toThrow('NIS already exists');
    });

    // The whole point of the change: parentName/parentPhone used to be stored
    // as text on the student row and nothing else, so the wali had no account,
    // no link and no unit scope — a child with no guardian in every sense that
    // the system can act on.
    it('links a real guardian, not just parent text fields', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1', type: 'SD_IT' });
      mockGuardianPath();

      (prisma.user.create as any)
        .mockResolvedValueOnce({ id: 'user-1' }) // the santri
        .mockResolvedValueOnce({ id: 'wali-1' }); // the wali
      (prisma.student.create as any).mockResolvedValue({ id: 'student-1' });

      await service.create(mockInput);

      // A guardian account was created…
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Parent', role: 'PARENT' }),
        })
      );

      // …the student was linked to it…
      expect(prisma.studentParent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studentId: 'student-1', parentId: 'wali-1' }),
        })
      );

      // …and the guardian got the unit role their child implies.
      expect(prisma.userRoleAssignment.create).toHaveBeenCalled();
    });

    it('reuses an existing guardian rather than creating a duplicate', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-1', type: 'SD_IT' });
      mockGuardianPath();

      // A wali already registered by phone — the second sibling must attach to
      // the same account, which is what keeps one login with several children.
      (prisma.user.findFirst as any)
        .mockResolvedValueOnce(null) // email uniqueness check for the santri
        .mockResolvedValueOnce({ id: 'wali-existing' }); // guardian lookup by phone

      (prisma.user.create as any).mockResolvedValue({ id: 'user-2' });
      (prisma.student.create as any).mockResolvedValue({ id: 'student-2' });

      await service.create({ ...mockInput, nis: '67890' });

      expect(prisma.studentParent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'wali-existing' }),
        })
      );
      // Only the santri's own account was created, not a second guardian.
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCompleteProfile', () => {
    const mockStudent = {
      id: 'student-1',
      user: { id: 'user-1', name: 'Santri A', email: 'a@x.id', isActive: true },
      unit: { id: 'unit-1', name: 'SMP IT', type: 'SMP_IT' },
      enrollments: [],
      parents: [
        {
          relation: 'father',
          parent: { id: 'parent-1', name: 'Ayah A', phone: '0812', email: 'ayah@x.id' },
        },
      ],
    };

    it('should throw not found for missing student', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(null);

      await expect(service.getCompleteProfile('missing')).rejects.toThrow();
    });

    it('should aggregate academic, attendance and behavior summaries', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent);
      // Newest-first grades: newer half avg 90, older half avg 70 -> UP
      (prisma.grade.findMany as any).mockResolvedValue([
        { percentage: 90, score: 90, maxScore: 100, subjectId: 'sub-1' },
        { percentage: 90, score: 90, maxScore: 100, subjectId: 'sub-2' },
        { percentage: null, score: 35, maxScore: 50, subjectId: 'sub-1' }, // 70%
        { percentage: 70, score: 70, maxScore: 100, subjectId: 'sub-2' },
      ]);
      (prisma.attendance.groupBy as any).mockResolvedValue([
        { status: 'PRESENT', _count: { id: 18 } },
        { status: 'SICK', _count: { id: 2 } },
      ]);
      (prisma.violation.aggregate as any).mockResolvedValue({
        _count: { id: 3 },
        _sum: { points: 15 },
      });
      (prisma.reward.aggregate as any).mockResolvedValue({
        _count: { id: 5 },
        _sum: { points: 40 },
      });

      const result = await service.getCompleteProfile('student-1');

      expect(result.academicSummary).toEqual({
        averageGrade: 80,
        totalSubjects: 2,
        trend: 'UP',
      });
      expect(result.attendanceSummary).toEqual({
        totalDays: 20,
        presentDays: 18,
        percentage: 90,
      });
      expect(result.behaviorSummary).toEqual({
        totalViolations: 3,
        totalRewards: 5,
        points: 25,
      });
      expect(result.parents).toEqual([
        {
          id: 'parent-1',
          name: 'Ayah A',
          relation: 'father',
          phone: '0812',
          email: 'ayah@x.id',
        },
      ]);
      // Counseling/medical data must never leak through this endpoint
      expect(result).not.toHaveProperty('counselingSessions');
      expect(result).not.toHaveProperty('medicalRecords');
    });

    it('should fall back to zeroes when the student has no records', async () => {
      (prisma.student.findFirst as any).mockResolvedValue({ ...mockStudent, parents: [] });
      (prisma.grade.findMany as any).mockResolvedValue([]);
      (prisma.attendance.groupBy as any).mockResolvedValue([]);
      (prisma.violation.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { points: null },
      });
      (prisma.reward.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { points: null },
      });

      const result = await service.getCompleteProfile('student-1');

      expect(result.academicSummary).toEqual({
        averageGrade: 0,
        totalSubjects: 0,
        trend: 'STABLE',
      });
      expect(result.attendanceSummary).toEqual({
        totalDays: 0,
        presentDays: 0,
        percentage: 0,
      });
      expect(result.behaviorSummary).toEqual({
        totalViolations: 0,
        totalRewards: 0,
        points: 0,
      });
    });
  });
});
