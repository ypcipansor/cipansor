import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkCreateClassPAUDAssessmentInput } from '@cipansor/shared';

// Mock dependencies with hosted functions to ensure initialization
const { mockFindUnique, mockCreate, mockTransaction } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: mockFindUnique,
    },
    pAUDDevelopmentAssessment: {
      create: mockCreate,
    },
    $transaction: mockTransaction,
  },
}));

// Import service AFTER mocking
import { paudAssessmentService } from '../../../../src/modules/paud-assessment/paud-assessment.service';
import { prisma } from '../../../../src/lib/prisma';

describe('PAUD Assessment Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation((callback: any) => {
      // If the callback is an array (which Promise.all(map) effectively produces when passed to $transaction in some contexts,
      // but here the service passes an array of promises directly if it was map... wait.
      // The service code: await prisma.$transaction(assessments.map(...))
      // So $transaction receives an ARRAY of Promises (or pending promises).
      // BUT prisma.$transaction usually takes an array of promises OR a callback.
      // In the service code: `prisma.$transaction(assessments.map(...))` -> This is the array overload.

      // So the mock should just return Promise.all(arg) if arg is array.
      if (Array.isArray(callback)) {
        return Promise.all(callback);
      }
      // If it's a function (interactive transaction), call it.
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return Promise.resolve(callback);
    });
  });

  describe('createClassAssessment', () => {
    const mockInput: BulkCreateClassPAUDAssessmentInput = {
      classId: 'class-1',
      unitId: 'unit-1',
      academicYearId: 'year-1',
      semester: 'GANJIL',
      periodType: 'HARIAN',
      periodDate: new Date(),
      aspect: 'NAM',
      indicatorId: 'ind-1',
      assessments: [
        {
          studentId: 'student-1',
          achievementLevel: 'BSH',
          narrativeText: 'Good',
          teacherNotes: 'Notes',
        },
        {
          studentId: 'student-2',
          achievementLevel: 'MB',
        },
      ],
    };

    const userId = 'teacher-1';

    it('should create assessments for all students in class', async () => {
      // Mock class validation
      mockFindUnique.mockResolvedValue({ id: 'class-1', unitId: 'unit-1' });

      // Mock create result (just need it to resolve)
      mockCreate.mockResolvedValue({ id: 'assessment-id' });

      const result = await paudAssessmentService.createClassAssessment(mockInput as any, userId);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        select: { unitId: true },
      });

      // We expect create to be called twice because the transaction mock executes the array of promises (which are create calls)
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(2);
    });

    it('should throw error if class does not belong to unit', async () => {
      mockFindUnique.mockResolvedValue({ id: 'class-1', unitId: 'other-unit' });

      await expect(
        paudAssessmentService.createClassAssessment(mockInput as any, userId)
      ).rejects.toThrow('Class not found or does not belong to this unit');
    });
  });
});
