import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { CBTService } from './cbt.service';

vi.mock('@prisma/client', () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
    },
    Decimal: vi.fn((val) => val),
    JsonNull: 'JsonNull',
  },
  QuestionType: {
    MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
    TRUE_FALSE: 'TRUE_FALSE',
    ESSAY: 'ESSAY',
  },
}));

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    questionBank: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    question: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    exam: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    examAttempt: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    examAnswer: {
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    examSecurityLog: {
      create: vi.fn(),
    },
    grade: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((callbackOrPromises, _options?) => {
      if (typeof callbackOrPromises === 'function') return callbackOrPromises(prisma);
      return Promise.resolve(callbackOrPromises);
    }),
  },
}));

describe('CBT Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Question Banks and Questions', () => {
    it('should create question bank', async () => {
      const dto = {
        unitId: 'unit-1',
        teacherId: 'user-1',
        title: 'Bank Soal Matematika K13',
      };

      vi.mocked(prisma.questionBank.create).mockResolvedValue({ id: 'bank-1', ...dto } as any);

      await CBTService.createQuestionBank(dto);

      expect(prisma.questionBank.create).toHaveBeenCalledWith({
        data: expect.objectContaining(dto),
      });
    });

    it('should add question to bank if authorized', async () => {
      vi.mocked(prisma.questionBank.findUnique).mockResolvedValue({ id: 'bank-1', teacher: { userId: 'user-1' } } as any);
      vi.mocked(prisma.question.create).mockResolvedValue({ id: 'q-1' } as any);

      const dto = {
        bankId: 'bank-1',
        type: 'MULTIPLE_CHOICE' as any,
        content: 'Berapa 2+2?',
        options: [{ id: 'opt-1', text: '4' }],
        answerKey: 'opt-1',
        points: 5,
      };

      await CBTService.addQuestion(dto, { id: 'user-1', role: 'TEACHER' });

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'Berapa 2+2?',
          points: 5,
          order: 0,
        }),
      });
    });

    it('should throw error if unauthorized to add question', async () => {
      vi.mocked(prisma.questionBank.findUnique).mockResolvedValue({ id: 'bank-1', teacher: { userId: 'user-2' } } as any);

      await expect(
        CBTService.addQuestion(
          { bankId: 'bank-1', type: 'ESSAY' as any, content: 'Sebutkan...' },
          { id: 'user-1', role: 'TEACHER' }
        )
      ).rejects.toThrow('You do not have permission');
    });
  });

  describe('Exam Scheduling & Grading', () => {
    it('should create an exam if authorized', async () => {
      vi.mocked(prisma.questionBank.findUnique).mockResolvedValue({ id: 'bank-1', isActive: true, teacher: { userId: 'user-1' } } as any);
      vi.mocked(prisma.exam.create).mockResolvedValue({ id: 'exam-1' } as any);

      const dto = {
        unitId: 'unit-1',
        academicYearId: 'ay-1',
        subjectId: 'sub-1',
        classId: 'cls-1',
        teacherId: 'user-1',
        type: 'MIDTERM' as any,
        title: 'UTS Matematika',
        scheduledAt: new Date(),
        questionBankId: 'bank-1',
      };

      await CBTService.createExam(dto, { id: 'user-1', role: 'TEACHER', unitId: 'unit-1' });

      expect(prisma.exam.create).toHaveBeenCalled();
    });

    it('should delete an exam with no attempts', async () => {
      vi.mocked(prisma.exam.findUnique).mockResolvedValue({
        id: 'exam-1',
        unitId: 'unit-1',
        teacher: { userId: 'user-1' },
        _count: { attempts: 0 },
      } as any);
      vi.mocked(prisma.exam.delete).mockResolvedValue({ id: 'exam-1' } as any);

      const result = await CBTService.deleteExam('exam-1', {
        id: 'admin',
        role: 'SUPER_ADMIN',
        unitId: null,
      });

      expect(prisma.exam.delete).toHaveBeenCalledWith({ where: { id: 'exam-1' } });
      expect(result).toEqual({ id: 'exam-1' });
    });

    it('should refuse to delete an exam that already has attempts', async () => {
      vi.mocked(prisma.exam.findUnique).mockResolvedValue({
        id: 'exam-1',
        unitId: 'unit-1',
        teacher: { userId: 'user-1' },
        _count: { attempts: 3 },
      } as any);

      await expect(
        CBTService.deleteExam('exam-1', { id: 'admin', role: 'SUPER_ADMIN', unitId: null }),
      ).rejects.toThrow(/attempts/i);
      expect(prisma.exam.delete).not.toHaveBeenCalled();
    });

    it('should allow teacher to grade essay answers and recalculate total score', async () => {
      vi.mocked(prisma.examAttempt.findUnique)
        .mockResolvedValueOnce({
          id: 'attempt-1',
          status: 'NEEDS_REVIEW',
          exam: { unitId: 'unit-1', questionBankId: 'bank-1', teacher: { userId: 'user-1' } },
        } as any)
        // Second call is the fresh status re-check inside the transaction
        .mockResolvedValueOnce({
          status: 'NEEDS_REVIEW',
        } as any);

      vi.mocked(prisma.question.findUnique).mockResolvedValue({
        id: 'q-1',
        bankId: 'bank-1',
        points: 10,
        type: 'ESSAY',
      } as any);

      vi.mocked(prisma.examAnswer.findUnique).mockResolvedValue({
        id: 'ans-1',
      } as any);
      vi.mocked(prisma.examAnswer.update).mockResolvedValue({ id: 'ans-1' } as any);
      vi.mocked(prisma.examAnswer.findMany).mockResolvedValue([
        { id: 'ans-1', score: 10, question: { type: 'ESSAY' } },
        { id: 'ans-2', score: 20, question: { type: 'MULTIPLE_CHOICE' } },
      ] as any);
      vi.mocked(prisma.examAttempt.update).mockResolvedValue({ id: 'attempt-1', score: 30 } as any);

      const result = await CBTService.gradeEssayAnswer(
        'attempt-1',
        'q-1',
        { score: 10, isCorrect: true },
        { id: 'user-1', role: 'TEACHER' }
      );

      expect(prisma.examAnswer.update).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q-1' } },
        data: expect.any(Object),
      });

      expect(prisma.examAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { score: expect.anything(), status: 'COMPLETED' },
      });
      expect(result.score).toBe(30);
    });

    it('should upsert grade into academic gradebook with forceUpdate=true during essay grading', async () => {
      const mockAttempt = {
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'COMPLETED',
        score: 85,
        finishedAt: new Date(),
        exam: {
          id: 'exam-1',
          subjectId: 'sub-1',
          academicYearId: 'ay-1',
          maxScore: 100,
          teacherId: 'teacher-1',
          teacher: { id: 'teacher-1', userId: 'user-1' },
          questionBank: {
            questions: [
              { points: 50 },
              { points: 50 },
            ],
          },
        },
      };

      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(mockAttempt as any);
      vi.mocked(prisma.grade.upsert).mockResolvedValue({ id: 'grade-1' } as any);

      await CBTService.syncGradeToAcademicGradebook('attempt-1', true);

      expect(prisma.grade.upsert).toHaveBeenCalledWith({
        where: {
          studentId_examId: {
            studentId: 'std-1',
            examId: 'exam-1',
          },
        },
        create: expect.objectContaining({
          studentId: 'std-1',
          examId: 'exam-1',
          letterGrade: 'B',
        }),
        update: expect.objectContaining({
          letterGrade: 'B',
        }),
      });
    });

    it('does not fail essay grading when the gradebook sync throws after commit', async () => {
      // Regression for: a sync failure (idempotent `grade.upsert` OUTSIDE the
      // grading transaction) must not surface as "grading failed" and trigger a
      // re-grade of an attempt whose score/status already committed. The grading
      // result is what the caller sees; the gradebook sync is best-effort.
      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'COMPLETED',
        score: 0,
        finishedAt: new Date(),
        exam: {
          id: 'exam-1',
          subjectId: 'sub-1',
          academicYearId: 'ay-1',
          maxScore: 100,
          questionBankId: 'bank-1',
          teacherId: 'teacher-1',
          teacher: { id: 'teacher-1', userId: 'user-1' },
          questionBank: {
            questions: [{ points: 50 }, { points: 50 }],
          },
        },
      } as any);
      vi.mocked(prisma.question.findUnique).mockResolvedValue({
        id: 'q-1',
        bankId: 'bank-1',
        points: 85,
        type: 'ESSAY',
      } as any);
      vi.mocked(prisma.examAnswer.findUnique).mockResolvedValue({ id: 'ans-1' } as any);
      vi.mocked(prisma.examAnswer.update).mockResolvedValue({ id: 'ans-1' } as any);
      vi.mocked(prisma.examAnswer.findMany).mockResolvedValue([
        { id: 'ans-1', score: 42, question: { type: 'ESSAY' } },
        { id: 'ans-2', score: 43, question: { type: 'MULTIPLE_CHOICE' } },
      ] as any);
      vi.mocked(prisma.examAttempt.update).mockResolvedValue({
        id: 'attempt-1',
        score: 85,
        status: 'COMPLETED',
      } as any);
      // The gradebook upsert itself fails every retry: grading must still succeed.
      vi.mocked(prisma.grade.upsert).mockRejectedValue(new Error('gradebook down'));

      const result = await CBTService.gradeEssayAnswer(
        'attempt-1',
        'q-1',
        { score: 42, isCorrect: true },
        { id: 'user-1', role: 'TEACHER' }
      );

      // Grading completed: the commit happened before the sync, so the caller's
      // result is produced despite the failed (best-effort) gradebook write.
      expect(result).toBeDefined();
      expect(result.score).toBe(85);
      expect(prisma.examAttempt.update).toHaveBeenCalled();
      // The best-effort path ran but never surfaced the error.
      expect(prisma.grade.upsert).toHaveBeenCalled();
    });

    it('should persist security log and validate student attempt ownership', async () => {
      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
        id: 'att-1',
        studentId: 'std-1',
      } as any);
      vi.mocked(prisma.examSecurityLog.create as any).mockResolvedValue({
        id: 'sec-1',
        attemptId: 'att-1',
        eventType: 'TAB_SWITCH',
      });

      const log = await CBTService.recordSecurityLog(
        { attemptId: 'att-1', eventType: 'TAB_SWITCH' as any, details: { count: 1 } },
        'std-1'
      );

      expect(prisma.examSecurityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          attemptId: 'att-1',
          eventType: 'TAB_SWITCH',
        }),
      });
      expect(log).toEqual({ id: 'sec-1', attemptId: 'att-1', eventType: 'TAB_SWITCH' });

      // Ownership mismatch rejected
      await expect(
        CBTService.recordSecurityLog(
          { attemptId: 'att-1', eventType: 'TAB_SWITCH' as any },
          'std-other'
        )
      ).rejects.toThrow('Access denied');

      // Missing student profile rejected
      await expect(
        CBTService.recordSecurityLog(
          { attemptId: 'att-1', eventType: 'TAB_SWITCH' as any },
          undefined
        )
      ).rejects.toThrow('Access denied');
    });

    it('should retry gradebook sync if finishExamAttempt is called again on an already COMPLETED attempt', async () => {
      const completedAttempt = {
        id: 'attempt-completed',
        studentId: 'std-1',
        status: 'COMPLETED',
        score: 90,
        exam: {
          id: 'exam-1',
          subjectId: 'sub-1',
          academicYearId: 'ay-1',
          questionBank: { questions: [{ points: 100 }] },
        },
      };

      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(completedAttempt as any);
      vi.mocked(prisma.grade.upsert).mockResolvedValue({ id: 'grade-1' } as any);

      await CBTService.finishExamAttempt('attempt-completed', 'std-1');

      expect(prisma.grade.upsert).toHaveBeenCalledWith({
        where: {
          studentId_examId: { studentId: 'std-1', examId: 'exam-1' },
        },
        create: expect.any(Object),
        update: {},
      });
    });

    it('should perform no-op update on upsert when forceUpdate=false for idempotent retry', async () => {
      const mockAttempt = {
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'COMPLETED',
        score: 85,
        finishedAt: new Date(),
        exam: {
          id: 'exam-1',
          subjectId: 'sub-1',
          academicYearId: 'ay-1',
          maxScore: 100,
          teacherId: 'teacher-1',
          teacher: { id: 'teacher-1', userId: 'user-1' },
          questionBank: {
            questions: [{ points: 100 }],
          },
        },
      };

      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(mockAttempt as any);
      vi.mocked(prisma.grade.upsert).mockResolvedValue({ id: 'grade-1' } as any);

      await CBTService.syncGradeToAcademicGradebook('attempt-1', false);

      expect(prisma.grade.upsert).toHaveBeenCalledWith({
        where: {
          studentId_examId: {
            studentId: 'std-1',
            examId: 'exam-1',
          },
        },
        create: expect.any(Object),
        update: {},
      });
    });

    it('should calculate topic mastery analytics correctly', async () => {
      const mockExam = {
        id: 'exam-1',
        questionBank: {
          questions: [
            {
              id: 'q1',
              points: 10,
              content: 'Question 1 content',
            },
            {
              id: 'q2',
              points: 10,
              content: 'Question 2 content',
            },
          ],
        },
        attempts: [
          {
            id: 'att1',
            status: 'COMPLETED',
            answers: [
              {
                questionId: 'q1',
                score: 10,
                question: { points: 10, learningObjective: { id: 'tp1', code: 'TP1', description: 'Desc' } },
              },
              {
                questionId: 'q2',
                score: 5,
                question: { points: 10, learningObjective: { id: 'tp1', code: 'TP1', description: 'Desc' } },
              },
            ],
          },
        ],
      };

      vi.mocked(prisma.exam.findUnique).mockResolvedValue(mockExam as any);

      const result = await CBTService.getTopicMasteryAnalytics('exam-1');

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(2);
      expect(result!._meta.truncated).toBe(false);
      // Sorted weakest first: q2 (50%) before q1 (100%)
      expect(result!.items[0].objectiveId).toBe('q2');
      expect(result!.items[0].totalPoints).toBe(10); // 10 points * 1 attempt
      expect(result!.items[0].earnedPoints).toBe(5);
      expect(result!.items[0].masteryLevel).toBe(50);
      expect(result!.items[1].objectiveId).toBe('q1');
      expect(result!.items[1].totalPoints).toBe(10);
      expect(result!.items[1].earnedPoints).toBe(10);
      expect(result!.items[1].masteryLevel).toBe(100);
    });

    it('should include NEEDS_REVIEW attempts in topic mastery (MC/TF answers already graded)', async () => {
      const mockExam = {
        id: 'exam-2',
        questionBank: {
          questions: [
            { id: 'q1', points: 10, content: 'MC Question' },
            { id: 'q2', points: 20, content: 'Essay Question' },
          ],
        },
        attempts: [
          {
            id: 'att1',
            status: 'NEEDS_REVIEW',
            answers: [
              {
                questionId: 'q1',
                score: 10,
                question: { points: 10, learningObjective: { id: 'tp1', code: 'TP1', description: 'Desc' } },
              }, // MC auto-graded
              {
                questionId: 'q2',
                score: null,
                question: { points: 20, learningObjective: { id: 'tp2', code: 'TP2', description: 'Desc' } },
              }, // Essay ungraded
            ],
          },
          {
            id: 'att2',
            status: 'COMPLETED',
            answers: [
              {
                questionId: 'q1',
                score: 10,
                question: { points: 10, learningObjective: { id: 'tp1', code: 'TP1', description: 'Desc' } },
              },
              {
                questionId: 'q2',
                score: 15,
                question: { points: 20, learningObjective: { id: 'tp2', code: 'TP2', description: 'Desc' } },
              },
            ],
          },
        ],
      };

      vi.mocked(prisma.exam.findUnique).mockResolvedValue(mockExam as any);

      const result = await CBTService.getTopicMasteryAnalytics('exam-2');

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(2);
      // q1: both attempts graded → 2 graded, 20 earned / 20 total = 100%
      const q1 = result!.items.find((i: any) => i.objectiveId === 'q1');
      expect(q1!.earnedPoints).toBe(20);
      expect(q1!.totalPoints).toBe(20);
      expect(q1!.masteryLevel).toBe(100);
      // q2: only COMPLETED attempt has score → 1 graded, 15 earned / 20 total = 75%
      const q2 = result!.items.find((i: any) => i.objectiveId === 'q2');
      expect(q2!.earnedPoints).toBe(15);
      expect(q2!.totalPoints).toBe(20);
      expect(q2!.masteryLevel).toBe(75);
    });
  });

  describe('Exam Attempts', () => {
    it('should start a new attempt if not exists', async () => {
      vi.mocked(prisma.exam.findUnique).mockResolvedValue({
        id: 'exam-1',
        questionBank: {},
      } as any);
      
      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.examAttempt.create).mockResolvedValue({ id: 'attempt-1' } as any);

      await CBTService.startExamAttempt('exam-1', 'std-1');

      expect(prisma.examAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          examId: 'exam-1',
          studentId: 'std-1',
          status: 'IN_PROGRESS',
        }),
      });
    });

    it('should handle concurrent startExamAttempt (P2002) gracefully', async () => {
      vi.mocked(prisma.exam.findUnique).mockResolvedValue({
        id: 'exam-1',
        questionBank: {},
      } as any);

      vi.mocked(prisma.examAttempt.findUnique)
        .mockResolvedValueOnce(null) // First call: no existing attempt
        .mockResolvedValueOnce({ id: 'attempt-1', status: 'IN_PROGRESS' } as any); // Retry after P2002

      const p2002Error = new Error('Unique constraint failed') as any;
      p2002Error.code = 'P2002';
      vi.mocked(prisma.examAttempt.create).mockRejectedValue(p2002Error);

      const result = await CBTService.startExamAttempt('exam-1', 'std-1');

      expect(result).toEqual({ id: 'attempt-1', status: 'IN_PROGRESS' });
    });

    it('should reject submitAnswer when exam has no question bank', async () => {
      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'IN_PROGRESS',
        exam: { questionBankId: null },
      } as any);

      await expect(
        CBTService.submitAnswer('attempt-1', 'q-1', 'opt-B', 'std-1')
      ).rejects.toThrow('not configured for CBT');
    });

    it('should submit an answer using upsert', async () => {
      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'IN_PROGRESS',
        exam: { questionBankId: 'bank-1' },
      } as any);
      vi.mocked(prisma.question.findUnique).mockResolvedValue({
        id: 'q-1',
        bankId: 'bank-1',
      } as any);
      vi.mocked(prisma.examAnswer.upsert).mockResolvedValue({ id: 'ans-1' } as any);

      await CBTService.submitAnswer('attempt-1', 'q-1', 'opt-B', 'std-1');

      expect(prisma.examAnswer.upsert).toHaveBeenCalledWith({
        where: {
          attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q-1' },
        },
        create: expect.any(Object),
        update: { answer: 'opt-B' },
      });
    });

    it('should grade and finish exam attempt atomically', async () => {
      const attemptData = {
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'IN_PROGRESS',
        exam: {
          questionBank: {
            questions: [
              { id: 'q-1', type: 'MULTIPLE_CHOICE', answerKey: 'opt-A', points: 10 },
              { id: 'q-2', type: 'MULTIPLE_CHOICE', answerKey: 'opt-C', points: 10 },
            ],
          },
        },
        answers: [
          { id: 'ans-1', questionId: 'q-1', answer: 'opt-A' }, // correct
          { id: 'ans-2', questionId: 'q-2', answer: 'opt-B' }, // wrong
        ],
      };

      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(attemptData as any);
      vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as any);

      // The transaction now includes both answer grading and attempt status update
      vi.mocked(prisma.$transaction).mockImplementation((promises) => {
        return Promise.resolve(promises) as any;
      });

      await CBTService.finishExamAttempt('attempt-1', 'std-1');

      // Attempt update is now inside the transaction batch
      expect(prisma.examAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          score: expect.anything(),
        }),
      });

      // q-1 correct, q-2 wrong
      expect(prisma.examAnswer.update).toHaveBeenCalledWith({
        where: { id: 'ans-1' },
        data: { isCorrect: true, score: 10 },
      });
      expect(prisma.examAnswer.update).toHaveBeenCalledWith({
        where: { id: 'ans-2' },
        data: { isCorrect: false, score: 0 },
      });

      // Re-fetches the attempt after transaction with safe select on questions
      expect(prisma.examAttempt.findUnique).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        include: {
          answers: true,
          exam: {
            include: {
              questionBank: {
                include: {
                  questions: {
                    select: {
                      id: true,
                      type: true,
                      content: true,
                      options: true,
                      points: true,
                    },
                    orderBy: { order: 'asc' },
                  },
                },
              },
            },
          },
        },
      });
    });

    it('should create answer records for unanswered essay questions and set NEEDS_REVIEW', async () => {
      const attemptData = {
        id: 'attempt-1',
        studentId: 'std-1',
        status: 'IN_PROGRESS',
        exam: {
          questionBank: {
            questions: [
              { id: 'q-1', type: 'MULTIPLE_CHOICE', answerKey: 'opt-A', points: 10 },
              { id: 'q-2', type: 'ESSAY', answerKey: null, points: 20 },
            ],
          },
        },
        answers: [
          { id: 'ans-1', questionId: 'q-1', answer: 'opt-A' }, // answered MC
          // q-2 (ESSAY) not answered
        ],
      };

      vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(attemptData as any);
      vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as any);
      vi.mocked(prisma.examAnswer.upsert).mockResolvedValue({ id: 'ans-2' } as any);

      // The transaction now includes both answer grading and attempt status update
      vi.mocked(prisma.$transaction).mockImplementation((promises) => {
        return Promise.resolve(promises) as any;
      });

      await CBTService.finishExamAttempt('attempt-1', 'std-1');

      // Should upsert an empty answer record for the unanswered essay
      expect(prisma.examAnswer.upsert).toHaveBeenCalledWith({
        where: {
          attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q-2' },
        },
        create: {
          attemptId: 'attempt-1',
          questionId: 'q-2',
          answer: 'JsonNull',
          isCorrect: null,
          score: null,
        },
        update: {},
      });

      // Status should be NEEDS_REVIEW because of essay question
      expect(prisma.examAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: 'NEEDS_REVIEW',
          score: expect.anything(), // Decimal(10) — only MC score
        }),
      });
    });
  });
});
