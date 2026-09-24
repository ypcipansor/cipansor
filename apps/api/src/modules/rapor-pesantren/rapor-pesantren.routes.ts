import { Router } from 'express';
import * as controller from './rapor-pesantren.controller';
import {
  getRaporQuerySchema,
  generateBatchRaporSchema,
  updateRaporSchema,
  raporConfigSchema,
  getLegerQuerySchema,
} from './rapor-pesantren.schema';
import { authenticate, authorize } from '@/middleware/auth';
import { validate } from '@/middleware/validate';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: RaporPesantren
 *   description: Integrated Pesantren Report Card Management
 */

// ==========================================
// STATIC ROUTES (must be before dynamic /:id)
// ==========================================
router.get('/config/:unitId', authenticate, controller.getConfig);
router.put(
  '/config',
  authenticate,
  authorize('SUPER_ADMIN', 'UNIT_ADMIN'),
  validate(raporConfigSchema),
  controller.saveConfig
);
router.post('/generate', authenticate, validate(getRaporQuerySchema), controller.generate);
router.post(
  '/generate-batch',
  authenticate,
  authorize('SUPER_ADMIN', 'UNIT_ADMIN'),
  validate(generateBatchRaporSchema),
  controller.generateBatch
);
router.get(
  '/leger',
  authenticate,
  authorize('SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER'),
  validate(getLegerQuerySchema),
  controller.getLeger
);
router.get('/', authenticate, controller.list);

// ==========================================
// DYNAMIC ROUTES (must be after static routes)
// ==========================================
router.get('/:id', authenticate, controller.getById);
router.put('/:id', authenticate, validate(updateRaporSchema), controller.update);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN', 'UNIT_ADMIN'), controller.remove);

export default router;
