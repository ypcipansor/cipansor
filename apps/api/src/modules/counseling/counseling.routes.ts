import { Router } from 'express';
import { counselingController } from './counseling.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { RoleCode } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Reusable authorizers for counseling routes.
//
// Legacy UserRole strings ('UNIT_ADMIN', 'TEACHER', 'PARENT') are included
// alongside the new RoleCode values so that pre-migration JWT tokens (whose
// roleCode is the legacy enum string) continue to work. The authorize()
// middleware expands both directions via LEGACY_ROLE_EXPANSION — see
// apps/api/src/middleware/auth.ts.
const teacherAndAbove = () =>
  authorize(
    RoleCode.SUPER_ADMIN,
    RoleCode.TKQ_ADMIN,
    RoleCode.SDIT_ADMIN,
    RoleCode.SMPIT_ADMIN,
    RoleCode.SMAQ_ADMIN,
    RoleCode.TKQ_GURU,
    RoleCode.SDIT_GURU,
    RoleCode.SMPIT_GURU,
    RoleCode.SMAQ_GURU,
    RoleCode.TKQ_KEPALA_SEKOLAH,
    RoleCode.SDIT_KEPALA_SEKOLAH,
    RoleCode.SMPIT_KEPALA_SEKOLAH,
    RoleCode.SMAQ_KEPALA_SEKOLAH,
    RoleCode.MUSYRIF,
    RoleCode.MUHAFIDZ,
    'UNIT_ADMIN',
    'TEACHER' // Legacy pre-migration token values
  );

const adminOnly = () =>
  authorize(
    RoleCode.SUPER_ADMIN,
    RoleCode.TKQ_ADMIN,
    RoleCode.SDIT_ADMIN,
    RoleCode.SMPIT_ADMIN,
    RoleCode.SMAQ_ADMIN,
    'UNIT_ADMIN' // Legacy pre-migration token value
  );

const teacherOrParent = () =>
  authorize(
    RoleCode.SUPER_ADMIN,
    RoleCode.TKQ_ADMIN,
    RoleCode.SDIT_ADMIN,
    RoleCode.SMPIT_ADMIN,
    RoleCode.SMAQ_ADMIN,
    RoleCode.TKQ_GURU,
    RoleCode.SDIT_GURU,
    RoleCode.SMPIT_GURU,
    RoleCode.SMAQ_GURU,
    RoleCode.TKQ_KEPALA_SEKOLAH,
    RoleCode.SDIT_KEPALA_SEKOLAH,
    RoleCode.SMPIT_KEPALA_SEKOLAH,
    RoleCode.SMAQ_KEPALA_SEKOLAH,
    RoleCode.MUSYRIF,
    RoleCode.MUHAFIDZ,
    RoleCode.TKQ_ORANG_TUA,
    RoleCode.SDIT_ORANG_TUA,
    RoleCode.SMPIT_ORANG_TUA,
    RoleCode.SMAQ_ORANG_TUA,
    'UNIT_ADMIN',
    'TEACHER',
    'PARENT' // Legacy pre-migration token values
  );

// ======================
// SESSION ROUTES
// ======================

// Get my sessions (counselor)
router.get(
  '/my-sessions',
  teacherAndAbove(),
  counselingController.getMySessions.bind(counselingController)
);

// Get statistics
router.get(
  '/statistics',
  adminOnly(),
  counselingController.getStatistics.bind(counselingController)
);

// Get student counseling history
router.get(
  '/students/:studentId/history',
  teacherOrParent(),
  counselingController.getStudentHistory.bind(counselingController)
);

// List all sessions
router.get('/', teacherAndAbove(), counselingController.getSessions.bind(counselingController));

// Get session by ID
router.get(
  '/:sessionId',
  teacherAndAbove(),
  counselingController.getSessionById.bind(counselingController)
);

// Create session
router.post('/', teacherAndAbove(), counselingController.createSession.bind(counselingController));

// Update session
router.put(
  '/:sessionId',
  teacherAndAbove(),
  counselingController.updateSession.bind(counselingController)
);

// Delete session
router.delete(
  '/:sessionId',
  teacherAndAbove(),
  counselingController.deleteSession.bind(counselingController)
);

// ======================
// NOTES ROUTES
// ======================

// Add note to session
router.post(
  '/:sessionId/notes',
  teacherAndAbove(),
  counselingController.addNote.bind(counselingController)
);

// Update note
router.put(
  '/notes/:noteId',
  teacherAndAbove(),
  counselingController.updateNote.bind(counselingController)
);

// Delete note
router.delete(
  '/notes/:noteId',
  teacherAndAbove(),
  counselingController.deleteNote.bind(counselingController)
);

// ======================
// REFERRAL ROUTES
// ======================

// Add referral to session
router.post(
  '/:sessionId/referrals',
  teacherAndAbove(),
  counselingController.addReferral.bind(counselingController)
);

// Update referral
router.put(
  '/referrals/:referralId',
  teacherAndAbove(),
  counselingController.updateReferral.bind(counselingController)
);

// Delete referral
router.delete(
  '/referrals/:referralId',
  teacherAndAbove(),
  counselingController.deleteReferral.bind(counselingController)
);

export default router;
