import { describe, it, expect, vi, beforeEach } from 'vitest';
import { practicumService } from '../practicum.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    practicumLessonPlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    practicumSchedule: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    practicumEvaluation: {
      create: vi.fn(),
    },
  },
}));

describe('PracticumService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLessonPlan', () => {
    it('should create a lesson plan with DRAFT status', async () => {
      const mockData = {
        subject: 'Arabic',
        topic: 'Nahwu',
        method: 'Direct',
        materials: 'Book',
        objectives: 'Understand',
        steps: {},
      };
      const mockResult = { id: 'lp1', ...mockData, studentId: 's1', status: 'DRAFT' };
      (prisma.practicumLessonPlan.create as any).mockResolvedValue(mockResult);

      const result = await practicumService.createLessonPlan('s1', mockData);

      expect(prisma.practicumLessonPlan.create).toHaveBeenCalledWith({
        data: { ...mockData, studentId: 's1', status: 'DRAFT' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('createEvaluation', () => {
    it('computes totalScore as the mean of the four rubric scores and stamps the evaluator', async () => {
      (prisma.practicumEvaluation.create as any).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ev1', ...data })
      );

      const result = await practicumService.createEvaluation('teacher-1', {
        lessonPlanId: 'lp1',
        isPeer: false,
        methodScore: 80,
        contentScore: 90,
        languageScore: 70,
        performanceScore: 60,
        feedback: 'Perbaiki pengelolaan waktu pada tahap hissoh.',
      });

      expect(result.totalScore).toBe(75);
      expect(result.evaluatorId).toBe('teacher-1');
    });
  });

  describe('reviewLessonPlan', () => {
    it('stamps the reviewer and review timestamp on status transitions', async () => {
      (prisma.practicumLessonPlan.update as any).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lp1', ...data })
      );

      const result = await practicumService.reviewLessonPlan('lp1', 'reviewer-1', {
        status: 'APPROVED' as never,
        reviewNotes: "I'dad sudah layak diujikan.",
      });

      expect(result.status).toBe('APPROVED');
      expect(result.reviewedById).toBe('reviewer-1');
      expect(result.reviewedAt).toBeInstanceOf(Date);
    });
  });
});
