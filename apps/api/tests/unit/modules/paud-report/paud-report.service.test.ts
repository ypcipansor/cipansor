import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PAUDReportService } from '../../../../src/modules/paud-report/paud-report.service';
import { prisma } from '../../../../src/lib/prisma';
import { UserRole, PAUDAspect } from '@prisma/client';

// Mock dependencies
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    pAUDNarrativeReport: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    academicYear: {
      findUnique: vi.fn(),
    },
    pAUDDevelopmentAssessment: {
      findMany: vi.fn(),
    },
    attendance: {
      findMany: vi.fn(),
    },
    dailyStudentReport: {
      findMany: vi.fn(),
    },
    growthRecord: {
      findFirst: vi.fn(),
    },
    tahfidzRecord: {
      findFirst: vi.fn(),
    },
  },
}));

describe('PAUDReportService', () => {
  const context = {
    role: UserRole.TEACHER,
    unitId: 'unit-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReportFromAssessments', () => {
    const input = {
      studentId: 'student-1',
      unitId: 'unit-1',
      academicYearId: 'year-1',
      semester: 'GANJIL',
      regenerate: false,
    };

    it('should generate report with tahfidz and health summary', async () => {
      // Mock Data
      const mockStudent = {
        id: 'student-1',
        unitId: 'unit-1',
        user: { name: 'Test Student' },
      };

      const mockAcademicYear = {
        id: 'year-1',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2025-06-30'),
      };

      const mockGrowthRecord = {
        weight: 20.5,
        height: 110,
        headCircumference: 50,
        notes: 'Healthy',
        nutritionStatus: 'Normal',
      };

      const mockTahfidzRecord = {
        surahName: 'An-Naba',
        juz: 30,
        ayahEnd: 40,
        activityType: 'ZIYADAH',
      };

      // Mock Prisma calls
      (prisma.pAUDNarrativeReport.findUnique as any).mockResolvedValue(null);
      (prisma.student.findUnique as any).mockResolvedValue(mockStudent);
      (prisma.academicYear.findUnique as any).mockResolvedValue(mockAcademicYear);
      (prisma.pAUDDevelopmentAssessment.findMany as any).mockResolvedValue([
        // Add minimal assessment data to pass minimum check
        {
          id: '1',
          aspect: PAUDAspect.NAM,
          achievementLevel: 'BSB',
          periodDate: new Date(),
          indicator: { name: 'Ind 1' },
        },
        {
          id: '2',
          aspect: PAUDAspect.NAM,
          achievementLevel: 'BSH',
          periodDate: new Date(),
          indicator: { name: 'Ind 2' },
        },
        {
          id: '3',
          aspect: PAUDAspect.NAM,
          achievementLevel: 'BSB',
          periodDate: new Date(),
          indicator: { name: 'Ind 3' },
        },
      ]);
      (prisma.attendance.findMany as any).mockResolvedValue([]);
      (prisma.dailyStudentReport.findMany as any).mockResolvedValue([]);
      (prisma.growthRecord.findFirst as any).mockResolvedValue(mockGrowthRecord);
      (prisma.tahfidzRecord.findFirst as any).mockResolvedValue(mockTahfidzRecord);
      (prisma.pAUDNarrativeReport.create as any).mockImplementation((args: any) =>
        Promise.resolve(args.data)
      );

      // Execute
      const result = await PAUDReportService.generateReportFromAssessments(
        input as any,
        context as any
      );

      // Verify
      expect(prisma.growthRecord.findFirst).toHaveBeenCalled();
      expect(prisma.tahfidzRecord.findFirst).toHaveBeenCalled();

      expect(result.healthSummary).toEqual({
        weight: 20.5,
        height: 110,
        headCircumference: 50,
        notes: 'Healthy',
        bmiDescription: 'Normal',
      });

      expect(result.tahfidzSummary).toEqual({
        lastSurah: 'An-Naba',
        lastJuz: 30,
        lastAyah: 40,
        activity: 'ZIYADAH',
      });
    });
  });
});
