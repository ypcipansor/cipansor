import { Router } from 'express';
import multer from 'multer';
import {
  ACCREDITATION_PDF_MAX_BYTES,
  ACCREDITATION_READER_ROLE_CODES,
  ACCREDITATION_WRITER_ROLE_CODES,
  createAccreditationSchema,
  updateAccreditationSchema,
} from '@cipansor/shared';
import { authenticate, authorize, isSuperAdmin, isAdmin } from '@/middleware/auth';
import { Errors, validate, validateQuery, validateParams } from '@/middleware/error';
import * as controller from './unit.controller';
import * as accreditation from './unit-accreditation.controller';
import {
  createUnitSchema,
  updateUnitSchema,
  listUnitsQuerySchema,
  unitIdParamSchema,
  accreditationIdParamSchema,
} from './unit.schema';

const router = Router();

// ==================== PUBLIC ====================
// What the public site states of each unit's accreditation, and the
// certificate PDF behind it (decisions/akreditasi-unit.md): the certificate in
// force only. Mounted before `authenticate`, and before `/:id`.
router.get('/public/accreditations', accreditation.publicList);
router.get(
  '/public/accreditations/:accreditationId/certificate',
  validateParams(accreditationIdParamSchema),
  accreditation.publicCertificate
);

// Every other route requires authentication
router.use(authenticate);

/**
 * @swagger
 * /api/units:
 *   get:
 *     summary: List units
 *     description: Get list of all units/lembaga
 *     tags: [Units]
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
 *           default: 10
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [PESANTREN, PAUD, SD_IT, SMP_IT, SMA_QURAN, OTHER]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of units
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Unit'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', validateQuery(listUnitsQuerySchema), controller.list);

/**
 * @swagger
 * /api/units/{id}:
 *   get:
 *     summary: Get unit by ID
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Unit details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', validateParams(unitIdParamSchema), controller.getById);

/**
 * @swagger
 * /api/units:
 *   post:
 *     summary: Create unit (Super Admin only)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Pondok Pesantren Al-Hikmah
 *               type:
 *                 type: string
 *                 enum: [PESANTREN, PAUD, SD_IT, SMP_IT, SMA_QURAN, OTHER]
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               foundationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Unit created successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', isSuperAdmin, validate(createUnitSchema), controller.create);

/**
 * @swagger
 * /api/units/{id}:
 *   put:
 *     summary: Update unit (Admin only)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PESANTREN, PAUD, SD_IT, SMP_IT, SMA_QURAN, OTHER]
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unit updated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:id',
  isAdmin,
  validateParams(unitIdParamSchema),
  validate(updateUnitSchema),
  controller.update
);

/**
 * @swagger
 * /api/units/{id}:
 *   delete:
 *     summary: Delete unit (Super Admin only)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Unit deleted
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.delete('/:id', isSuperAdmin, validateParams(unitIdParamSchema), controller.remove);

// ==================== ACCREDITATION ====================
// A unit's accreditation certificates (decisions/akreditasi-unit.md). The route
// guard admits the roles that read or keep them; which unit each may touch is
// the service's check (their own unit, or every unit for the Super Admin and
// the yayasan's organs).

const readers = authorize(...ACCREDITATION_READER_ROLE_CODES);
const writers = authorize(...ACCREDITATION_WRITER_ROLE_CODES);

/** The certificate PDF, held in memory until it is stored in the database. */
const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ACCREDITATION_PDF_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(Errors.badRequest('Berkas sertifikat harus PDF'));
    }
  },
}).single('certificate');

/**
 * @swagger
 * /api/units/{id}/accreditations:
 *   get:
 *     summary: The unit's accreditation certificates, newest first
 *     description: The unit's admin and kepala sekolah read their own unit's; the Super Admin and the yayasan's organs every unit's.
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: UnitAccreditationList }
 *       404: { description: No such unit, or not the caller's }
 *   post:
 *     summary: Record a certificate, with its PDF (multipart, file in `certificate`)
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { description: Recorded }
 *       400: { description: Missing or invalid fields, or the file is not a PDF }
 *       403: { description: Not the unit's admin or the Super Admin }
 */
router.get('/:id/accreditations', readers, validateParams(unitIdParamSchema), accreditation.list);
router.post(
  '/:id/accreditations',
  writers,
  validateParams(unitIdParamSchema),
  certificateUpload,
  validate(createAccreditationSchema),
  accreditation.create
);

/**
 * @swagger
 * /api/units/{id}/accreditations/{accreditationId}:
 *   patch:
 *     summary: Correct a certificate's record; the PDF may be replaced
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Corrected }
 *   delete:
 *     summary: Delete a record entered by mistake
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Deleted }
 * /api/units/{id}/accreditations/{accreditationId}/certificate:
 *   get:
 *     summary: The certificate PDF
 *     tags: [Units]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: application/pdf }
 */
router.patch(
  '/:id/accreditations/:accreditationId',
  writers,
  certificateUpload,
  validate(updateAccreditationSchema),
  accreditation.update
);
router.delete('/:id/accreditations/:accreditationId', writers, accreditation.remove);
router.get('/:id/accreditations/:accreditationId/certificate', readers, accreditation.certificate);

export default router;
