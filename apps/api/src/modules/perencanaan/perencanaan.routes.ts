import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import * as perencanaanController from './perencanaan.controller';

const router = Router();

router.use(authenticate);
router.use(
  authorize(
    UserRole.SUPER_ADMIN,
    UserRole.UNIT_ADMIN,
    UserRole.TEACHER,
    UserRole.STAFF
  )
);

// Strategic Plans
router.get('/', perencanaanController.listPlans);
router.post('/', perencanaanController.createPlan);
router.get('/:id', perencanaanController.getPlan);
router.get('/:id/realization-trend', perencanaanController.getPlanRealizationTrend);
router.put('/:id', perencanaanController.updatePlan);
router.post('/:id/approve', perencanaanController.approvePlan);

// Pengesahan dokumen tingkat yayasan (RPJP, Renstra, RKA Yayasan):
// Ketua Pengurus mengajukan → Pengawas mengirim hasil reviu → Ketua Pengurus
// menanggapi dan mengajukan → Pembina menetapkan atau mengembalikan.
router.post('/:id/review/submit', perencanaanController.submitForReview);
router.post('/:id/review/result', perencanaanController.submitReviewResult);
router.post('/:id/review/propose', perencanaanController.proposeToPembina);
router.post('/:id/review/decide', perencanaanController.decidePlan);
router.delete('/:id', perencanaanController.deletePlan);

// Collaboration (draft co-editing)
router.post('/:id/collaborators', perencanaanController.addCollaborator);
router.delete('/:id/collaborators/:userId', perencanaanController.removeCollaborator);

// Objectives
router.post('/objectives', perencanaanController.createObjective);
router.put('/objectives/:id', perencanaanController.updateObjective);
router.delete('/objectives/:id', perencanaanController.deleteObjective);

// Indicators
router.post('/indicators', perencanaanController.createIndicator);
router.put('/indicators/:id', perencanaanController.updateIndicator);
router.delete('/indicators/:id', perencanaanController.deleteIndicator);

// Activities
router.post('/activities', perencanaanController.createActivity);
router.put('/activities/:id', perencanaanController.updateActivity);
router.delete('/activities/:id', perencanaanController.deleteActivity);

export default router;
