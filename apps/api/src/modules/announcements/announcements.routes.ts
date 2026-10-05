import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import * as controller from './announcements.controller';

/**
 * Pengumuman — the one way to broadcast (decisions/siaran-pengumuman.md).
 *
 * Every signed-in account reads its own board here. Who may publish, revise
 * or withdraw is decided per announcement by `announcements.access.ts` (a
 * relation: a guru's classes, a musyrif's santri, a unit's head/TU/admin, the
 * yayasan's organs), not by a bucket, so the routes carry no `authorize`.
 * Static paths first (`utils/route-shadowing.guard.test.ts`).
 */
const router = Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/stats', controller.getStats);
router.get('/recent', controller.getRecent);
router.get('/compose', controller.getComposeOptions);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.post('/:id/withdraw', controller.withdraw);

export default router;
