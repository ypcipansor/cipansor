import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import { RoleCode } from '@prisma/client';
import {
  ADMIN_ROLE_CODES,
  BENDAHARA_ROLE_CODES,
  BUSINESS_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
  PESANTREN_EDUCATOR_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  PT_ACADEMIC_ROLE_CODES,
  PT_STAFF_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
  SUPPORT_ROLE_CODES,
  TATA_USAHA_ROLE_CODES,
  VICE_PRINCIPAL_ROLE_CODES,
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
const GOVERNANCE_SUPERVISOR_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PENGAWAS,
  RoleCode.YAYASAN_PEMBINA,
];

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
  authorize(RoleCode.SUPER_ADMIN, RoleCode.YAYASAN_PEMBINA),
  pengawasanController.liftBoardSuspension
);

// 2. Periodic Oversight Report Submission to E-Office (Pengawas & SuperAdmin Only)
router.post(
  '/periodic-reports/submit-eoffice',
  authorize(RoleCode.SUPER_ADMIN, RoleCode.YAYASAN_PENGAWAS),
  pengawasanController.submitPeriodicReportToEOffice
);

/**
 * Role groups, as RoleCode constants rather than the legacy `UserRole` buckets.
 *
 * `authorize(...)` still expands legacy bucket names, but reading
 * `'UNIT_ADMIN'` / `'TEACHER'` / `'STAFF'` at a call site hides which real
 * role codes are meant — and the deprecated `UserRole` enum is being removed.
 * Each list below is the exact expansion of the bucket it replaces, so
 * reachability does not change.
 */
const UNIT_ADMIN_BUCKET_ROLES = [...GOVERNANCE_ROLE_CODES, ...ADMIN_ROLE_CODES];
const TEACHER_BUCKET_ROLES = [
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...PT_ACADEMIC_ROLE_CODES,
];
const STAFF_BUCKET_ROLES = [
  ...TATA_USAHA_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
  ...PT_STAFF_ROLE_CODES,
  ...SUPPORT_ROLE_CODES,
  ...BUSINESS_ROLE_CODES,
];

// 3. WBS Management (Governance + Unit Heads)
const WBS_HANDLER_ROLES = [
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...UNIT_ADMIN_BUCKET_ROLES,
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
const FINANCIAL_OVERSIGHT_ROLES = [...GOVERNANCE_ROLE_CODES, ...UNIT_ADMIN_BUCKET_ROLES];

router.get(
  '/financial-arrears',
  authorize(...FINANCIAL_OVERSIGHT_ROLES),
  pengawasanController.getFinancialArrears
);

// 5. Audits, Findings & Follow-ups (Auditors, Unit Admins, Teachers & Staff)
const AUDIT_GENERAL_ROLES = [
  ...UNIT_ADMIN_BUCKET_ROLES,
  ...TEACHER_BUCKET_ROLES,
  ...STAFF_BUCKET_ROLES,
];
// Writes are restricted to admins and the Pengawas.
const AUDIT_WRITE_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PENGAWAS,
  ...ADMIN_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
];

router.get(
  '/suggestions',
  authorize(...AUDIT_GENERAL_ROLES),
  pengawasanController.getAuditSuggestions
);
router.get('/', authorize(...AUDIT_GENERAL_ROLES), pengawasanController.listAudits);
router.post('/', authorize(...AUDIT_WRITE_ROLES), pengawasanController.createAudit);

// Findings
router.post('/findings', authorize(...AUDIT_WRITE_ROLES), pengawasanController.createFinding);
router.put('/findings/:id', authorize(...AUDIT_WRITE_ROLES), pengawasanController.updateFinding);
router.delete(
  '/findings/:id',
  authorize(...AUDIT_WRITE_ROLES),
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
  authorize(...AUDIT_WRITE_ROLES),
  pengawasanController.deleteFollowUp
);

// Single Audit Detail, Update & Delete MUST be placed LAST so /:id doesn't swallow sub-paths
router.get('/:id', authorize(...AUDIT_GENERAL_ROLES), pengawasanController.getAudit);
router.put('/:id', authorize(...AUDIT_WRITE_ROLES), pengawasanController.updateAudit);
router.delete('/:id', authorize(...AUDIT_WRITE_ROLES), pengawasanController.deleteAudit);

export default router;
