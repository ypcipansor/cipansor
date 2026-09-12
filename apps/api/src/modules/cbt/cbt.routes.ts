import { Router } from 'express';
import { CBTController } from './cbt.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { LEGACY_ROLE_EXPANSION, recordSecurityLogSchema } from '@cipansor/shared';

// RoleCode-based access for the CBT module. The admin/teacher and student sets
// are derived from the canonical legacy-bucket expansion (`@cipansor/shared`
// roles.ts) so behavior is identical to the old `UserRole.UNIT_ADMIN/TEACHER/STUDENT`
// guards while authorization runs on native RoleCodes (AGENTS.md golden rule #3).
const adminTeacherRoleCodes = [
  ...LEGACY_ROLE_EXPANSION.SUPER_ADMIN,
  ...LEGACY_ROLE_EXPANSION.UNIT_ADMIN,
  ...LEGACY_ROLE_EXPANSION.TEACHER,
];
const studentRoleCodes = LEGACY_ROLE_EXPANSION.STUDENT;

const router = Router();

// --- Admin/Teacher Routes ---
// Bank Management
router.get(
  '/banks',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getQuestionBanks
);
router.post(
  '/banks',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.createQuestionBank
);
router.get(
  '/banks/:id',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getQuestionBankById
);
router.delete(
  '/banks/:id',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.deleteQuestionBank
);

// Question Management
router.post(
  '/banks/:id/questions',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.addQuestion
);
router.put(
  '/banks/:id/questions/:questionId',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.updateQuestion
);
router.delete(
  '/banks/:id/questions/:questionId',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.deleteQuestion
);

// --- Exam Scheduling ---
router.get('/exams', authenticate, authorize(...adminTeacherRoleCodes), CBTController.getExams);
router.post('/exams', authenticate, authorize(...adminTeacherRoleCodes), CBTController.createExam);
router.delete(
  '/exams/:examId',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.deleteExam
);
router.get(
  '/exams/:examId/monitoring',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getExamMonitoring
);
router.get(
  '/exams/:examId/topic-mastery',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getTopicMasteryAnalytics
);
router.get(
  '/exams/:examId/difficulty-insights',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getExamDifficultyInsights
);

// --- Teacher Grading ---
router.get(
  '/attempts/:attemptId/grading',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.getAttemptForGrading
);
router.post(
  '/attempts/:attemptId/grade',
  authenticate,
  authorize(...adminTeacherRoleCodes),
  CBTController.gradeEssayAnswer
);

// --- Student Routes ---
// Exam Taking
// Start Exam (examId is the ID of the scheduled Exam)
router.post(
  '/exams/:examId/start',
  authenticate,
  authorize(...studentRoleCodes),
  CBTController.startExam
);

// Get Attempt Details (Questions, etc.)
router.get(
  '/attempts/:attemptId',
  authenticate,
  authorize(...studentRoleCodes),
  CBTController.getAttempt
);

// Submit Answer
router.post(
  '/attempts/:attemptId/answer',
  authenticate,
  authorize(...studentRoleCodes),
  CBTController.submitAnswer
);

// Finish Exam
router.post(
  '/attempts/:attemptId/finish',
  authenticate,
  authorize(...studentRoleCodes),
  CBTController.finishExam
);

// Record Security Log (Anti-cheating tab switch/blur monitoring)
router.post(
  '/attempts/:attemptId/security-log',
  authenticate,
  authorize(...studentRoleCodes),
  validate(recordSecurityLogSchema),
  CBTController.recordSecurityLog
);

export const cbtRoutes = router;
