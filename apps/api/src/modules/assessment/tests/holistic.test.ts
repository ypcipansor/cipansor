import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: {
      findUnique: vi.fn(),
    },
    grade: {
      aggregate: vi.fn(),
    },
    tahfidzRecord: {
      aggregate: vi.fn(),
    },
    violation: {
      aggregate: vi.fn(),
    },
    reward: {
      aggregate: vi.fn(),
    },
    attendance: {
      groupBy: vi.fn(),
    },
    dailyIbadahRecord: {
      aggregate: vi.fn(),
    },
    examAttempt: {
      findMany: vi.fn(),
    },
    roomAssignment: {
      findFirst: vi.fn(),
    },
  },
}));

import { AssessmentAnalyticsService } from '../analytics.service';
import { prisma } from '@/lib/prisma';

describe('Holistic Student Analytics', () => {
  const studentId = 'student-123';
  const academicYearId = 'year-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.academicYear.findUnique as any).mockResolvedValue({
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
    });
  });

  it('should include CBT performance in holistic score', async () => {
    // 1. Mock other dimensions to 100
    (prisma.grade.aggregate as any).mockResolvedValue({ _avg: { percentage: 100 } });
    (prisma.tahfidzRecord.aggregate as any).mockResolvedValue({ _max: { juz: 30 } });
    (prisma.violation.aggregate as any).mockResolvedValue({ _sum: { points: 0 } });
    (prisma.reward.aggregate as any).mockResolvedValue({ _sum: { points: 0 } });
    (prisma.attendance.groupBy as any).mockResolvedValue([
      { status: 'PRESENT', _count: { _all: 10 } },
    ]);
    (prisma.dailyIbadahRecord.aggregate as any).mockResolvedValue({ _sum: { pointsEarned: 3000 } });

    // 2. Mock CBT: 1 attempt, score 50/100 (50%)
    (prisma.examAttempt.findMany as any).mockResolvedValue([
      { score: new Decimal(50), exam: { maxScore: new Decimal(100) } },
    ]);

    const result = await AssessmentAnalyticsService.getStudentHolisticAnalytics(
      studentId,
      academicYearId
    );

    expect(result.breakdown.cbt).toBe(50);
    // Holistic score should be less than 100 because of 50% CBT score
    expect(result.holisticScore).toBeLessThan(100);
    expect(result.holisticScore).toBeGreaterThan(80); // Weighted
  });
});
