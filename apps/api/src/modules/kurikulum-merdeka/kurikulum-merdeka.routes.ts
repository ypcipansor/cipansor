import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import * as kurikulumMerdekaController from './kurikulum-merdeka.controller';

const router = Router();

// Every route needs a login. The reads below were declared ahead of
// `router.use(authenticate)` under a "PUBLIC ROUTES" banner, so until
// 2026-09-24 anyone on the internet could list P5 assessments and assessment
// results, each carrying the santri's full row (NIK, No. KK, the parents' NIK
// and income). Rows are further narrowed per account in the service.
router.use(authenticate);

// ==================== READ ROUTES ====================

// Learning Phases
router.get('/phases', kurikulumMerdekaController.getPhases);
router.get('/phases/:id', kurikulumMerdekaController.getPhase);

// Learning Outcomes
router.get('/learning-outcomes', kurikulumMerdekaController.getLearningOutcomes);
router.get('/learning-outcomes/:id', kurikulumMerdekaController.getLearningOutcome);

// Learning Objectives
router.get('/learning-objectives', kurikulumMerdekaController.getLearningObjectives);
router.get('/learning-objectives/:id', kurikulumMerdekaController.getLearningObjective);

// Teaching Modules
router.get('/teaching-modules', kurikulumMerdekaController.getTeachingModules);
router.get('/teaching-modules/:id', kurikulumMerdekaController.getTeachingModule);

// P5 Themes & Dimensions
router.get('/p5-themes', kurikulumMerdekaController.getP5Themes);
router.get('/p5-themes/:id', kurikulumMerdekaController.getP5Theme);
router.get('/p5-dimensions', kurikulumMerdekaController.getP5Dimensions);

// P5 Projects
router.get('/p5-projects', kurikulumMerdekaController.getP5Projects);
router.get('/p5-projects/:id', kurikulumMerdekaController.getP5Project);

// P5 Assessments
router.get('/p5-assessments', kurikulumMerdekaController.getP5Assessments);
router.get('/p5-assessments/:id', kurikulumMerdekaController.getP5Assessment);

// Merdeka Assessments
router.get('/assessments', kurikulumMerdekaController.getMerdekaAssessments);
router.get('/assessments/:id', kurikulumMerdekaController.getMerdekaAssessment);

// Merdeka Assessment Results
router.get('/assessment-results', kurikulumMerdekaController.getMerdekaResults);
router.get('/assessment-results/:id', kurikulumMerdekaController.getMerdekaResult);

// Summary
router.get('/summary', kurikulumMerdekaController.getSummary);

// ==================== WRITE ROUTES ====================

// Learning Phases (Admin only)
router.post('/phases', authorize(UserRole.SUPER_ADMIN), kurikulumMerdekaController.postPhase);
router.put('/phases/:id', authorize(UserRole.SUPER_ADMIN), kurikulumMerdekaController.putPhase);

// Learning Outcomes (Admin only)
router.post(
  '/learning-outcomes',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.postLearningOutcome
);
router.put(
  '/learning-outcomes/:id',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.putLearningOutcome
);
router.delete(
  '/learning-outcomes/:id',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.removeLearningOutcome
);

// Learning Objectives (Admin only)
router.post(
  '/learning-objectives',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.postLearningObjective
);
router.put(
  '/learning-objectives/:id',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.putLearningObjective
);
router.delete(
  '/learning-objectives/:id',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.removeLearningObjective
);

// Teaching Modules (Admin/Teacher)
router.post(
  '/teaching-modules',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.postTeachingModule
);
router.put(
  '/teaching-modules/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.putTeachingModule
);
router.delete(
  '/teaching-modules/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.removeTeachingModule
);

// P5 Themes (Admin only)
router.post('/p5-themes', authorize(UserRole.SUPER_ADMIN), kurikulumMerdekaController.postP5Theme);
router.put(
  '/p5-themes/:id',
  authorize(UserRole.SUPER_ADMIN),
  kurikulumMerdekaController.putP5Theme
);

// P5 Projects (Admin/Teacher)
router.post(
  '/p5-projects',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.postP5Project
);
router.put(
  '/p5-projects/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.putP5Project
);
router.delete(
  '/p5-projects/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  kurikulumMerdekaController.removeP5Project
);

// P5 Assessments (Admin/Teacher)
router.post(
  '/p5-assessments',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.postP5Assessment
);
router.put(
  '/p5-assessments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.putP5Assessment
);
router.delete(
  '/p5-assessments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.removeP5Assessment
);

// Merdeka Assessments (Admin/Teacher)
router.post(
  '/assessments',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.postMerdekaAssessment
);
router.put(
  '/assessments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.putMerdekaAssessment
);
router.delete(
  '/assessments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.removeMerdekaAssessment
);

// Merdeka Assessment Results (Admin/Teacher)
router.post(
  '/assessment-results',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.postMerdekaResult
);
router.put(
  '/assessment-results/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.putMerdekaResult
);
router.delete(
  '/assessment-results/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  kurikulumMerdekaController.removeMerdekaResult
);

export default router;
