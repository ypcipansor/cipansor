import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { RoleCode, UserRole } from '@prisma/client';
import * as pkController from './pk.controller';
import * as evalController from './evaluation.controller';
import * as analyticsController from './analytics.controller';

const router = Router();

router.use(authenticate);

// Leadership/admin guard for cross-cutting analytics. Legacy 'UNIT_ADMIN'
// covers pre-migration tokens (expanded in middleware/auth.ts).
const leadership = () =>
  authorize(
    RoleCode.SUPER_ADMIN,
    RoleCode.YAYASAN_KETUA,
    RoleCode.YAYASAN_PEMBINA,
    RoleCode.YAYASAN_PENGAWAS,
    RoleCode.YAYASAN_SEKRETARIS,
    RoleCode.YAYASAN_BENDAHARA,
    RoleCode.YAYASAN_ANGGOTA,
    RoleCode.TKQ_ADMIN,
    RoleCode.SDIT_ADMIN,
    RoleCode.SMPIT_ADMIN,
    RoleCode.SMAQ_ADMIN,
    RoleCode.TKQ_KEPALA_SEKOLAH,
    RoleCode.SDIT_KEPALA_SEKOLAH,
    RoleCode.SMPIT_KEPALA_SEKOLAH,
    RoleCode.SMAQ_KEPALA_SEKOLAH,
    RoleCode.PESANTREN_PENGASUH,
    RoleCode.PESANTREN_DIREKTUR,
    RoleCode.PT_REKTOR,
    RoleCode.PT_WAKIL_REKTOR,
    RoleCode.PT_DEKAN,
    RoleCode.PT_KAPRODI,
    'UNIT_ADMIN' // Legacy pre-migration token value
  );

// Dashboards & analytics (leadership only — expose scores across users)
router.get('/dashboard', leadership(), analyticsController.getDashboard);
router.get('/dashboard/drilldown/:unitId', leadership(), analyticsController.getDrilldown);
router.get('/reports/consolidated', leadership(), analyticsController.getConsolidatedReport);

// Supervisors list for creating PK (authenticated users can fetch candidate supervisors)
router.get('/supervisors', pkController.listSupervisors);

// Master data: behavioral values (SAFTI)
router.get('/settings/behavioral-values', evalController.listBehavioralValues);
router.post(
  '/settings/behavioral-values',
  authorize(RoleCode.SUPER_ADMIN),
  evalController.createBehavioralValue
);
router.put(
  '/settings/behavioral-values/:id',
  authorize(RoleCode.SUPER_ADMIN),
  evalController.updateBehavioralValue
);
router.delete(
  '/settings/behavioral-values/:id',
  authorize(RoleCode.SUPER_ADMIN),
  evalController.deleteBehavioralValue
);

// Indicators (ownership enforced in the service layer)
router.post('/indicators', pkController.createIndicator);
router.put('/indicators/:id', pkController.updateIndicator);
router.delete('/indicators/:id', pkController.deleteIndicator);

// Evaluations (ownership enforced in the service layer)
router.post('/evaluations', evalController.createEvaluation);
router.get('/evaluations/:id', evalController.getEvaluation);
router.post('/evaluations/:id/indicators', evalController.updateIndicatorRealization);
router.post('/evaluations/:id/behavior', evalController.updateBehaviorScore);
router.post('/evaluations/:id/approve', evalController.approveEvaluation);

// Performance agreements
router.get('/', pkController.listPKs);
router.post('/', pkController.createPK);
router.get('/:id', pkController.getPK);
router.put('/:id', pkController.updatePK);
router.delete('/:id', pkController.deletePK);
router.post('/:id/propose', pkController.proposePK);
router.post('/:id/approve', pkController.approvePK);
router.post('/:id/reject', pkController.rejectPK);

export default router;
