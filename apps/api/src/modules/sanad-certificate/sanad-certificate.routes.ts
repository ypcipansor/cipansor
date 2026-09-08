import { Router, type IRouter } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { validate, validateQuery } from '@/middleware/validate';
import { UserRole } from '@prisma/client';
import * as controller from './sanad-certificate.controller';
import { requireTurnstile } from '@/middleware/turnstile';
import {
  listSanadQuerySchema,
  createSanadSchema,
  updateSanadSchema,
  generateCertificateSchema,
  verifyCertificateSchema,
  bulkCreateSanadSchema,
} from './sanad-certificate.schema';

const router: IRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     SanadRecord:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         enrollmentId:
 *           type: string
 *         teacherId:
 *           type: string
 *         juz:
 *           type: integer
 *         grade:
 *           type: string
 *           enum: [MUMTAZ, JAYYID_JIDDAN, JAYYID, MAQBUL]
 *         certifiedAt:
 *           type: string
 *           format: date-time
 *     CertificateData:
 *       type: object
 *       properties:
 *         certificateNumber:
 *           type: string
 *         verificationCode:
 *           type: string
 *         studentName:
 *           type: string
 *         juz:
 *           type: integer
 *         grade:
 *           type: string
 */

/**
 * @openapi
 * /api/sanad:
 *   get:
 *     summary: List sanad records
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: teacherId
 *         schema:
 *           type: string
 *       - in: query
 *         name: juz
 *         schema:
 *           type: integer
 *       - in: query
 *         name: grade
 *         schema:
 *           type: string
 *           enum: [MUMTAZ, JAYYID_JIDDAN, JAYYID, MAQBUL]
 *     responses:
 *       200:
 *         description: List of sanad records
 */
router.get('/', authenticate, validateQuery(listSanadQuerySchema), controller.listSanadRecords);

/**
 * @openapi
 * /api/sanad/students/{studentId}/summary:
 *   get:
 *     summary: Get student sanad summary
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student sanad summary with progress
 */
router.get('/students/:studentId/summary', authenticate, controller.getStudentSanadSummary);

/**
 * @openapi
 * /api/sanad/verify:
 *   post:
 *     summary: Verify a certificate (public endpoint)
 *     tags: [Sanad Certificate]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - certificateNumber
 *             properties:
 *               certificateNumber:
 *                 type: string
 *               verificationCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Certificate verification result
 */
// Verifikasi sanad publik, sebangun dengan /esign/verify-pdf yang sudah
// dijaga. Tanpa gerbang ini ia menjadi oracle yang dapat disapu berulang.
router.post(
  '/verify',
  requireTurnstile('verify-sanad'),
  validate(verifyCertificateSchema),
  controller.verifyCertificate
);

/**
 * @openapi
 * /api/sanad/bulk:
 *   post:
 *     summary: Bulk create sanad records
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               records:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SanadRecord'
 *     responses:
 *       201:
 *         description: Bulk creation result
 */
router.post(
  '/bulk',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validate(bulkCreateSanadSchema),
  controller.bulkCreateSanadRecords
);

/**
 * @openapi
 * /api/sanad/certificate:
 *   post:
 *     summary: Generate certificate data
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sanadId
 *             properties:
 *               sanadId:
 *                 type: string
 *               templateType:
 *                 type: string
 *                 enum: [STANDARD, FORMAL, DECORATIVE]
 *               includeQRCode:
 *                 type: boolean
 *               signedBy:
 *                 type: string
 *               signedByTitle:
 *                 type: string
 *     responses:
 *       200:
 *         description: Certificate data generated
 */
router.post(
  '/certificate',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validate(generateCertificateSchema),
  controller.generateCertificate
);

/**
 * @openapi
 * /api/sanad/{id}/certificate:
 *   get:
 *     summary: Get certificate PDF (HTML) for a sanad record
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *           enum: [STANDARD, FORMAL, DECORATIVE]
 *       - in: query
 *         name: qr
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: signedBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: signedByTitle
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate HTML for printing
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/:id/certificate', authenticate, controller.getCertificatePdf);

/**
 * @openapi
 * /api/sanad/tree:
 *   get:
 *     summary: Get the sanad transmission tree (silsilah)
 *     description: Teacher-to-student certification hierarchy built from sanad records.
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Forest of sanad tree roots
 */
// NOTE: must stay registered before '/:id' so 'tree' is not captured as an id
router.get('/tree', authenticate, controller.getSanadTree);

/**
 * @openapi
 * /api/sanad/{id}:
 *   get:
 *     summary: Get sanad record by ID
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sanad record details
 */
router.get('/:id', authenticate, controller.getSanadById);

/**
 * @openapi
 * /api/sanad:
 *   post:
 *     summary: Create a new sanad record
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enrollmentId
 *               - teacherId
 *               - juz
 *               - grade
 *             properties:
 *               enrollmentId:
 *                 type: string
 *               teacherId:
 *                 type: string
 *               juz:
 *                 type: integer
 *               surahStart:
 *                 type: integer
 *               surahEnd:
 *                 type: integer
 *               grade:
 *                 type: string
 *                 enum: [MUMTAZ, JAYYID_JIDDAN, JAYYID, MAQBUL]
 *               certifiedAt:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sanad record created
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validate(createSanadSchema),
  controller.createSanadRecord
);

/**
 * @openapi
 * /api/sanad/{id}:
 *   put:
 *     summary: Update a sanad record
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teacherId:
 *                 type: string
 *               surahStart:
 *                 type: integer
 *               surahEnd:
 *                 type: integer
 *               grade:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sanad record updated
 */
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validate(updateSanadSchema),
  controller.updateSanadRecord
);

/**
 * @openapi
 * /api/sanad/{id}:
 *   delete:
 *     summary: Delete a sanad record
 *     tags: [Sanad Certificate]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sanad record deleted
 */
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteSanadRecord
);

export { router as sanadCertificateRouter };
