import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import { GOVERNANCE_ROLE_CODES, PRINCIPAL_ROLE_CODES } from '@cipansor/shared';
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
const GOVERNANCE_SUPERVISOR_ROLES = ['SUPER_ADMIN', 'YAYASAN_PENGAWAS', 'YAYASAN_PEMBINA'];

router.get(
  '/board-suspensions',
  authorize(...GOVERNANCE_SUPERVISOR_ROLES),
  pengawasanController.listBoardSuspensions
);
router.post(
  '/board-suspensions',
  authorize(...GOVERNANCE_SUPERVISOR_ROLES),
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
  authorize('SUPER_ADMIN', 'YAYASAN_PEMBINA'),
  pengawasanController.liftBoardSuspension
);

// 2. Periodic Oversight Report Submission to E-Office (Pengawas & SuperAdmin Only)
router.post(
  '/periodic-reports/submit-eoffice',
  authorize('SUPER_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.submitPeriodicReportToEOffice
);

// 3. WBS Management (Governance + Unit Heads)
const WBS_HANDLER_ROLES = [
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  'SUPER_ADMIN',
  'UNIT_ADMIN',
];

router.get('/wbs/reports', authorize(...WBS_HANDLER_ROLES), pengawasanController.listWbsReports);
router.get(
  '/wbs/reports/:id',
  authorize(...WBS_HANDLER_ROLES),
  pengawasanController.getWbsReportById
);
router.patch(
  '/wbs/reports/:id/status',
  authorize(...WBS_HANDLER_ROLES),
  pengawasanController.updateWbsStatus
);
router.post(
  '/wbs/reports/:id/forward',
  authorize(...WBS_HANDLER_ROLES),
  pengawasanController.forwardWbsReport
);
router.post(
  '/wbs/reports/:id/comments',
  authorize(...WBS_HANDLER_ROLES),
  pengawasanController.addHandlerWbsComment
);

// 4. Financial Arrears Oversight (Governance + Unit Admins/Treasurers)
const FINANCIAL_OVERSIGHT_ROLES = [...GOVERNANCE_ROLE_CODES, 'SUPER_ADMIN', 'UNIT_ADMIN'];

router.get(
  '/financial-arrears',
  authorize(...FINANCIAL_OVERSIGHT_ROLES),
  pengawasanController.getFinancialArrears
);

// 5. Audits, Findings & Follow-ups (Auditors, Unit Admins, Teachers & Staff)
const AUDIT_GENERAL_ROLES = [
  'SUPER_ADMIN',
  'UNIT_ADMIN',
  'TEACHER',
  'STAFF',
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
];

router.get(
  '/suggestions',
  authorize(...AUDIT_GENERAL_ROLES),
  pengawasanController.getAuditSuggestions
);
router.get('/', authorize(...AUDIT_GENERAL_ROLES), pengawasanController.listAudits);
router.post(
  '/',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.createAudit
);

// Findings
router.post(
  '/findings',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.createFinding
);
router.put(
  '/findings/:id',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.updateFinding
);
router.delete(
  '/findings/:id',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.deleteFinding
);

// Follow-ups (Unit Heads / Responsible Staff can submit follow-ups)
router.post('/follow-ups', authorize(...AUDIT_GENERAL_ROLES), pengawasanController.createFollowUp);
router.put(
  '/follow-ups/:id',
  authorize(...AUDIT_GENERAL_ROLES),
  pengawasanController.updateFollowUp
);
router.delete(
  '/follow-ups/:id',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.deleteFollowUp
);

// Single Audit Detail, Update & Delete MUST be placed LAST so /:id doesn't swallow sub-paths
router.get('/:id', authorize(...AUDIT_GENERAL_ROLES), pengawasanController.getAudit);
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.updateAudit
);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'YAYASAN_PENGAWAS'),
  pengawasanController.deleteAudit
);

export default router;
