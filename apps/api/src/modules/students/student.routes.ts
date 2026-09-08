import { Router } from 'express';
import { authenticate, hasPermission } from '@/middleware/auth';
import { validate, validateQuery, validateParams } from '@/middleware/error';
import * as controller from './student.controller';
import { IdCardController } from './id-card.controller';
import { PERMISSIONS } from '../roles/permissions';
import {
  createStudentSchema,
  updateStudentSchema,
  listStudentsQuerySchema,
  studentIdParamSchema,
} from './student.schema';

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * @swagger
 * /api/students/id-cards/verify:
 *   post:
 *     summary: Verify QR code from ID card
 *     tags: [Students - ID Card]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qrData
 *             properties:
 *               qrData:
 *                 type: string
 *                 description: QR code data string
 *     responses:
 *       200:
 *         description: Verification result with student data
 */
router.post('/id-cards/verify', IdCardController.verifyQRCode); // Publicly accessible for verification (e.g. security guards)

/**
 * @swagger
 * /api/students/id-cards/verify:
 *   get:
 *     summary: Verify QR code via URL (for direct scan)
 *     tags: [Students - ID Card]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: QR code data (URL encoded)
 *     responses:
 *       200:
 *         description: Verification result
 */
router.get('/id-cards/verify', IdCardController.verifyQRCodeGet); // Publicly accessible for verification (e.g. security guards)

// ==================== AUTHENTICATED ROUTES ====================

// All subsequent routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/students:
 *   get:
 *     summary: List students
 *     description: Get paginated list of students
 *     tags: [Students]
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
 *         name: unitId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [MALE, FEMALE]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or NIS
 *     responses:
 *       200:
 *         description: List of students
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
 *                     $ref: '#/components/schemas/Student'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateQuery(listStudentsQuerySchema),
  controller.list
);

// ==================== ID CARD ROUTES ====================

/**
 * @swagger
 * /api/students/id-cards/templates:
 *   get:
 *     summary: Get available ID card templates
 *     tags: [Students - ID Card]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available templates
 */
router.get(
  '/id-cards/templates',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.getTemplates
);

router.post(
  '/id-cards/bulk-regenerate',
  hasPermission(PERMISSIONS.STUDENT_UPDATE),
  IdCardController.bulkRegenerateCards
);

/**
 * @swagger
 * /api/students/id-cards/stats/{unitId}:
 *   get:
 *     summary: Get ID card statistics for a unit
 *     tags: [Students - ID Card]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: unitId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Card statistics
 */
router.get(
  '/id-cards/stats/:unitId',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.getStatistics
);

/**
 * @swagger
 * /api/students/id-cards/classes/{classId}:
 *   get:
 *     summary: Generate bulk ID cards for a class
 *     tags: [Students - ID Card]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *           enum: [STANDARD, PESANTREN, TAHFIDZ, MINIMAL]
 *       - in: query
 *         name: showTahfidz
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Bulk ID cards data
 */
router.get(
  '/id-cards/classes/:classId',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.generateClassCards
);

/**
 * @swagger
 * /api/students/{studentId}/id-card:
 *   get:
 *     summary: Generate ID card for a student
 *     tags: [Students - ID Card]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *           enum: [STANDARD, PESANTREN, TAHFIDZ, MINIMAL]
 *       - in: query
 *         name: orientation
 *         schema:
 *           type: string
 *           enum: [PORTRAIT, LANDSCAPE]
 *       - in: query
 *         name: showTahfidz
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: validityPeriod
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Validity period in months
 *     responses:
 *       200:
 *         description: ID card data with QR code
 */
router.get(
  '/:studentId/id-card',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  IdCardController.generateStudentCard
);

/**
 * @swagger
 * /api/students/{id}:
 *   get:
 *     summary: Get student by ID
 *     tags: [Students]
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
 *         description: Student details with user and class info
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateParams(studentIdParamSchema),
  controller.getById
);

/**
 * @swagger
 * /api/students/{id}/complete-profile:
 *   get:
 *     summary: Get complete student profile (Student 360 view)
 *     description: Aggregated academic/attendance/behavior summaries with enrollments and parents. Counseling and medical details are intentionally excluded — use their dedicated permission-guarded endpoints.
 *     tags: [Students]
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
 *         description: Holistic student profile summary
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id/complete-profile',
  hasPermission(PERMISSIONS.STUDENT_VIEW),
  validateParams(studentIdParamSchema),
  controller.getCompleteProfile
);

/**
 * @swagger
 * /api/students:
 *   post:
 *     summary: Create student (Admin only)
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, unitId, nis, gender, birthPlace, birthDate, address, parentName, parentPhone]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               unitId:
 *                 type: string
 *                 format: uuid
 *               nis:
 *                 type: string
 *                 example: "2024001"
 *               nisn:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE]
 *               birthPlace:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               parentName:
 *                 type: string
 *               parentPhone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Student created
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/',
  hasPermission(PERMISSIONS.STUDENT_CREATE),
  validate(createStudentSchema),
  controller.create
);

/**
 * @swagger
 * /api/students/{id}:
 *   put:
 *     summary: Update student (Admin only)
 *     tags: [Students]
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
 *               nis:
 *                 type: string
 *               nisn:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE]
 *               birthPlace:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               parentName:
 *                 type: string
 *               parentPhone:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Student updated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_UPDATE),
  validateParams(studentIdParamSchema),
  validate(updateStudentSchema),
  controller.update
);

/**
 * @swagger
 * /api/students/{id}:
 *   delete:
 *     summary: Delete student (Admin only)
 *     tags: [Students]
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
 *         description: Student deleted
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.delete(
  '/:id',
  hasPermission(PERMISSIONS.STUDENT_DELETE),
  validateParams(studentIdParamSchema),
  controller.remove
);

export default router;
