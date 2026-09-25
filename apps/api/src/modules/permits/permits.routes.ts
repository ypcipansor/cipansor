import { Router } from 'express';
import {
  PERMIT_DECIDER_ROLE_CODES,
  PERMIT_REQUESTER_ROLE_CODES,
  PERMIT_STAFF_ROLE_CODES,
} from '@cipansor/shared';
import * as controller from './permits.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate, validateQuery } from '../../middleware/error';
import {
  createPermitSchema,
  listPermitsQuerySchema,
  rejectPermitSchema,
  returnPermitSchema,
  updatePermitSchema,
} from './permits.schema';

/**
 * Perizinan. Who may call what is the lists in @cipansor/shared
 * (`schemas/permits.ts`), which the web reads too; which permits each caller
 * sees is `studentScope`, applied in the service. Approve and reject pass the
 * role guard for any teacher, musyrif or unit head; the service then lets
 * through only the learner's own mentor or head (`permits.decider.ts`).
 * Static paths come before `/:id`.
 */
const router = Router();

router.use(authenticate);

const staff = authorize(...PERMIT_STAFF_ROLE_CODES);
const requesters = authorize(...PERMIT_REQUESTER_ROLE_CODES);
const deciders = authorize(...PERMIT_DECIDER_ROLE_CODES);

/**
 * @swagger
 * /api/permits:
 *   get:
 *     summary: List the permits the caller may see
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: studentId, schema: { type: string, format: uuid } }
 *       - { in: query, name: type, schema: { type: string, enum: [PULANG, KELUAR, SAKIT, KELUARGA, OTHER] } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED] } }
 *       - { in: query, name: outside, description: through the gate and not back, schema: { type: boolean } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: awaitingMe, description: pending and the caller's own to decide, oldest first, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: A page of permits }
 *   post:
 *     summary: File a permit (a wali for their own child; staff for a learner in scope)
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { description: Created, PENDING }
 *       409: { description: The learner already has a permit in force at that time }
 */
router.get('/', requesters, validateQuery(listPermitsQuerySchema), controller.list);
router.post('/', requesters, validate(createPermitSchema), controller.create);

/**
 * @swagger
 * /api/permits/summary:
 *   get:
 *     summary: Counts — pending (and how many are the caller's own to decide), approved, outside, overdue
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: PermitSummary }
 * /api/permits/code/{code}:
 *   get:
 *     summary: Look a permit up by the code on the learner's slip (the gate)
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The permit }
 *       404: { description: No such permit in the caller's scope }
 */
router.get('/summary', staff, controller.summary);
router.get('/code/:code', staff, controller.getByCode);

/**
 * @swagger
 * /api/permits/{id}:
 *   get:
 *     summary: One permit
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: The permit }
 *       404: { description: No such permit in the caller's scope }
 *   patch:
 *     summary: Change a permit while it is PENDING
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Updated }
 *       409: { description: Already decided }
 */
router.get('/:id', requesters, controller.getById);
router.patch('/:id', requesters, validate(updatePermitSchema), controller.update);

/**
 * @swagger
 * /api/permits/{id}/approve:
 *   post:
 *     summary: PENDING → APPROVED; excuses the learner's attendance for those days
 *     description: By the learner's musyrif (a boarder) or wali kelas; by the unit head for leave over PERMIT_HEAD_AFTER_DAYS, when no mentor is on record, or as a takeover.
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Approved }
 *       403: { description: Not this learner's mentor or head; the message names who decides }
 *       409: { description: Not PENDING, or changed since it was read }
 * /api/permits/{id}/reject:
 *   post:
 *     summary: PENDING → REJECTED, with the reason
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [rejectionNote], properties: { rejectionNote: { type: string } } }
 *     responses:
 *       200: { description: Rejected }
 *       403: { description: Not this learner's mentor or head }
 *       409: { description: Not PENDING, or changed since it was read }
 * /api/permits/{id}/cancel:
 *   post:
 *     summary: PENDING → CANCELLED (withdrawn by whoever may file it)
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Cancelled }
 *       409: { description: Not PENDING }
 * /api/permits/{id}/depart:
 *   post:
 *     summary: Record leaving through the gate (APPROVED, still valid, not yet departed)
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Departure recorded }
 *       409: { description: Not approved, already used, or expired }
 * /api/permits/{id}/return:
 *   post:
 *     summary: Record coming back → COMPLETED
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Return recorded }
 *       409: { description: Never departed, or already back }
 */
router.post('/:id/approve', deciders, controller.approve);
router.post('/:id/reject', deciders, validate(rejectPermitSchema), controller.reject);
router.post('/:id/cancel', requesters, controller.cancel);
router.post('/:id/depart', staff, controller.depart);
router.post('/:id/return', staff, validate(returnPermitSchema), controller.markReturned);

export default router;
