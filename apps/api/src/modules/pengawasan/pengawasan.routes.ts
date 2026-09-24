import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import * as pengawasanController from './pengawasan.controller';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF));

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

export default router;
