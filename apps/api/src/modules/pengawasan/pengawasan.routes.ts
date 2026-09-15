import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import { UserRole } from '@prisma/client';
import * as pengawasanController from './pengawasan.controller';

const router = Router();

// ==================== PUBLIC WBS ROUTES (No Auth Required, Gated by Turnstile) ====================

router.post(
  '/public/wbs/reports',
  requireTurnstile('wbs_report'),
  pengawasanController.createPublicWbsReport
);

router.post(
  '/public/wbs/track',
  requireTurnstile('wbs_track'),
  pengawasanController.getPublicWbsTracking
);

router.post(
  '/public/wbs/comments',
  requireTurnstile('wbs_comment'),
  pengawasanController.addPublicWbsComment
);

// ==================== AUTHENTICATED ROUTES ====================

router.use(authenticate);
router.use(
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF)
);

// Audits
router.get('/suggestions', pengawasanController.getAuditSuggestions);
router.get('/', pengawasanController.listAudits);
router.post('/', pengawasanController.createAudit);
router.get('/:id', pengawasanController.getAudit);
router.put('/:id', pengawasanController.updateAudit);
router.delete('/:id', pengawasanController.deleteAudit);

// Findings
router.post('/findings', pengawasanController.createFinding);
router.put('/findings/:id', pengawasanController.updateFinding);
router.delete('/findings/:id', pengawasanController.deleteFinding);

// Follow-ups
router.post('/follow-ups', pengawasanController.createFollowUp);
router.put('/follow-ups/:id', pengawasanController.updateFollowUp);
router.delete('/follow-ups/:id', pengawasanController.deleteFollowUp);

// WBS Management (Authenticated)
router.get('/wbs/reports', pengawasanController.listWbsReports);
router.get('/wbs/reports/:id', pengawasanController.getWbsReportById);
router.patch('/wbs/reports/:id/status', pengawasanController.updateWbsStatus);
router.post('/wbs/reports/:id/forward', pengawasanController.forwardWbsReport);
router.post('/wbs/reports/:id/comments', pengawasanController.addHandlerWbsComment);

// Board Member Suspensions
router.get('/board-suspensions', pengawasanController.listBoardSuspensions);
router.post('/board-suspensions', pengawasanController.createBoardSuspension);
router.post('/board-suspensions/:id/lift', pengawasanController.liftBoardSuspension);

// Financial Arrears Oversight
router.get('/financial-arrears', pengawasanController.getFinancialArrears);

// E-Office Periodic Oversight Report Submission
router.post('/periodic-reports/submit-eoffice', pengawasanController.submitPeriodicReportToEOffice);

export default router;
