import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExam,
  getExams,
  updateExam,
  createGrade,
  generateReportCard,
} from '../../src/modules/assessment/assessment.service';
import { prisma } from '../../src/lib/prisma';
import { ExamType } from '@cipansor/shared';
import { Decimal } from '@prisma/client/runtime/client';

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    exam: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    grade: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    reportCard: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    reportCardDetail: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    attendance: {
      groupBy: vi.fn(),
    },
    tahfidzRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Assessment Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createExam', () => {
    it('should create an exam with correct defaults', async () => {
      const input = {
        unitId: 'unit-1',
        academicYearId: 'year-1',
        subjectId: 'subject-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        type: ExamType.DAILY_TEST,
        title: 'Math Test',
        scheduledAt: '2023-01-01T10:00:00Z',
      };

      const mockExam = {
        id: 'exam-1',
        ...input,
        scheduledAt: new Date(input.scheduledAt),
        duration: 60,
        maxScore: new Decimal(100),
        passingScore: new Decimal(70),
        weight: new Decimal(1),
        status: 'SCHEDULED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.exam.create).mockResolvedValue(mockExam as any);

      const result = await createExam(input);

      expect(prisma.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Math Test',
            duration: 60, // Default
          }),
        })
      );
      expect(result.id).toBe('exam-1');
      expect(result.maxScore).toBe(100);
    });
  });

  describe('generateReportCard', () => {
    it('should calculate averages and create report card', async () => {
      const studentId = 'student-1';
      const classId = 'class-1';
      const academicYearId = 'year-1';
      const semester = 1;

      // Mock QueryRaw for subject aggregates
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          subject_id: 'sub-1',
          subject_name: 'Math',
          avg_daily: 80,
          avg_midterm: 85,
          avg_final: 90,
        },
      ]);

      // Mock Attendance
      vi.mocked(prisma.attendance.groupBy).mockResolvedValue([
        { status: 'PRESENT', _count: 10 },
      ] as any);

      // Mock Tahfidz
      vi.mocked(prisma.tahfidzRecord.findFirst).mockResolvedValue({
        juz: 30,
        surahName: 'An-Naba',
      } as any);
      vi.mocked(prisma.tahfidzRecord.aggregate).mockResolvedValue({
        _sum: { totalAyah: 100 },
      } as any);

      // Mock Upsert
      vi.mocked(prisma.reportCard.upsert).mockResolvedValue({
        id: 'rc-1',
        studentId,
        averageScore: new Decimal(85),
      } as any);

      // Mock the re-fetch for return
      vi.mocked(prisma.reportCard.findFirst).mockResolvedValue({
        id: 'rc-1',
        studentId,
        averageScore: new Decimal(85),
        details: [],
      } as any);

      await generateReportCard(studentId, classId, academicYearId, semester);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.reportCard.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            averageScore: new Decimal(85), // (80+85+90)/3 = 85
          }),
        })
      );
    });
  });
});
