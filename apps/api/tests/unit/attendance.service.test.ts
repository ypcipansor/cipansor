import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { prisma } from '../../src/lib/prisma';
import { AttendanceStatus, UserRole } from '@prisma/client';

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    attendance: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
    },
    classEnrollment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    class: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    it('should return paginated attendance records', async () => {
      const mockRecords = [
        {
          id: '1',
          status: AttendanceStatus.PRESENT,
          date: new Date(),
          student: { user: { name: 'John' } },
        },
      ];
      (prisma.attendance.findMany as any).mockResolvedValue(mockRecords);
      (prisma.attendance.count as any).mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { sub: 'u-sa', roleCode: 'SUPER_ADMIN', unitId: null }
      );

      expect(result.records).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(prisma.attendance.findMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create attendance record', async () => {
      const input = {
        studentId: 'student-1',
        classId: 'class-1',
        date: new Date(),
        status: 'PRESENT' as any, // Using string to simulate shared type input
      };

      (prisma.student.findFirst as any).mockResolvedValue({ id: 'student-1' });
      (prisma.classEnrollment.findFirst as any).mockResolvedValue({ id: 'enrollment-1' });
      (prisma.attendance.findFirst as any).mockResolvedValue(null); // No duplicate
      (prisma.attendance.create as any).mockResolvedValue({
        id: 'att-1',
        ...input,
        status: AttendanceStatus.PRESENT,
        student: {
          unitId: 'unit-1',
          user: { id: 'u-1', name: 'Test Student' },
          unit: { id: 'unit-1', name: 'Unit 1' },
        },
        class: { id: 'class-1', name: 'Class 1' },
      });

      const result = await service.create(input, 'user-1');

      expect(result.id).toBe('att-1');
      expect(result.status).toBe('PRESENT');
      expect(prisma.attendance.create).toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('should calculate attendance summary correctly', async () => {
      const mockGroupBy = [
        { status: 'PRESENT', _count: { _all: 80 } },
        { status: 'ABSENT', _count: { _all: 10 } },
        { status: 'LATE', _count: { _all: 5 } },
        { status: 'SICK', _count: { _all: 3 } },
        { status: 'EXCUSED', _count: { _all: 2 } },
      ];
      (prisma.attendance.groupBy as any).mockResolvedValue(mockGroupBy);
      (prisma.attendance.count as any).mockResolvedValue(100);

      const result = await service.getSummary(
        { startDate: '2023-01-01', endDate: '2023-01-31' },
        { sub: 'u-sa', roleCode: 'SUPER_ADMIN', unitId: null }
      );

      expect(result.counts.total).toBe(100);
      expect(result.counts.present).toBe(80);
      expect(result.counts.absent).toBe(10);
      expect(result.counts.late).toBe(5);
      expect(result.counts.sick).toBe(3);
      expect(result.counts.excused).toBe(2);

      expect(result.percentages.present).toBe('80.0');
      expect(result.percentages.absent).toBe('10.0');
    });

    it('should handle zero counts gracefully', async () => {
      (prisma.attendance.groupBy as any).mockResolvedValue([]);
      (prisma.attendance.count as any).mockResolvedValue(0);

      const result = await service.getSummary(
        { startDate: '2023-01-01', endDate: '2023-01-31' },
        { sub: 'u-sa', roleCode: 'SUPER_ADMIN', unitId: null }
      );

      expect(result.counts.total).toBe(0);
      expect(result.counts.present).toBe(0);
      expect(result.percentages.present).toBe('0');
    });
  });
});
