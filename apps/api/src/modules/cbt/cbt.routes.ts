import { Router } from 'express';
import { CBTController } from './cbt.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { recordSecurityLogSchema, STUDENT_ROLE_CODES } from '@cipansor/shared';
import { UserRole } from '@prisma/client';

const router = Router();

// --- Admin/Teacher Routes ---
// Bank Management
router.get(
  '/banks',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getQuestionBanks
);
router.post(
  '/banks',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.createQuestionBank
);
router.get(
  '/banks/:id',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getQuestionBankById
);
router.delete(
  '/banks/:id',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.deleteQuestionBank
);

// Question Management
router.post(
  '/banks/:id/questions',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.addQuestion
);
router.put(
  '/banks/:id/questions/:questionId',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.updateQuestion
);
router.delete(
  '/banks/:id/questions/:questionId',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.deleteQuestion
);

// --- Exam Scheduling ---
router.get(
  '/exams',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getExams
);
router.post(
  '/exams',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.createExam
);
router.delete(
  '/exams/:examId',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.deleteExam
);
router.get(
  '/exams/:examId/monitoring',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getExamMonitoring
);
router.get(
  '/exams/:examId/topic-mastery',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getTopicMasteryAnalytics
);
router.get(
  '/exams/:examId/difficulty-insights',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getExamDifficultyInsights
);

// --- Teacher Grading ---
router.get(
  '/attempts/:attemptId/grading',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.getAttemptForGrading
);
router.post(
  '/attempts/:attemptId/grade',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  CBTController.gradeEssayAnswer
);

// --- Student Routes ---
// Exam Taking
// Start Exam (examId is the ID of the scheduled Exam)
router.post(
  '/exams/:examId/start',
  authenticate,
  authorize(UserRole.STUDENT),
  CBTController.startExam
);

// Get Attempt Details (Questions, etc.)
router.get(
  '/attempts/:attemptId',
  authenticate,
  authorize(UserRole.STUDENT),
  CBTController.getAttempt
);

// Submit Answer
router.post(
  '/attempts/:attemptId/answer',
  authenticate,
  authorize(...STUDENT_ROLE_CODES),
  CBTController.submitAnswer
);

// Finish Exam
router.post(
  '/attempts/:attemptId/finish',
  authenticate,
  authorize(...STUDENT_ROLE_CODES),
  CBTController.finishExam
);

// Record Security Log
router.post(
  '/attempts/:attemptId/security-log',
  authenticate,
  authorize(...STUDENT_ROLE_CODES),
  validate(recordSecurityLogSchema),
  CBTController.recordSecurityLog
);

export const cbtRoutes = router;
