/**
 * Dashboard Service Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    teacher: {
      count: vi.fn(),
    },
    class: {
      count: vi.fn(),
    },
    unit: {
      count: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    attendance: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
    },
    tahfidzRecord: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    violation: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    reward: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    murojaahRecord: {
      aggregate: vi.fn(),
    },
    dashboardHistory: {
      findMany: vi.fn(),
    },
    hafidzStudent: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/realtime', () => ({
  getCurrentDashboardMetrics: vi.fn().mockResolvedValue({
    students: { total: 100, active: 90, change: 5 },
    teachers: { total: 20 },
    attendance: { rate: 85, present: 77, total: 90 },
    tahfidz: { totalHafidz: 10, avgQuality: 80 },
    timestamp: new Date().toISOString(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getStats', () => {
    it('should return dashboard stats without unit filter', async () => {
      // Setup mocks
      vi.mocked(prisma.student.count)
        .mockResolvedValueOnce(100) // totalStudents
        .mockResolvedValueOnce(90) // activeStudents
        .mockResolvedValueOnce(85); // lastMonthStudents
      vi.mocked(prisma.teacher.count).mockResolvedValue(20);
      vi.mocked(prisma.class.count).mockResolvedValue(15);
      vi.mocked(prisma.unit.count).mockResolvedValue(4);
      vi.mocked(prisma.attendance.count).mockResolvedValue(77);
      (vi.mocked(prisma.academicYear.findFirst) as any).mockResolvedValue({
        id: 'ay-1',
        name: '2024/2025',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2025-06-30'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getStats({});

      expect(result).toMatchObject({
        totalStudents: 100,
        totalTeachers: 20,
        totalClasses: 15,
        totalUnits: 4,
        attendanceRate: expect.any(Number),
      });
      expect(result.activeAcademicYear).toBeDefined();
      expect(result.activeAcademicYear?.name).toBe('2024/2025');
    });

    it('should filter by unit when unitId is provided', async () => {
      vi.mocked(prisma.student.count).mockResolvedValue(25);
      vi.mocked(prisma.teacher.count).mockResolvedValue(5);
      vi.mocked(prisma.class.count).mockResolvedValue(4);
      vi.mocked(prisma.unit.count).mockResolvedValue(1);
      vi.mocked(prisma.attendance.count).mockResolvedValue(20);
      vi.mocked(prisma.academicYear.findFirst).mockResolvedValue(null);

      await service.getStats({ unitId: 'unit-1' });

      // Verify unit filter was applied
      expect(prisma.student.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-1' }),
        })
      );
    });

    it('menyaring kehadiran lewat RIWAYAT unit, bukan unit santri sekarang', async () => {
      // Ini pembedaan yang jadi seluruh alasan tabel riwayat unit ada. Santri
      // yang naik dari TK ke SD IT punya satu `students.unit_id` (SD IT) dan
      // dua baris riwayat; dasbor TK yang menyaring lewat kolom itu akan
      // kehilangan dia, dan dasbor SD IT akan mengklaim kehadirannya di TK.
      vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as never);

      await service.getAttendanceStats({ unitId: 'unit-tkq' }, {});

      const arg = vi.mocked(prisma.attendance.findMany).mock.calls.at(-1)?.[0] as any;
      const filter = arg.where.student;
      expect(filter).toBeDefined();
      expect(JSON.stringify(filter)).toContain('unitEnrollments');
      // Santri yang belum punya baris riwayat sama sekali tetap terhitung lewat
      // unit sekarang — laporan yang diam-diam kehilangan orang lebih berbahaya
      // daripada laporan yang memakai unit sekarang.
      expect(JSON.stringify(filter)).toContain('unit-tkq');
    });

    it('should calculate student growth correctly', async () => {
      vi.mocked(prisma.student.count)
        .mockResolvedValueOnce(100) // totalStudents
        .mockResolvedValueOnce(90) // activeStudents (current)
        .mockResolvedValueOnce(80); // lastMonthStudents
      vi.mocked(prisma.teacher.count).mockResolvedValue(20);
      vi.mocked(prisma.class.count).mockResolvedValue(15);
      vi.mocked(prisma.unit.count).mockResolvedValue(4);
      vi.mocked(prisma.attendance.count).mockResolvedValue(77);
      vi.mocked(prisma.academicYear.findFirst).mockResolvedValue(null);

      const result = await service.getStats({});

      // Growth should be (90 - 80) / 80 * 100 = 12.5, rounded to 13
      expect(result.studentsGrowth).toBe(13);
    });
  });

  describe('getQuickStats', () => {
    it('should return quick stats', async () => {
      vi.mocked(prisma.student.count)
        .mockResolvedValueOnce(100) // totalStudents
        .mockResolvedValueOnce(90); // activeStudents
      vi.mocked(prisma.teacher.count).mockResolvedValue(20);
      vi.mocked(prisma.attendance.count).mockResolvedValue(77);

      const result = await service.getQuickStats({});

      expect(result).toEqual({
        totalStudents: 100,
        activeStudents: 90,
        totalTeachers: 20,
        todayAttendance: 77,
        attendanceRate: 86, // 77/90 * 100 rounded
      });
    });
  });

  describe('getAttendanceStats', () => {
    it('should aggregate attendance by date', async () => {
      const mockRecords = [
        { date: new Date('2024-01-15'), status: 'PRESENT' },
        { date: new Date('2024-01-15'), status: 'PRESENT' },
        { date: new Date('2024-01-15'), status: 'ABSENT' },
        { date: new Date('2024-01-16'), status: 'PRESENT' },
        { date: new Date('2024-01-16'), status: 'SICK' },
      ];

      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockRecords as any);

      const result = await service.getAttendanceStats({}, {});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        date: '2024-01-15',
        present: 2,
        absent: 1,
        sick: 0,
        excused: 0,
      });
      expect(result[1]).toMatchObject({
        date: '2024-01-16',
        present: 1,
        sick: 1,
      });
    });

    it('should use default date range when not provided', async () => {
      vi.mocked(prisma.attendance.findMany).mockResolvedValue([]);

      await service.getAttendanceStats({}, {});

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('getFinanceStats', () => {
    it('should return finance statistics', async () => {
      vi.mocked(prisma.invoice.aggregate)
        .mockResolvedValueOnce({ _sum: { amount: 100000000n } } as any)
        .mockResolvedValueOnce({ _sum: { amount: 75000000n } } as any)
        .mockResolvedValueOnce({ _sum: { amount: 25000000n } } as any);

      vi.mocked(prisma.payment.findMany).mockResolvedValue([
        {
          id: 'p-1',
          amount: { toNumber: () => 1000000 },
          createdAt: new Date(),
          invoice: {
            student: {
              user: { name: 'Ahmad' },
            },
          },
        },
      ] as any);

      const result = await service.getFinanceStats({});

      expect(result).toMatchObject({
        totalBilled: 100000000,
        totalPaid: 75000000,
        totalUnpaid: 25000000,
      });
      expect(result.recentPayments).toHaveLength(1);
      expect(result.recentPayments[0].studentName).toBe('Ahmad');
    });
  });

  describe('getTahfidzStats', () => {
    it('should return tahfidz statistics', async () => {
      vi.mocked(prisma.tahfidzRecord.aggregate).mockResolvedValue({
        _sum: { totalAyah: 3000 },
      } as any);

      // Two groupBy calls: per student (the top-5 ranking) and per student
      // per juz (juz counted against each juz's own size).
      vi.mocked(prisma.tahfidzRecord.groupBy).mockImplementation((({ by }: { by: string[] }) =>
        Promise.resolve(
          by.includes('juz')
            ? [
                { studentId: 's-1', juz: 30, _sum: { totalAyah: 564 } },
                { studentId: 's-1', juz: 29, _sum: { totalAyah: 431 } },
                { studentId: 's-1', juz: 28, _sum: { totalAyah: 137 } },
                { studentId: 's-2', juz: 30, _sum: { totalAyah: 564 } },
                { studentId: 's-3', juz: 30, _sum: { totalAyah: 300 } },
              ]
            : [
                { studentId: 's-1', _sum: { totalAyah: 1132 } },
                { studentId: 's-2', _sum: { totalAyah: 564 } },
                { studentId: 's-3', _sum: { totalAyah: 300 } },
              ]
        )) as any);

      vi.mocked(prisma.student.findMany).mockResolvedValue([
        { id: 's-1', user: { name: 'Ahmad' }, unit: { name: 'SMA Quran' } },
        { id: 's-2', user: { name: 'Budi' }, unit: { name: 'SMP IT' } },
        { id: 's-3', user: { name: 'Citra' }, unit: { name: 'SD IT' } },
      ] as any);

      vi.mocked(prisma.tahfidzRecord.findMany).mockResolvedValue([]);

      const result = await service.getTahfidzStats({}, { period: 'month' });

      expect(result).toMatchObject({
        totalMemorized: 3000,
      });
      // (3 + 1 + 300/564) / 3 = 1.51 → 1.5
      expect(result.averageJuz).toBe(1.5);
      expect(result.topStudents.map((s) => s.totalJuz)).toEqual([3, 1, 0.5]);
    });

    it('should handle empty tahfidz records', async () => {
      vi.mocked(prisma.tahfidzRecord.aggregate).mockResolvedValue({
        _sum: { totalAyah: null },
      } as any);
      vi.mocked(prisma.tahfidzRecord.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.student.findMany).mockResolvedValue([]);
      vi.mocked(prisma.tahfidzRecord.findMany).mockResolvedValue([]);

      const result = await service.getTahfidzStats({}, {});

      expect(result.totalMemorized).toBe(0);
      expect(result.averageJuz).toBe(0);
      expect(result.topStudents).toHaveLength(0);
    });
  });

  describe('getViolationRewardStats', () => {
    it('should return violation and reward statistics', async () => {
      vi.mocked(prisma.violation.count).mockResolvedValue(10);
      vi.mocked(prisma.reward.count).mockResolvedValue(25);
      vi.mocked(prisma.violation.findMany).mockResolvedValue([
        {
          id: 'v-1',
          type: 'MINOR',
          points: 5,
          createdAt: new Date(),
          student: { user: { name: 'Ahmad' } },
        },
      ] as any);
      vi.mocked(prisma.reward.findMany).mockResolvedValue([
        {
          id: 'r-1',
          type: 'ACADEMIC',
          points: 10,
          createdAt: new Date(),
          student: { user: { name: 'Budi' } },
        },
      ] as any);

      const result = await service.getViolationRewardStats({}, { period: 'month' });

      expect(result).toMatchObject({
        totalViolations: 10,
        totalRewards: 25,
      });
      expect(result.recentViolations).toBeDefined();
      expect(result.recentRewards).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics with history and alerts', async () => {
      // Setup all required mocks for getMetrics
      vi.mocked(prisma.dashboardHistory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.student.count).mockResolvedValue(100);
      vi.mocked(prisma.attendance.count).mockResolvedValue(85);
      vi.mocked(prisma.invoice.count).mockResolvedValue(5);
      vi.mocked(prisma.murojaahRecord.aggregate).mockResolvedValue({
        _avg: { qualityScore: 80 },
      } as any);
      vi.mocked(prisma.tahfidzRecord.findMany).mockResolvedValue([]);

      const result = await service.getMetrics({});

      // The result should have the expected structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('recent');
      expect(result).toHaveProperty('alerts');

      // Check current structure (comes from mocked getCurrentDashboardMetrics)
      if (result.current) {
        expect(result.current).toHaveProperty('students');
        expect(result.current).toHaveProperty('attendance');
        expect(result.current).toHaveProperty('tahfidz');
      }
    });
  });
});
