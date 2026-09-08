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
    },
    role: {
      findFirst: vi.fn(),
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
        unitId: 'u1',
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

      const result = await service.graduateStudent('s1', 2026);

      expect(prisma.classEnrollment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 's1', status: 'active' },
        data: { status: 'completed' },
      });
      expect(prisma.roomAssignment.updateMany).toHaveBeenCalledWith({
        where: { studentId: 's1', isActive: true },
        data: { isActive: false, endedAt: expect.any(Date) },
      });
      expect(result.status).toBe('alumni');
      expect(result.graduateYear).toBe(2026);
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
  });
});
