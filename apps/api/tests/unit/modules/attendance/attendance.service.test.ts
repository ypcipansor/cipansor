import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock Prisma Client before importing service.
//
// `importOriginal` rather than a hand-listed enum map: the service now reaches
// `resolve-unit-id`, which reads `RoleCode` at module load, so a mock that lists
// only `UserRole` fails as soon as an import below it grows. Spreading the real
// module keeps every enum; `Prisma` is still overridden with the shape the test
// needs.
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    Prisma: {
      AttendanceWhereInput: vi.fn(),
    },
  };
});

import { AttendanceService } from '../../../../src/modules/attendance/attendance.service';
import { prisma } from '../../../../src/lib/prisma';
import { AttendanceStatus } from '@cipansor/shared';

const UserRole = {
  TEACHER: 'TEACHER',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
};

// Mock prisma
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    attendance: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    class: {
      findUnique: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
    },
    classEnrollment: {
      findFirst: vi.fn(),
    },
  },
}));

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(() => {
    service = new AttendanceService();
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated results with date filtering', async () => {
      const mockDate = new Date('2023-10-27T10:00:00Z');
      const query = {
        page: 1,
        limit: 10,
        date: '2023-10-27',
      };

      const mockRecords = [
        {
          id: '1',
          date: mockDate,
          status: 'PRESENT', // Prisma returns string/enum
          createdAt: new Date(),
          updatedAt: new Date(),
          student: { user: { id: 'u1', name: 'Student 1' } },
          class: { id: 'c1', name: 'Class 1' },
          recordedBy: { id: 't1', name: 'Teacher 1' },
        },
      ];

      (prisma.attendance.findMany as any).mockResolvedValue(mockRecords);
      (prisma.attendance.count as any).mockResolvedValue(1);

      const result = await service.findAll(query, {
        sub: 'u-guru',
        roleCode: 'SMPIT_GURU',
        unitId: 'unit1',
      });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].status).toBe(AttendanceStatus.PRESENT);

      // Verify date filter logic
      const callArgs = (prisma.attendance.findMany as any).mock.calls[0][0];
      expect(callArgs.where.date.gte).toBeInstanceOf(Date);
      expect(callArgs.where.date.lte).toBeInstanceOf(Date);
      // Should cover the whole day in UTC
      expect(callArgs.where.date.gte.toISOString()).toContain('2023-10-27T00:00:00');
    });
  });

  describe('getSummary', () => {
    it('should correctly calculate summary and percentages', async () => {
      const query = {
        startDate: '2023-10-01',
        endDate: '2023-10-31',
        classId: 'c1',
      };

      // Mock groupBy result
      const mockGroupBy = [
        { status: 'PRESENT', _count: { _all: 20 } },
        { status: 'ABSENT', _count: { _all: 5 } },
      ];
      (prisma.attendance.groupBy as any).mockResolvedValue(mockGroupBy);
      (prisma.attendance.count as any).mockResolvedValue(25);

      const result = await service.getSummary(query, {
        sub: 'u-guru',
        roleCode: 'SMPIT_GURU',
        unitId: 'unit1',
      });

      expect(result.counts.total).toBe(25);
      expect(result.counts.present).toBe(20);
      expect(result.counts.absent).toBe(5);
      expect(result.counts.late).toBe(0); // Default

      expect(result.percentages.present).toBe('80.0'); // (20/25)*100
      expect(result.percentages.absent).toBe('20.0'); // (5/25)*100
    });

    it('should handle case-insensitive or mismatched enum keys gracefully', async () => {
      const query = { startDate: '2023-10-01', endDate: '2023-10-31' };

      // Mock groupBy result with 'PERMISSION' which maps to 'excused'
      const mockGroupBy = [{ status: 'PERMISSION', _count: { _all: 3 } }];
      (prisma.attendance.groupBy as any).mockResolvedValue(mockGroupBy);
      (prisma.attendance.count as any).mockResolvedValue(3);

      const result = await service.getSummary(query, {
        sub: 'u-guru',
        roleCode: 'SMPIT_GURU',
        unitId: 'unit1',
      });

      expect(result.counts.excused).toBe(3);
      expect(result.percentages.excused).toBe('100.0');
    });

    it('should add permission count to existing excused count', async () => {
      const query = { startDate: '2023-10-01', endDate: '2023-10-31' };

      // Mock groupBy result with both EXCUSED and PERMISSION
      const mockGroupBy = [
        { status: 'EXCUSED', _count: { _all: 2 } },
        { status: 'PERMISSION', _count: { _all: 3 } },
      ];
      (prisma.attendance.groupBy as any).mockResolvedValue(mockGroupBy);
      (prisma.attendance.count as any).mockResolvedValue(5);

      const result = await service.getSummary(query, {
        sub: 'u-guru',
        roleCode: 'SMPIT_GURU',
        unitId: 'unit1',
      });

      expect(result.counts.excused).toBe(5); // 2 + 3
    });
  });

  describe('update', () => {
    it('should update attendance successfully when ignoring self in duplicate check', async () => {
      const id = 'att1';
      const input = { status: AttendanceStatus.ABSENT };
      const currentUser = { role: UserRole.TEACHER, unitId: 'unit1' };

      const existingRecord = {
        id: 'att1',
        studentId: 's1',
        classId: 'c1',
        date: new Date('2023-10-27T00:00:00Z'),
        status: 'PRESENT',
        student: { unitId: 'unit1' },
      };

      (prisma.attendance.findUnique as any).mockResolvedValue(existingRecord);
      // Mock findMany returns nothing (no OTHER duplicates) OR returns self
      // The service logic: findMany checks for matching student/class/date.
      // It might return 'att1' itself.
      (prisma.attendance.findMany as any).mockResolvedValue([{ id: 'att1', studentId: 's1' }]);

      const updatedRecord = { ...existingRecord, status: 'ABSENT' };
      (prisma.attendance.update as any).mockResolvedValue(updatedRecord);

      const result = await service.update(id, input, currentUser);

      expect(result.status).toBe(AttendanceStatus.ABSENT);
      expect(prisma.attendance.update).toHaveBeenCalled();
    });

    it('should throw forbidden error if updating attendance from another unit', async () => {
      const id = 'att1';
      const input = { status: AttendanceStatus.ABSENT };
      const currentUser = { role: UserRole.TEACHER, unitId: 'unit2' }; // Different unit

      const existingRecord = {
        id: 'att1',
        studentId: 's1',
        classId: 'c1',
        date: new Date('2023-10-27T00:00:00Z'),
        status: 'PRESENT',
        student: { unitId: 'unit1' },
      };

      (prisma.attendance.findUnique as any).mockResolvedValue(existingRecord);

      await expect(service.update(id, input, currentUser)).rejects.toThrow('Access denied');
    });
  });
});
