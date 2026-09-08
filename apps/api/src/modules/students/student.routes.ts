import { Router } from 'express';
import { authenticate, hasPermission } from '@/middleware/auth';
import { validate, validateQuery, validateParams } from '@/middleware/error';
import * as controller from './student.controller';
import { IdCardController } from './id-card.controller';
import { PERMISSIONS } from '../roles/permissions';
import {
  createStudentSchema,
  updateStudentSchema,
  graduateStudentSchema,
  listStudentsQuerySchema,
  studentIdParamSchema,
} from './student.schema';

const router = Router();

// ==================== PUBLIC ROUTES ====================

router.post('/id-cards/verify', IdCardController.verifyQRCode);
router.get('/id-cards/verify', IdCardController.verifyQRCodeGet);

// ==================== AUTHENTICATED ROUTES ====================

router.use(authenticate);

router.get(
  '/',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateQuery(listStudentsQuerySchema),
  controller.list
);

router.get(
  '/alumni/lookup',
  hasPermission(PERMISSIONS.STUDENT_CREATE),
  controller.lookupAlumni
);

// ==================== ID CARD ROUTES ====================

router.get(
  '/id-cards/templates',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.getTemplates
);

router.get(
  '/id-cards/stats/:unitId',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.getStatistics
);

router.get(
  '/id-cards/classes/:classId',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.generateClassCards
);

router.get(
  '/:studentId/id-card',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.generateStudentCard
);

router.get(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateParams(studentIdParamSchema),
  controller.getById
);

router.get(
  '/:id/complete-profile',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateParams(studentIdParamSchema),
  controller.getCompleteProfile
);

router.post(
  '/',
  hasPermission(PERMISSIONS.STUDENT_CREATE),
  validate(createStudentSchema),
  controller.create
);

router.post(
  '/:id/graduate',
  hasPermission(PERMISSIONS.STUDENT_UPDATE),
  validateParams(studentIdParamSchema),
  validate(graduateStudentSchema),
  controller.graduate
);

router.put(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_UPDATE),
  validateParams(studentIdParamSchema),
  validate(updateStudentSchema),
  controller.update
);

router.delete(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_DELETE),
  validateParams(studentIdParamSchema),
  controller.remove
);

export default router;
