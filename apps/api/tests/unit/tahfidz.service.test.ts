import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TahfidzService } from '../../src/modules/tahfidz/tahfidz.service';
import { prisma } from '../../src/lib/prisma';
import { Errors } from '../../src/middleware/error';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tahfidzRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('TahfidzService', () => {
  let tahfidzService: TahfidzService;

  beforeEach(() => {
    tahfidzService = new TahfidzService();
    vi.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('should calculate completed juz based on assessment scores >= 60', async () => {
      // Mock data
      const mockTotalRecords = 100;
      const mockUniqueStudents = [{ studentId: 's1' }, { studentId: 's2' }];
      const mockRecordsByType = [
        { activityType: 'ZIYADAH', _count: { _all: 50 } },
        { activityType: 'MUROJAAH', _count: { _all: 30 } },
      ];
      const mockMonthlyActivity = [
        { month: 1, type: 'ZIYADAH', count: BigInt(10) },
        { month: 1, type: 'MUROJAAH', count: BigInt(5) },
      ];

      // Mock progress by juz - ONE completed (passed assessment)
      const mockProgressByJuz = [
        { juz: 1, student_count: BigInt(10), completed_count: BigInt(5) }, // 5 completed
        { juz: 2, student_count: BigInt(8), completed_count: BigInt(0) }, // 0 completed
        { juz: 30, student_count: BigInt(20), completed_count: BigInt(15) }, // 15 completed
      ];

      const mockRecordsByGrade = [{ grade: 'MUMTAZ', count: BigInt(10) }];

      const mockTopStudentsData = [{ studentId: 's1', _sum: { totalAyah: 100 } }];

      const mockTopStudentDetails = [{ id: 's1', user: { name: 'Student 1' }, nisn: '123' }];

      const mockAllJuzCounts = [
        { studentId: 's1', juz: 1, _count: { juz: 1 } },
        { studentId: 's1', juz: 2, _count: { juz: 1 } },
      ];

      const mockRecentRecords: unknown[] = [];

      // Setup mocks
      (prisma.tahfidzRecord.count as any).mockResolvedValue(mockTotalRecords);
      (prisma.tahfidzRecord.findMany as any).mockResolvedValue(mockUniqueStudents as any);
      (prisma.tahfidzRecord.groupBy as any).mockResolvedValueOnce(mockRecordsByType as any); // First call for type
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce(mockMonthlyActivity) // Monthly
        .mockResolvedValueOnce(mockProgressByJuz) // Progress
        .mockResolvedValueOnce(mockRecordsByGrade); // Grades

      (prisma.tahfidzRecord.groupBy as any).mockResolvedValueOnce(mockTopStudentsData as any); // Top students
      (prisma.student.findMany as any).mockResolvedValue(mockTopStudentDetails as any);
      (prisma.tahfidzRecord.groupBy as any).mockResolvedValueOnce(mockAllJuzCounts as any); // Juz counts for top students
      (prisma.tahfidzRecord.findMany as any).mockResolvedValue(mockRecentRecords as any);

      // We need to be careful with multiple calls to same method.
      // Re-setup findMany to handle the sequence or verify calls
      (prisma.tahfidzRecord.findMany as any)
        .mockResolvedValueOnce(mockUniqueStudents as any) // unique students
        .mockResolvedValueOnce(mockRecentRecords as any); // recent records

      const result = await tahfidzService.getDashboardStats({});

      // Verify progressByJuz logic
      const juz1 = result.progressByJuz.find((j) => j.juz === 1);
      const juz2 = result.progressByJuz.find((j) => j.juz === 2);
      const juz30 = result.progressByJuz.find((j) => j.juz === 30);

      expect(juz1?.completedCount).toBe(5);
      expect(juz2?.completedCount).toBe(0);
      expect(juz30?.completedCount).toBe(15);

      // Verify other stats
      expect(result.totalRecords).toBe(mockTotalRecords);
      expect(result.totalStudents).toBe(mockUniqueStudents.length);
    });
  });

  describe('getStudentSummary', () => {
    it('should return correct summary structure', async () => {
      const studentId = 'student-1';
      const mockStudent = {
        id: studentId,
        user: { id: 'u1', name: 'Test Student' },
        unit: { id: 'un1', name: 'Test Unit' },
      };

      const mockActivityCounts = [
        { activityType: 'ZIYADAH', _count: { _all: 10 }, _sum: { totalAyah: 100 } },
        { activityType: 'MUROJAAH', _count: { _all: 5 }, _sum: { totalAyah: 50 } },
      ];

      const mockTotalRecords = 15;
      const mockTotalAyahZiyadah = { _sum: { totalAyah: 100 } };

      const mockJuzCovered = [{ juz: 30 }, { juz: 29 }];
      const mockSurahCovered = [{ surahNumber: 1, surahName: 'Al-Fatihah' }];
      const mockAvgScore = { _avg: { score: 85.5 } };
      const mockRecentRecords = [{ id: 'r1' }];

      // Setup mocks
      (prisma.student.findFirst as any).mockResolvedValue(mockStudent as any);
      (prisma.tahfidzRecord.groupBy as any).mockResolvedValue(mockActivityCounts as any);
      (prisma.tahfidzRecord.count as any).mockResolvedValue(mockTotalRecords);
      (prisma.tahfidzRecord.aggregate as any)
        .mockResolvedValueOnce(mockTotalAyahZiyadah as any) // Ziyadah sum
        .mockResolvedValueOnce(mockAvgScore as any); // Avg score

      (prisma.tahfidzRecord.findMany as any)
        .mockResolvedValueOnce(mockJuzCovered as any) // Juz covered
        .mockResolvedValueOnce(mockSurahCovered as any) // Surah covered
        .mockResolvedValueOnce(mockRecentRecords as any); // Recent records

      const result = await tahfidzService.getStudentSummary(studentId);

      expect(result.student).toEqual(mockStudent);
      expect(result.summary.totalRecords).toBe(mockTotalRecords);
      expect(result.summary.totalAyahMemorized).toBe(100);
      expect(result.summary.juzCoveredCount).toBe(2);
      expect(result.summary.averageScore).toBe(85.5);
      expect(result.juzCovered).toEqual([29, 30]); // Sorted
    });

    it('should throw error if student not found', async () => {
      (prisma.student.findFirst as any).mockResolvedValue(null);
      await expect(tahfidzService.getStudentSummary('unknown')).rejects.toThrow();
    });
  });
});
