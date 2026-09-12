import { Request, Response, NextFunction } from 'express';
import { recordSecurityLogSchema } from '@cipansor/shared';
import { CBTService } from './cbt.service';
import { Errors } from '@/middleware/error';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/middleware/auth';

export class CBTController {
  // --- Banks ---
  static async getQuestionBanks(req: Request, res: Response, next: NextFunction) {
    try {
      // Filters
      const { unitId, subjectId, search } = req.query;
      const user = requireUser(req);

      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'UNIT_ADMIN';

      if (user.role !== 'SUPER_ADMIN' && !user.unitId) {
        throw Errors.badRequest('User has no unit assigned');
      }

      const filterUnitId = user.role === 'SUPER_ADMIN' ? (unitId as string) : (user.unitId ?? undefined);

      if (user.role !== 'SUPER_ADMIN' && !filterUnitId) {
        throw Errors.badRequest('unitId is required for data isolation');
      }

      const banks = await CBTService.getQuestionBanks({
        unitId: filterUnitId,
        subjectId: subjectId as string,
        teacherUserId: isAdmin ? undefined : user.id, // Admins see all in their scope, teachers see theirs
        search: search as string,
      });

      res.json({ success: true, data: banks });
    } catch (error) {
      next(error);
    }
  }

  static async recordSecurityLog(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      // Validated here so an unknown event name answers 400 naming the field,
      // rather than reaching the database and failing its CHECK as a 500.
      const body = recordSecurityLogSchema.parse(req.body);

      const result = await CBTService.recordSecurityLog(
        req.params.attemptId,
        user.id,
        { type: body.eventType, details: body.details }
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getTopicMasteryAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { examId } = req.params;
      const user = requireUser(req);

      // Unit-level authorization: verify the exam belongs to the user's unit
      if (user.role !== 'SUPER_ADMIN') {
        if (!user.unitId) {
          throw Errors.badRequest('User has no unit assigned');
        }
        const exam = await prisma.exam.findUnique({
          where: { id: examId },
          select: { unitId: true },
        });
        if (!exam) {
          throw Errors.notFound('Exam or Question Bank');
        }
        if (exam.unitId !== user.unitId) {
          throw Errors.forbidden('Access to this exam is not allowed');
        }
      }

      const analytics = await CBTService.getTopicMasteryAnalytics(examId);
      if (analytics === null) {
        throw Errors.notFound('Exam or Question Bank');
      }
      res.json({
        success: true,
        data: analytics.items,
        topicMastery: analytics.topicMastery,
        _meta: analytics._meta,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createQuestionBank(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.title) {
        throw Errors.badRequest('title is required');
      }

      const user = requireUser(req);
      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'UNIT_ADMIN';

      let teacherId = req.body.teacherId;
      if (!isAdmin) {
        const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
        if (!teacher) {
          throw Errors.badRequest('No teacher profile found for this user');
        }
        teacherId = teacher.id;
      } else if (!teacherId) {
        throw Errors.badRequest('teacherId is required for admins to create a question bank');
      }

      if (user.role !== 'SUPER_ADMIN' && !user.unitId) {
        throw Errors.badRequest('User has no unit assigned');
      }

      const unitId = user.role === 'SUPER_ADMIN' ? req.body.unitId : user.unitId;
      if (!unitId) {
        throw Errors.badRequest('unitId is required');
      }

      const bank = await CBTService.createQuestionBank({
        title: req.body.title,
        description: req.body.description,
        subjectId: req.body.subjectId,
        teacherId,
        unitId,
      });
      res.status(201).json({ success: true, data: bank });
    } catch (error) {
      next(error);
    }
  }

  static async getQuestionBankById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const bank = await CBTService.getQuestionBankById(req.params.id, user);
      res.json({ success: true, data: bank });
    } catch (error) {
      next(error);
    }
  }

  static async deleteQuestionBank(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      await CBTService.deleteQuestionBank(req.params.id, user);
      res.json({ success: true, message: 'Question Bank deleted' });
    } catch (error) {
      next(error);
    }
  }

  // --- Questions ---
  static async addQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const question = await CBTService.addQuestion(
        {
          bankId: req.params.id,
          type: req.body.type,
          content: req.body.content,
          options: req.body.options,
          answerKey: req.body.answerKey,
          explanation: req.body.explanation,
          points: req.body.points,
          order: req.body.order,
        },
        user
      );
      res.status(201).json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  }

  static async updateQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const question = await CBTService.updateQuestion(
        req.params.questionId,
        {
          content: req.body.content,
          options: req.body.options,
          answerKey: req.body.answerKey,
          explanation: req.body.explanation,
          points: req.body.points,
          order: req.body.order,
        },
        user
      );
      res.json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  }

  static async deleteQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      await CBTService.deleteQuestion(req.params.questionId, user);
      res.json({ success: true, message: 'Question deleted' });
    } catch (error) {
      next(error);
    }
  }

  // --- Exam Scheduling ---
  static async getExams(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const { unitId, academicYearId, subjectId, search, status, page, limit } = req.query;

      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'UNIT_ADMIN';

      if (user.role !== 'SUPER_ADMIN' && !user.unitId) {
        throw Errors.badRequest('User has no unit assigned');
      }

      const filterUnitId = user.role === 'SUPER_ADMIN' ? (unitId as string) : (user.unitId ?? undefined);

      if (user.role !== 'SUPER_ADMIN' && !filterUnitId) {
        throw Errors.badRequest('unitId is required for data isolation');
      }

      const pageNum = page ? parseInt(page as string, 10) : 1;
      const limitNum = limit ? parseInt(limit as string, 10) : 20;

      const result = await CBTService.getExams({
        page: pageNum,
        limit: limitNum,
        teacherUserId: isAdmin ? undefined : user.id,
        unitId: filterUnitId,
        academicYearId: academicYearId as string,
        subjectId: subjectId as string,
        search: search as string,
        status: status as any,
        requireUnitScope: user.role === 'UNIT_ADMIN',
      });
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  static async createExam(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.questionBankId) {
        throw Errors.badRequest('questionBankId is required');
      }

      if (!req.body.title) {
        throw Errors.badRequest('title is required');
      }

      if (!req.body.academicYearId) {
        throw Errors.badRequest('academicYearId is required');
      }

      if (!req.body.subjectId) {
        throw Errors.badRequest('subjectId is required');
      }

      if (!req.body.classId) {
        throw Errors.badRequest('classId is required');
      }

      if (!req.body.scheduledAt) {
        throw Errors.badRequest('scheduledAt is required');
      }

      const user = requireUser(req);
      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'UNIT_ADMIN';

      let teacherId = req.body.teacherId;
      if (!isAdmin) {
        const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
        if (!teacher) {
          throw Errors.badRequest('No teacher profile found for this user');
        }
        teacherId = teacher.id;
      } else if (!teacherId) {
        throw Errors.badRequest('teacherId is required for admins to create an exam');
      }

      if (user.role !== 'SUPER_ADMIN' && !user.unitId) {
        throw Errors.badRequest('User has no unit assigned');
      }

      const unitId = user.role === 'SUPER_ADMIN' ? req.body.unitId : user.unitId;
      if (!unitId) {
        throw Errors.badRequest('unitId is required');
      }

      const exam = await CBTService.createExam(
        {
          title: req.body.title,
          description: req.body.description,
          type: req.body.type,
          academicYearId: req.body.academicYearId,
          subjectId: req.body.subjectId,
          classId: req.body.classId,
          questionBankId: req.body.questionBankId,
          scheduledAt: req.body.scheduledAt,
          duration: req.body.duration,
          maxScore: req.body.maxScore,
          passingScore: req.body.passingScore,
          weight: req.body.weight,
          status: req.body.status,
          instructions: req.body.instructions,
          teacherId,
          unitId,
        },
        user
      );
      res.status(201).json({ success: true, data: exam });
    } catch (error) {
      next(error);
    }
  }

  static async deleteExam(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      await CBTService.deleteExam(req.params.examId, user);
      res.json({ success: true, message: 'Exam deleted' });
    } catch (error) {
      next(error);
    }
  }

  static async getExamMonitoring(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const monitoringData = await CBTService.getExamMonitoring(req.params.examId, user);
      res.json({ success: true, data: monitoringData });
    } catch (error) {
      next(error);
    }
  }

  // --- Teacher Grading ---
  static async getAttemptForGrading(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const attempt = await CBTService.getAttemptForGrading(req.params.attemptId, user);
      res.json({ success: true, data: attempt });
    } catch (error) {
      next(error);
    }
  }

  static async gradeEssayAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const { questionId, score, isCorrect } = req.body;

      if (!questionId) {
        throw Errors.badRequest('questionId is required');
      }
      if (score === undefined || score === null) {
        throw Errors.badRequest('score is required');
      }

      const numericScore = Number(score);
      if (Number.isNaN(numericScore)) {
        throw Errors.badRequest('score must be a valid number');
      }

      const result = await CBTService.gradeEssayAnswer(
        req.params.attemptId,
        questionId,
        { score: numericScore, isCorrect: isCorrect ?? false },
        user
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // --- Exam Taking ---
  static async startExam(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const student = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) {
        throw Errors.unauthorized('User is not a student');
      }
      const attempt = await CBTService.startExamAttempt(req.params.examId, student.id);
      res.status(201).json({ success: true, data: attempt });
    } catch (error) {
      next(error);
    }
  }

  static async getAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const student = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) {
        throw Errors.unauthorized('User is not a student');
      }
      const attempt = await CBTService.getAttempt(req.params.attemptId, student.id);
      res.json({ success: true, data: attempt });
    } catch (error) {
      next(error);
    }
  }

  static async submitAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const { questionId, answer } = req.body;
      const user = requireUser(req);

      if (!questionId) {
        throw Errors.badRequest('questionId is required');
      }

      const student = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) {
        throw Errors.unauthorized('User is not a student');
      }

      await CBTService.submitAnswer(req.params.attemptId, questionId, answer, student.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  static async finishExam(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);

      const student = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) {
        throw Errors.unauthorized('User is not a student');
      }

      const attempt = await CBTService.finishExamAttempt(req.params.attemptId, student.id);
      res.json({ success: true, data: attempt });
    } catch (error) {
      next(error);
    }
  }

  static async getExamDifficultyInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const { examId } = req.params;
      const user = requireUser(req);

      // Authorization check (Unit level)
      if (user.role !== 'SUPER_ADMIN') {
        const exam = await prisma.exam.findUnique({
          where: { id: examId },
          select: { unitId: true },
        });
        if (!exam) throw Errors.notFound('Exam');
        if (user.unitId && exam.unitId !== user.unitId) {
          throw Errors.forbidden('Access to this exam data is not allowed');
        }
      }

      const insights = await CBTService.getExamDifficultyInsights(examId);
      if (!insights) throw Errors.notFound('Exam');

      res.json({ success: true, data: insights });
    } catch (error) {
      next(error);
    }
  }
}
