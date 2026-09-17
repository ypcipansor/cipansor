import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import {
  PENGAWASAN_ARREARS_ROLES,
  PENGAWASAN_AUDIT_GENERAL_ROLES,
  PENGAWASAN_AUDIT_WRITE_ROLES,
  PENGAWASAN_LIFT_ROLES,
  PENGAWASAN_PERIODIC_REPORT_ROLES,
  PENGAWASAN_SUSPENSION_ROLES,
  PENGAWASAN_WBS_HANDLER_ROLES,
} from '@cipansor/shared';
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

// 1. Board Member Suspensions (Governance Only: Pengawas, Pembina & SuperAdmin)
//
// The role groups that decide these routes live in `@cipansor/shared`
// (`PENGAWASAN_*`), because the governance page now hides each control for
// roles the API would reject. A list duplicated here would let the button and
// the policy drift apart again; there is one definition, read by both.

router.get(
  '/board-suspensions',
  authorize(...PENGAWASAN_SUSPENSION_ROLES),
  pengawasanController.listBoardSuspensions
);
router.post(
  '/board-suspensions',
  authorize(...PENGAWASAN_SUSPENSION_ROLES),
  pengawasanController.createBoardSuspension
);
// Pemulihan status is the Pembina's act, not the Pengawas's.
//
// The Pengawas issues the SK Pembekuan; letting the same organ lift it means
// the oversight body both suspends and un-suspends the executive it audits,
// with no second signature. The Pembina appoints and dismisses — UU 16/2001
// Pasal 28 — so restoring a board member's status is theirs. Super Admin
// retains it for operational recovery.
router.post(
  '/board-suspensions/:id/lift',
  authorize(...PENGAWASAN_LIFT_ROLES),
  pengawasanController.liftBoardSuspension
);

// 2. Periodic Oversight Report Submission to E-Office (Pengawas & SuperAdmin Only)
router.post(
  '/periodic-reports/submit-eoffice',
  authorize(...PENGAWASAN_PERIODIC_REPORT_ROLES),
  pengawasanController.submitPeriodicReportToEOffice
);

// 3. WBS Management (Governance + Unit Heads)
router.get(
  '/wbs/reports',
  authorize(...PENGAWASAN_WBS_HANDLER_ROLES),
  pengawasanController.listWbsReports
);
router.get(
  '/wbs/reports/:id',
  authorize(...PENGAWASAN_WBS_HANDLER_ROLES),
  pengawasanController.getWbsReportById
);
router.patch(
  '/wbs/reports/:id/status',
  authorize(...PENGAWASAN_WBS_HANDLER_ROLES),
  pengawasanController.updateWbsStatus
);
router.post(
  '/wbs/reports/:id/forward',
  authorize(...PENGAWASAN_WBS_HANDLER_ROLES),
  pengawasanController.forwardWbsReport
);
router.post(
  '/wbs/reports/:id/comments',
  authorize(...PENGAWASAN_WBS_HANDLER_ROLES),
  pengawasanController.addHandlerWbsComment
);

// 4. Financial Arrears Oversight (Governance + Unit Admins/Treasurers)
router.get(
  '/financial-arrears',
  authorize(...PENGAWASAN_ARREARS_ROLES),
  pengawasanController.getFinancialArrears
);

// 5. Audits, Findings & Follow-ups (Auditors, Unit Admins, Teachers & Staff)
router.get(
  '/suggestions',
  authorize(...PENGAWASAN_AUDIT_GENERAL_ROLES),
  pengawasanController.getAuditSuggestions
);
router.get('/', authorize(...PENGAWASAN_AUDIT_GENERAL_ROLES), pengawasanController.listAudits);
router.post('/', authorize(...PENGAWASAN_AUDIT_WRITE_ROLES), pengawasanController.createAudit);

// Findings
router.post('/findings', authorize(...PENGAWASAN_AUDIT_WRITE_ROLES), pengawasanController.createFinding);
router.put('/findings/:id', authorize(...PENGAWASAN_AUDIT_WRITE_ROLES), pengawasanController.updateFinding);
router.delete(
  '/findings/:id',
  authorize(...PENGAWASAN_AUDIT_WRITE_ROLES),
  pengawasanController.deleteFinding
);

// Follow-ups (Unit Heads / Responsible Staff can submit follow-ups)
router.post(
  '/follow-ups',
  authorize(...PENGAWASAN_AUDIT_GENERAL_ROLES),
  pengawasanController.createFollowUp
);
router.put(
  '/follow-ups/:id',
  authorize(...PENGAWASAN_AUDIT_GENERAL_ROLES),
  pengawasanController.updateFollowUp
);
router.delete(
  '/follow-ups/:id',
  authorize(...PENGAWASAN_AUDIT_WRITE_ROLES),
  pengawasanController.deleteFollowUp
);

// Single Audit Detail, Update & Delete MUST be placed LAST so /:id doesn't swallow sub-paths
router.get('/:id', authorize(...PENGAWASAN_AUDIT_GENERAL_ROLES), pengawasanController.getAudit);
router.put('/:id', authorize(...PENGAWASAN_AUDIT_WRITE_ROLES), pengawasanController.updateAudit);
router.delete('/:id', authorize(...PENGAWASAN_AUDIT_WRITE_ROLES), pengawasanController.deleteAudit);

export default router;
