import { Router } from 'express';
import { TahfidzController } from './tahfidz.controller';
import { authenticate, authorize, isStaffMember, isTeacherOrAbove } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import {
  createTahfidzSchema,
  updateTahfidzSchema,
  generateCertificateSchema,
} from './tahfidz.schema';
import { UserRole } from '@prisma/client';

const router = Router();
const controller = new TahfidzController();

router.use(authenticate);

// Dashboard stats — a school-wide leaderboard, for staff only.
router.get('/stats', isStaffMember, controller.getDashboardStats);

// Student Summary (Specific route must come before generic ID route)
router.get('/summary/:studentId', controller.getStudentSummary);

// Quran Map Analytics
router.get('/map/:studentId', controller.getQuranMap);

// CRUD
router.get('/', controller.findAll);
router.get('/:id', controller.findById);
router.post('/', isTeacherOrAbove, validate(createTahfidzSchema), controller.create);
router.put('/:id', isTeacherOrAbove, validate(updateTahfidzSchema), controller.update);
router.delete('/:id', isTeacherOrAbove, controller.delete);

// Certificates
router.post(
  '/certificates/generate',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validate(generateCertificateSchema),
  controller.generateCertificate
);

export default router;
