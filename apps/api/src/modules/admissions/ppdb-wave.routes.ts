import { Router } from 'express';
import waveController from './ppdb-wave.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { RoleCode } from '@prisma/client';
import { onboardRegistrantSchema } from '@cipansor/shared';
import { createWaveSchema, updateWaveSchema, assignWaveSchema } from './ppdb-wave.schema';

const router = Router();

// =====================================
// PUBLIC ROUTES
// =====================================

/**
 * @route GET /api/ppdb-wave/active/:periodId
 * @desc Get active waves for registration period (public)
 * @access Public
 */
router.get('/active/:periodId', waveController.listActive);

// =====================================
// AUTHENTICATED ROUTES
// =====================================

router.use(authenticate);

/**
 * @route GET /api/ppdb-wave
 * @desc Get all waves
 * @access Private - Admin, Staff
 */
router.get(
  '/',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  waveController.list
);

/**
 * @route GET /api/ppdb-wave/stats/:periodId
 * @desc Get wave statistics for period
 * @access Private - Admin, Staff
 */
router.get(
  '/stats/:periodId',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  waveController.getStats
);

/**
 * @route GET /api/ppdb-wave/:id
 * @desc Get wave by ID
 * @access Private - Admin, Staff
 */
router.get(
  '/:id',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  waveController.getById
);

/**
 * @route GET /api/ppdb-wave/:id/registrants
 * @desc Get registrants by wave
 * @access Private - Admin, Staff
 */
router.get(
  '/:id/registrants',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  waveController.getRegistrants
);

/**
 * @route POST /api/ppdb-wave
 * @desc Create new wave
 * @access Private - Admin
 */
router.post(
  '/',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN'),
  validate(createWaveSchema),
  waveController.create
);

/**
 * @route PUT /api/ppdb-wave/:id
 * @desc Update wave
 * @access Private - Admin
 */
router.put(
  '/:id',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN'),
  validate(updateWaveSchema),
  waveController.update
);

/**
 * @route DELETE /api/ppdb-wave/:id
 * @desc Delete wave
 * @access Private - Admin only
 */
router.delete('/:id', authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN'), waveController.delete);

/**
 * @route POST /api/ppdb-wave/assign
 * @desc Assign registrant to wave
 * @access Private - Admin, Staff
 */
router.post(
  '/assign',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  validate(assignWaveSchema),
  waveController.assignRegistrant
);

/**
 * @route POST /api/ppdb-wave/onboard-registrant
 * @desc Execute E2E sequence processing a successful registrant
 * @access Private - Admin, Staff
 */
router.post(
  '/onboard-registrant',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN', 'STAFF'),
  validate(onboardRegistrantSchema),
  waveController.onboardRegistrant
);

/**
 * @route POST /api/ppdb-wave/update-statuses
 * @desc Recompute wave statuses (UPCOMING -> OPEN -> CLOSED / FULL) based on
 *       current dates and registered counts. Intended to be called by a cron
 *       job, but exposed as an admin-triggerable endpoint as well.
 * @access Private - Admin
 */
router.post(
  '/update-statuses',
  authorize(RoleCode.SUPER_ADMIN, 'UNIT_ADMIN'),
  waveController.updateStatuses
);

export default router;
