import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as controller from './tatalaksana.controller';

const router = Router();

router.get('/', authenticate, controller.getSOPs);
router.get('/summary', authenticate, controller.getSOPSummary);
router.get('/:id', authenticate, controller.getSOP);
router.post(
  '/',
  authenticate,
  authorize('UNIT_ADMIN', 'SUPER_ADMIN', 'STAFF'),
  controller.createSOP
);
router.put(
  '/:id',
  authenticate,
  authorize('UNIT_ADMIN', 'SUPER_ADMIN', 'STAFF'),
  controller.updateSOP
);
router.post(
  '/:id/approve',
  authenticate,
  authorize('UNIT_ADMIN', 'SUPER_ADMIN'),
  controller.approveSOP
);
router.post(
  '/:id/activate',
  authenticate,
  authorize('UNIT_ADMIN', 'SUPER_ADMIN'),
  controller.activateSOP
);
router.post(
  '/revisions',
  authenticate,
  authorize('UNIT_ADMIN', 'SUPER_ADMIN', 'STAFF'),
  controller.createRevision
);
router.delete('/:id', authenticate, authorize('UNIT_ADMIN', 'SUPER_ADMIN'), controller.deleteSOP);

export default router;
