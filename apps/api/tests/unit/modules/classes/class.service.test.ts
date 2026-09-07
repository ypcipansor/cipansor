import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define mocks via vi.hoisted so they're available inside the hoisted vi.mock factories
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    class: {
      findUnique: vi.fn(),
    },
    classEnrollment: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock library
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

// Mock @prisma/client
vi.mock('@prisma/client', () => ({
  Gender: { MALE: 'MALE', FEMALE: 'FEMALE' },
  EnrollmentStatus: { ACTIVE: 'active', COMPLETED: 'completed' },
  PrismaClient: class {
    constructor() {
      return prismaMock;
    }
  },
}));

// Import service AFTER mocks
import { classService } from '../../../../src/modules/classes/class.service';
import { prisma } from '../../../../src/lib/prisma';
import { Gender } from '@prisma/client';

describe('Class Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(prisma));
  });

  describe('promoteStudents', () => {
    it('should promote students to target class', async () => {
      const studentIds = ['student-1', 'student-2'];
      const targetClassId = 'target-class-id';

      // Mock target class
      (prisma.class.findUnique as any).mockResolvedValue({
        id: targetClassId,
        capacity: 30,
      });

      (prisma.classEnrollment.count as any).mockResolvedValue(10);

      (prisma.classEnrollment.createMany as any).mockResolvedValue({ count: 2 });

      await classService.promoteStudents({ studentIds, targetClassId });

      // Should deactivate old enrollments
      expect(prisma.classEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId: { in: studentIds },
            status: 'active',
          },
          data: { status: 'completed' },
        })
      );

      // Should create new enrollments
      expect(prisma.classEnrollment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              studentId: 'student-1',
              classId: targetClassId,
              status: 'active',
            }),
            expect.objectContaining({
              studentId: 'student-2',
              classId: targetClassId,
              status: 'active',
            }),
          ]),
        })
      );
    });

    it('should throw error if class capacity exceeded', async () => {
      const studentIds = ['student-1', 'student-2'];
      const targetClassId = 'target-class-id';

      // Mock target class full
      (prisma.class.findUnique as any).mockResolvedValue({
        id: targetClassId,
        capacity: 30,
      });
      (prisma.classEnrollment.count as any).mockResolvedValue(29);

      await expect(classService.promoteStudents({ studentIds, targetClassId })).rejects.toThrow(
        'Target class capacity exceeded'
      );
    });
  });

  describe('getEnrollments', () => {
    it('should return enrollments with student details', async () => {
      const classId = 'class-id';
      const mockEnrollments = [
        {
          id: 'enrollment-id',
          studentId: 'student-id',
          classId: 'class-id',
          status: 'active',
          student: {
            id: 'student-id',
            nis: '12345',
            gender: Gender.MALE,
            user: {
              id: 'user-id',
              name: 'Student Name',
              email: 'student@example.com',
            },
          },
          enrolledAt: new Date(),
        },
      ];

      (prisma.classEnrollment.findMany as any).mockResolvedValue(mockEnrollments);

      const result = await classService.getEnrollments(classId);

      expect(prisma.classEnrollment.findMany).toHaveBeenCalledWith({
        where: {
          classId,
          status: 'active',
          student: { deletedAt: null },
        },
        include: {
          student: {
            select: {
              id: true,
              nisn: true,
              nik: true,
              gender: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          student: {
            user: {
              name: 'asc',
            },
          },
        },
      });

      expect(result).toEqual([
        {
          ...mockEnrollments[0],
          student: {
            ...mockEnrollments[0].student,
            name: mockEnrollments[0].student.user.name,
          },
        },
      ]);
    });
  });
});
