import { prisma } from '@/lib/prisma';
import { Prisma, QuestionType } from '@prisma/client';
import { RecordSecurityLogInput } from '@cipansor/shared';
import { Decimal } from '@prisma/client/runtime/client';
import { Errors } from '@/middleware/error';
import type { JwtPayload } from '@/lib/jwt';

/** Authenticated caller shape used for unit-scoping checks. */
type AuthUser = Pick<JwtPayload, 'id' | 'role'> & { unitId?: string | null };

// Types for inputs (can be moved to shared types later)
interface CreateQuestionBankInput {
  unitId: string;
  teacherId: string;
  title: string;
  description?: string;
  subjectId?: string;
}

interface CreateQuestionInput {
  bankId: string;
  type: QuestionType;
  content: string;
  options?: any;
  answerKey?: any;
  explanation?: string;
  points?: number;
  order?: number;
}

interface UpdateQuestionInput {
  content?: string;
  options?: any;
  answerKey?: any;
  explanation?: string;
  points?: number;
  order?: number;
}

interface CreateExamInput {
  unitId: string;
  academicYearId: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  type: any; // ExamType
  title: string;
  description?: string;
  scheduledAt: Date | string;
  duration?: number;
  maxScore?: number;
  passingScore?: number;
  weight?: number;
  status?: any; // ExamStatus
  instructions?: string;
  questionBankId: string;
}

export class CBTService {
  // --- Question Banks ---

  static async createQuestionBank(data: CreateQuestionBankInput) {
    return prisma.questionBank.create({
      data: {
        unitId: data.unitId,
        teacherId: data.teacherId,
        title: data.title,
        description: data.description,
        subjectId: data.subjectId,
      },
    });
  }

  static async getQuestionBanks(query: {
    unitId?: string;
    teacherUserId?: string;
    subjectId?: string;
    search?: string;
  }) {
    const where: Prisma.QuestionBankWhereInput = {
      isActive: true,
    };

    // Always apply unitId filter when provided for data isolation
    if (query.unitId) where.unitId = query.unitId;
    // If teacherUserId is set (non-admin), unitId must also be set for isolation
    if (query.teacherUserId && !query.unitId) {
      throw Errors.badRequest('unitId is required for data isolation');
    }
    if (query.teacherUserId) where.teacher = { userId: query.teacherUserId };
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    return prisma.questionBank.findMany({
      where,
      include: {
        teacher: { select: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } },
        _count: { select: { questions: true, exams: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getQuestionBankById(id: string, user: AuthUser) {
    const bank = await prisma.questionBank.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        teacher: { select: { userId: true, user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } },
      },
    });

    if (!bank) throw Errors.notFound('Question Bank');

    if (user.role === 'UNIT_ADMIN' && bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to view Question Banks outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to view this Question Bank');
    }

    return bank;
  }

  static async deleteQuestionBank(id: string, user: AuthUser) {
    const bank = await prisma.questionBank.findUnique({
      where: { id },
      include: { teacher: { select: { userId: true } } },
    });
    if (!bank) throw Errors.notFound('Question Bank');

    if (user.role === 'UNIT_ADMIN' && bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to delete Question Banks outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to delete this Question Bank');
    }

    // Soft delete
    return prisma.questionBank.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // --- Questions ---

  static async addQuestion(data: CreateQuestionInput, user: AuthUser) {
    const bank = await prisma.questionBank.findUnique({
      where: { id: data.bankId },
      include: { teacher: { select: { userId: true } } },
    });
    if (!bank) throw Errors.notFound('Question Bank');

    if (user.role === 'UNIT_ADMIN' && bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to modify Question Banks outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to add questions to this Question Bank');
    }

    return prisma.question.create({
      data: {
        bankId: data.bankId,
        type: data.type,
        content: data.content,
        options: data.options,
        answerKey: data.answerKey,
        explanation: data.explanation,
        points: data.points ?? 1,
        order: data.order ?? 0,
      },
    });
  }

  static async updateQuestion(
    id: string,
    data: UpdateQuestionInput,
    user: AuthUser
  ) {
    const question = await prisma.question.findUnique({
      where: { id },
      include: { bank: { include: { teacher: { select: { userId: true } } } } },
    });
    if (!question) throw Errors.notFound('Question');

    if (user.role === 'UNIT_ADMIN' && question.bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to modify questions outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      question.bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to update this question');
    }

    return prisma.question.update({
      where: { id },
      data,
    });
  }

  static async deleteQuestion(id: string, user: AuthUser) {
    const question = await prisma.question.findUnique({
      where: { id },
      include: { bank: { include: { teacher: { select: { userId: true } } } } },
    });
    if (!question) throw Errors.notFound('Question');

    if (user.role === 'UNIT_ADMIN' && question.bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to modify questions outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      question.bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to delete this question');
    }

    return prisma.question.delete({
      where: { id },
    });
  }

  // --- Exam Scheduling ---

  static async getExams(query: {
    page?: number;
    limit?: number;
    unitId?: string;
    academicYearId?: string;
    subjectId?: string;
    teacherUserId?: string;
    search?: string;
    status?: any;
    requireUnitScope?: boolean;
  }) {
    const where: Prisma.ExamWhereInput = {};

    // unitId is required for all non-SUPER_ADMIN queries for data isolation
    if (query.teacherUserId && !query.unitId) {
      throw Errors.badRequest('unitId is required for data isolation');
    }
    if (query.requireUnitScope && !query.unitId) {
      throw Errors.badRequest('unitId is required for data isolation');
    }
    // Always apply unitId filter when provided for data isolation
    if (query.unitId) where.unitId = query.unitId;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.teacherUserId) where.teacher = { userId: query.teacherUserId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, data] = await prisma.$transaction([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        include: {
          subject: { select: { name: true } },
          class: { select: { name: true } },
          questionBank: { select: { title: true, _count: { select: { questions: true } } } },
          _count: { select: { attempts: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  static async createExam(data: CreateExamInput, user: AuthUser) {
    // Enforce unit scope for non-SUPER_ADMIN users
    if (user.role === 'UNIT_ADMIN' && data.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to create exams outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      data.unitId !== user.unitId
    ) {
      throw Errors.forbidden('You do not have permission to create exams outside your unit');
    }

    // Check question bank
    const bank = await prisma.questionBank.findUnique({
      where: { id: data.questionBankId },
      include: { teacher: { select: { userId: true } } },
    });
    if (!bank) throw Errors.notFound('Question Bank');

    if (!bank.isActive) {
      throw Errors.badRequest('This Question Bank has been deactivated');
    }

    if (user.role === 'UNIT_ADMIN' && bank.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to use Question Banks outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      bank.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to use this Question Bank');
    }

    // Validate status before creating
    const validStatuses = ['DRAFT', 'SCHEDULED'];
    if (data.status && !validStatuses.includes(data.status)) {
      throw Errors.badRequest(`Invalid exam status: ${data.status}. Must be DRAFT or SCHEDULED.`);
    }
    const status = data.status || 'DRAFT';

    return prisma.exam.create({
      data: {
        unitId: data.unitId,
        academicYearId: data.academicYearId,
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
        type: data.type || 'MIDTERM',
        title: data.title,
        description: data.description,
        scheduledAt: new Date(data.scheduledAt),
        duration: data.duration ?? 60,
        maxScore: new Decimal(data.maxScore ?? 100),
        passingScore: new Decimal(data.passingScore ?? 70),
        weight: new Decimal(data.weight ?? 1),
        status,
        instructions: data.instructions,
        questionBankId: data.questionBankId,
      },
    });
  }

  static async deleteExam(examId: string, user: AuthUser) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        _count: { select: { attempts: true } },
        teacher: { select: { userId: true } },
      },
    });
    if (!exam) throw Errors.notFound('Exam');

    if (user.role === 'UNIT_ADMIN' && exam.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to delete exams outside your unit');
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      exam.teacher?.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to delete this exam');
    }

    // Refuse to delete once students have started/submitted attempts — their
    // results must not silently disappear.
    if (exam._count.attempts > 0) {
      throw Errors.badRequest('Cannot delete an exam that already has student attempts');
    }

    await prisma.exam.delete({ where: { id: examId } });
    return { id: examId };
  }

  static async getExamMonitoring(examId: string, user: AuthUser) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        teacher: { select: { userId: true } },
        // Question/answer counts let the monitoring UI show per-student
        // progress (answered / total) without shipping answer contents.
        questionBank: { select: { _count: { select: { questions: true } } } },
        attempts: {
          include: {
            student: { select: { id: true, user: { select: { name: true } } } },
            _count: { select: { answers: true } },
          },
        },
      },
    });

    if (!exam) throw Errors.notFound('Exam');

    if (user.role === 'UNIT_ADMIN' && exam.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to view exams outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      exam.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to view this exam');
    }

    return exam;
  }

  // --- Teacher Grading ---

  static async getAttemptForGrading(attemptId: string, user: AuthUser) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: { select: { id: true, user: { select: { name: true } } } },
        exam: {
          include: {
            teacher: { select: { userId: true } },
            questionBank: {
              include: { questions: { orderBy: { order: 'asc' } } },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) throw Errors.notFound('Attempt');

    if (user.role === 'UNIT_ADMIN' && attempt.exam.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to grade exams outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      attempt.exam.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to grade this attempt');
    }

    return attempt;
  }

  static async gradeEssayAnswer(
    attemptId: string,
    questionId: string,
    grading: { score: number; isCorrect: boolean },
    user: AuthUser
  ) {
    // Fetch attempt outside the transaction for authorization checks.
    // The status check is repeated inside the transaction to close the TOCTOU gap.
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { select: { unitId: true, questionBankId: true, teacher: { select: { userId: true } } } },
      },
    });

    if (!attempt) throw Errors.notFound('Attempt');

    if (attempt.status === 'IN_PROGRESS') {
      throw Errors.badRequest('Cannot grade an attempt that is still in progress');
    }

    if (attempt.status === 'EXPIRED') {
      throw Errors.badRequest('Cannot grade an expired attempt');
    }

    if (user.role === 'UNIT_ADMIN' && attempt.exam.unitId !== user.unitId) {
      throw Errors.forbidden('You do not have permission to grade exams outside your unit');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'UNIT_ADMIN' &&
      attempt.exam.teacher.userId !== user.id
    ) {
      throw Errors.forbidden('You do not have permission to grade this attempt');
    }

    // Use SERIALIZABLE isolation to prevent concurrent grading calls from
    // reading stale answer data and overwriting each other's total score.
    // Retry up to 2 times on serialization failures (deadlocks/conflicts).
    const MAX_RETRIES = 2;
    let lastError: any;

    for (let retryCount = 0; retryCount <= MAX_RETRIES; retryCount++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Re-check status inside the transaction to close the TOCTOU gap:
          // between the check above and entering this serializable transaction,
          // a concurrent operation could have changed the attempt's status.
          const freshAttempt = await tx.examAttempt.findUnique({
            where: { id: attemptId },
            select: { status: true },
          });
          if (!freshAttempt) throw Errors.notFound('Attempt');
          if (freshAttempt.status === 'IN_PROGRESS') {
            throw Errors.badRequest('Cannot grade an attempt that is still in progress');
          }
          if (freshAttempt.status === 'EXPIRED') {
            throw Errors.badRequest('Cannot grade an expired attempt');
          }

          const question = await tx.question.findUnique({ where: { id: questionId } });
          if (!question) throw Errors.notFound('Question');

          if (question.bankId !== attempt.exam.questionBankId) {
            throw Errors.badRequest('Question does not belong to this exam');
          }

          if (question.type !== 'ESSAY') {
            throw Errors.badRequest('Only ESSAY questions can be manually graded');
          }

          if (
            typeof grading.score !== 'number' ||
            Number.isNaN(grading.score) ||
            grading.score < 0 ||
            grading.score > question.points
          ) {
            throw Errors.badRequest(`Score must be a valid number between 0 and ${question.points}`);
          }

          // Ensure answer exists
          const existingAnswer = await tx.examAnswer.findUnique({
            where: { attemptId_questionId: { attemptId, questionId } },
          });

          if (!existingAnswer) {
            throw Errors.badRequest('Cannot grade an unanswered question');
          }

          // Update the answer
          await tx.examAnswer.update({
            where: {
              attemptId_questionId: { attemptId, questionId },
            },
            data: {
              isCorrect: grading.isCorrect,
              score: new Decimal(grading.score),
            },
          });

          // Recalculate total score for attempt
          const allAnswers = await tx.examAnswer.findMany({
            where: { attemptId },
            include: { question: true },
          });

          const totalScore = allAnswers.reduce((sum, ans) => {
            const s = ans.score !== null ? Number(ans.score) : 0;
            return sum + s;
          }, 0);

          // Check if any ESSAY answer is still lacking a score to decide status
          const hasUngradedEssay = allAnswers.some(
            (ans) => ans.question.type === 'ESSAY' && ans.score === null
          );

          return tx.examAttempt.update({
            where: { id: attemptId },
            data: {
              score: new Decimal(totalScore),
              status: hasUngradedEssay ? 'NEEDS_REVIEW' : 'COMPLETED',
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        if (result && result.status === 'COMPLETED') {
          await CBTService.syncGradeToAcademicGradebook(attemptId, true);
        }

        return result;
      } catch (error: any) {
        lastError = error;
        // Retry only on serialization failures (P2034) or deadlocks (40001/40P01)
        const isSerializationError =
          error?.code === 'P2034' ||
          error?.meta?.code === '40001' ||
          error?.meta?.code === '40P01';
        if (isSerializationError && retryCount < MAX_RETRIES) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  // --- Exam Attempts (Student) ---

  static async startExamAttempt(examId: string, studentId: string) {
    // 1. Check if exam exists and is open
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questionBank: { select: { id: true } },
      },
    });

    if (!exam) throw Errors.notFound('Exam');
    if (!exam.questionBank)
      throw Errors.badRequest('This exam is not configured for CBT (no Question Bank)');

    // Check timing (simplified, ideally check scheduledAt + duration)
    // For now, allow starting if status is not COMPLETED/GRADED (assuming generic exam status)
    // Or check if current time is within window.

    // Check if attempt already exists
    const existingAttempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: { examId, studentId },
      },
    });

    if (existingAttempt) {
      if (existingAttempt.status === 'IN_PROGRESS') {
        return existingAttempt; // Resume
      }
      // If expired or completed, maybe allow retake? For now, block.
      // throw Errors.badRequest('You have already taken this exam');
      // Let's just return it, frontend can handle status.
      return existingAttempt;
    }

    // Create new attempt. Catch unique constraint violation (P2002) from
    // concurrent requests (e.g. double-click) and return the existing attempt.
    try {
      return await prisma.examAttempt.create({
        data: {
          examId,
          studentId,
          startedAt: new Date(),
          status: 'IN_PROGRESS',
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await prisma.examAttempt.findUnique({
          where: { examId_studentId: { examId, studentId } },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  static async getAttempt(attemptId: string, studentId: string) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
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
                    // NO ANSWER KEY
                  },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) throw Errors.notFound('Attempt');
    if (attempt.studentId !== studentId) throw Errors.forbidden('Access denied');

    return attempt;
  }

  static async submitAnswer(attemptId: string, questionId: string, answer: any, studentId: string) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { select: { questionBankId: true } } },
    });
    if (!attempt) throw Errors.notFound('Attempt');
    if (attempt.studentId !== studentId) throw Errors.forbidden('Access denied');

    if (attempt.status !== 'IN_PROGRESS') {
      throw Errors.badRequest('Cannot submit answer for a completed or expired attempt');
    }

    // Validate that the question belongs to this exam's question bank
    if (!attempt.exam.questionBankId) {
      throw Errors.badRequest('This exam is not configured for CBT (no Question Bank)');
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw Errors.notFound('Question');
    if (question.bankId !== attempt.exam.questionBankId) {
      throw Errors.badRequest('Question does not belong to this exam');
    }

    // Upsert answer
    return prisma.examAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      create: {
        attemptId,
        questionId,
        answer,
      },
      update: {
        answer,
      },
    });
  }

  static async getTopicMasteryAnalytics(examId: string) {
    // Topic mastery analytics: aggregate per-question performance across all
    // completed and needs-review attempts.  NEEDS_REVIEW attempts are included
    // because their MC/TF answers are already auto-graded; ungraded essay
    // answers (score === null) are safely skipped by the aggregation loop.
    // We compute two views: (1) per-question mastery, and (2) curriculum-aligned
    // mastery grouped by Learning Objective (TP) when questions are linked.
    //
    // NOTE: This eagerly loads all answers for all matching attempts into memory.
    // For exams with very large numbers of students, consider migrating to a
    // database-level aggregation (groupBy or raw SQL) for better scalability.
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questionBank: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
        attempts: {
          where: { status: { in: ['COMPLETED', 'NEEDS_REVIEW'] } },
          take: 1000, // Safety limit to prevent excessive memory usage
          include: {
            answers: {
              include: {
                question: {
                  include: {
                    learningObjective: {
                      select: { id: true, code: true, description: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!exam || !exam.questionBank) return null;
    if (exam.attempts.length === 0) return { items: [], _meta: { truncated: false } };

    // Warn if the safety limit was hit — analytics may be based on a subset
    const truncated = exam.attempts.length >= 1000;

    const topicMastery: Record<string, {
      objectiveId: string,
      code: string,
      description: string,
      totalPoints: number,
      earnedPoints: number,
      gradedCount: number
    }> = {};

    // Group by individual question (each question acts as its own "topic")
    exam.questionBank.questions.forEach((q, idx) => {
      topicMastery[q.id] = {
        objectiveId: q.id,
        code: `Q${idx + 1}`,
        description: q.content.substring(0, 100),
        totalPoints: 0,
        earnedPoints: 0,
        gradedCount: 0,
      };
    });

    // Aggregate earned points and totalPoints only for graded answers
    // (skip answers with null score to avoid counting ungraded essay
    // questions as 0, which would distort mastery)
    exam.attempts.forEach(attempt => {
      attempt.answers.forEach(answer => {
        const entry = topicMastery[answer.questionId];
        if (entry && answer.score !== null) {
          entry.earnedPoints += Number(answer.score);
          entry.gradedCount += 1;
        }
      });
    });

    // Compute totalPoints from gradedCount so the denominator only
    // reflects attempts that were actually scored.
    const questions = exam.questionBank.questions;
    questions.forEach(q => {
      const entry = topicMastery[q.id];
      if (entry) {
        entry.totalPoints = q.points * entry.gradedCount;
      }
    });

    const results = Object.values(topicMastery)
      .map(({ gradedCount: _gc, ...m }) => ({
        ...m,
        masteryLevel: m.totalPoints > 0 ? (m.earnedPoints / m.totalPoints) * 100 : 0,
      }))
      .sort((a, b) => a.masteryLevel - b.masteryLevel); // Weakest topics first

    // Enhanced Best Practice: Analyze Topic Mastery from Learning Objectives (TP) if linked.
    // Grouping by TP gives teachers curriculum-aligned insights rather than just question
    // performance. Reuses the attempts loaded above (bounded by take: 1000) to avoid a
    // second unbounded query with deeply nested relations.
    const tpMastery: Record<string, any> = {};
    exam.attempts.forEach((attempt) => {
      attempt.answers.forEach((answer) => {
        const tp = answer.question.learningObjective;
        if (tp && answer.score !== null) {
          if (!tpMastery[tp.id]) {
            tpMastery[tp.id] = {
              objectiveId: tp.id,
              code: tp.code,
              description: tp.description,
              totalPoints: 0,
              earnedPoints: 0,
            };
          }
          tpMastery[tp.id].totalPoints += answer.question.points;
          tpMastery[tp.id].earnedPoints += Number(answer.score);
        }
      });
    });

    const tpResults = Object.values(tpMastery)
      .map((m: any) => ({
        ...m,
        masteryLevel: m.totalPoints > 0 ? (m.earnedPoints / m.totalPoints) * 100 : 0,
      }))
      .sort((a, b) => a.masteryLevel - b.masteryLevel);

    // Return an object with items and metadata so truncation info survives
    // JSON serialization (named properties on arrays are silently dropped
    // by JSON.stringify).
    return {
      items: results,
      topicMastery: tpResults.length > 0 ? tpResults : undefined,
      _meta: truncated
        ? {
            truncated: true,
            analyzedAttempts: exam.attempts.length,
            message: 'Results based on first 1000 attempts only',
          }
        : { truncated: false },
    };
  }

  static async finishExamAttempt(attemptId: string, studentId: string) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: { questionBank: { include: { questions: { orderBy: { order: 'asc' } } } } },
        },
        answers: true,
      },
    });

    if (!attempt) throw Errors.notFound('Attempt');
    if (attempt.studentId !== studentId) throw Errors.forbidden('Access denied');
    if (attempt.status !== 'IN_PROGRESS') {
      if (attempt.status === 'COMPLETED') {
        await CBTService.syncGradeToAcademicGradebook(attemptId, false);
      }
      // Strip sensitive fields before returning to the student to prevent leaking
      // correct answers and explanations. Only expose the same fields as getAttempt.
      if (attempt.exam?.questionBank?.questions) {
        attempt.exam.questionBank.questions = attempt.exam.questionBank.questions
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(
            ({ id, type, content, options, points }) => ({ id, type, content, options, points })
          ) as any;
      }
      return attempt;
    }

    // Auto grading
    let totalScore = 0;
    let hasEssay = false;
    const questions = attempt.exam.questionBank?.questions || [];

    const gradedAnswers = [];

    for (const question of questions) {
      const studentAnswer = attempt.answers.find((a) => a.questionId === question.id);
      let isCorrect = false;
      let score = 0;

      if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
        // Compare answerKey. Assuming answerKey is { optionId: "..." } or simple string
        // studentAnswer.answer should match structure.
        // Simple logic: if JSON stringify matches (careful with order) or direct value check.
        // Assuming answerKey is just the ID of the correct option.

        const key = question.answerKey as any; // e.g. "opt-1"
        const studentAns = studentAnswer?.answer as any; // e.g. "opt-1"

        // Use JSON.stringify for comparison to handle both primitive and
        // object JSON values (Prisma Json fields may be deserialized objects).
        if (key != null && studentAns != null && JSON.stringify(key) === JSON.stringify(studentAns)) {
          isCorrect = true;
          score = question.points;
        }
      } else if (question.type === 'ESSAY') {
        hasEssay = true;
      }
      // Essay needs manual grading, score remains 0 or null.

      if (studentAnswer) {
        const isEssay = question.type === 'ESSAY';
        gradedAnswers.push(
          prisma.examAnswer.update({
            where: { id: studentAnswer.id },
            data: {
              isCorrect: isEssay ? null : isCorrect,
              score: isEssay ? null : score,
            },
          })
        );
      } else if (question.type === 'ESSAY') {
        // Upsert an empty answer record for unanswered essay questions
        // so teachers can grade them later via gradeEssayAnswer.
        // Using upsert instead of create to be idempotent if finishExamAttempt
        // is called concurrently (avoids unique constraint violation).
        gradedAnswers.push(
          prisma.examAnswer.upsert({
            where: {
              attemptId_questionId: { attemptId, questionId: question.id },
            },
            create: {
              attemptId,
              questionId: question.id,
              answer: Prisma.JsonNull,
              isCorrect: null,
              score: null,
            },
            update: {},
          })
        );
      }

      totalScore += score;
    }

    // Include the attempt status update in the same transaction as answer grading
    // to avoid a race condition where answers are graded but the attempt stays IN_PROGRESS.
    gradedAnswers.push(
      prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: hasEssay ? 'NEEDS_REVIEW' : 'COMPLETED',
          finishedAt: new Date(),
          score: new Decimal(totalScore),
        },
      })
    );

    await prisma.$transaction(gradedAnswers);

    // Re-fetch the attempt using Prisma `select` on questions to avoid
    // leaking sensitive fields (answerKey, explanation) to the student.
    // This matches the same shape used by getAttempt.
    const finishedAttempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
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

    if (!finishedAttempt) throw Errors.notFound('Attempt');

    if (finishedAttempt.status === 'COMPLETED') {
      await CBTService.syncGradeToAcademicGradebook(attemptId, false);
    }

    return finishedAttempt;
  }

  static async recordSecurityLog(input: RecordSecurityLogInput, studentId?: string) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: input.attemptId },
    });
    if (!attempt) throw Errors.notFound('Attempt');
    if (!studentId || attempt.studentId !== studentId) {
      throw Errors.forbidden('Access denied');
    }

    return prisma.examSecurityLog.create({
      data: {
        attemptId: input.attemptId,
        // Shared `SecurityEventType` is a literal union matching the Prisma
        // enum exactly (pinned by a sync test), so no cast is needed here.
        eventType: input.eventType,
        details: input.details ? (input.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  static async syncGradeToAcademicGradebook(attemptId: string, forceUpdate = false) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            teacher: { select: { id: true, userId: true } },
            questionBank: {
              include: { questions: { select: { points: true } } },
            },
          },
        },
      },
    });

    if (!attempt || attempt.status !== 'COMPLETED' || attempt.score === null) {
      return null;
    }

    const { exam, studentId } = attempt;
    const questions = exam.questionBank?.questions || [];
    const bankTotalPoints = questions.reduce((sum, q) => sum + q.points, 0);
    const maxScore = bankTotalPoints > 0 ? bankTotalPoints : Number(exam.maxScore) || 100;
    const rawScore = Number(attempt.score);
    const percentage = maxScore > 0 ? Math.min(100, Math.max(0, (rawScore / maxScore) * 100)) : 0;

    let letterGrade = 'E';
    if (percentage >= 90) letterGrade = 'A';
    else if (percentage >= 80) letterGrade = 'B';
    else if (percentage >= 70) letterGrade = 'C';
    else if (percentage >= 60) letterGrade = 'D';

    const gradedById = exam.teacher?.userId || exam.teacherId;

    const gradeData = {
      studentId,
      subjectId: exam.subjectId,
      examId: exam.id,
      academicYearId: exam.academicYearId,
      type: 'EXAM' as const,
      score: new Decimal(rawScore),
      maxScore: new Decimal(maxScore),
      percentage: new Decimal(percentage),
      letterGrade,
      gradedById,
      gradedAt: attempt.finishedAt || new Date(),
    };

    return prisma.grade.upsert({
      where: {
        studentId_examId: {
          studentId,
          examId: exam.id,
        },
      },
      create: gradeData,
      update: forceUpdate
        ? {
            score: gradeData.score,
            maxScore: gradeData.maxScore,
            percentage: gradeData.percentage,
            letterGrade: gradeData.letterGrade,
            gradedById: gradeData.gradedById,
            gradedAt: gradeData.gradedAt,
          }
        : {},
    });
  }

  /**
   * Item analysis per question (classical test theory):
   * - Difficulty index (P): proportion of graded answers that were correct.
   *   P < 0.3 hard, 0.3–0.7 medium, > 0.7 easy.
   * - Discrimination index (D): how well the item separates high scorers from
   *   low scorers, computed with the standard upper/lower 27% groups:
   *   D = (correct in upper group − correct in lower group) / group size.
   *   D ≥ 0.4 excellent, 0.3–0.39 good, 0.2–0.29 marginal, < 0.2 poor.
   *   Only computed with ≥ 10 finished attempts; null otherwise.
   * Also flags "killer questions" (high failure rate with enough data).
   */
  static async getExamDifficultyInsights(examId: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questionBank: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
        attempts: {
          where: { status: { in: ['COMPLETED', 'NEEDS_REVIEW'] } },
          include: {
            answers: true,
          },
        },
      },
    });

    if (!exam || !exam.questionBank) return null;

    // Rank attempts by total score in memory (score may be null for
    // NEEDS_REVIEW attempts; treat those as 0 for ranking purposes).
    const rankedAttempts = [...exam.attempts].sort(
      (a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)
    );
    const attemptsCount = rankedAttempts.length;
    const canDiscriminate = attemptsCount >= 10;
    const groupSize = Math.max(1, Math.floor(attemptsCount * 0.27));
    const upperGroup = rankedAttempts.slice(0, groupSize);
    const lowerGroup = rankedAttempts.slice(-groupSize);

    const countCorrect = (group: typeof rankedAttempts, questionId: string) =>
      group.filter((a) => a.answers.find((ans) => ans.questionId === questionId)?.isCorrect)
        .length;

    const insights = exam.questionBank.questions.map((q) => {
      const answers = exam.attempts
        .map((a) => a.answers.find((ans) => ans.questionId === q.id))
        .filter((ans) => ans && ans.score !== null);

      const totalGraded = answers.length;
      const totalCorrect = answers.filter((ans) => ans?.isCorrect).length;
      const successRate = totalGraded > 0 ? (totalCorrect / totalGraded) * 100 : 0;

      const discriminationIndex = canDiscriminate
        ? (countCorrect(upperGroup, q.id) - countCorrect(lowerGroup, q.id)) / groupSize
        : null;

      return {
        questionId: q.id,
        content: q.content.substring(0, 100),
        successRate,
        difficultyIndex: totalGraded > 0 ? totalCorrect / totalGraded : null,
        discriminationIndex,
        totalGraded,
        isKiller: successRate < 30 && totalGraded > 5,
        needsReview:
          (totalGraded > 5 && successRate < 20) ||
          (discriminationIndex !== null && discriminationIndex < 0.2),
      };
    });

    return {
      examId,
      title: exam.title,
      questionInsights: insights.sort((a, b) => a.successRate - b.successRate),
      averageSuccessRate: insights.length > 0 ? insights.reduce((sum, i) => sum + i.successRate, 0) / insights.length : 0,
      totalParticipants: attemptsCount,
      discriminationGroupSize: canDiscriminate ? groupSize : null,
    };
  }
}
