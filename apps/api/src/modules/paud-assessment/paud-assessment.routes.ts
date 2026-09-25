import { Router } from 'express';
import { authenticate, isStaffMember, isTeacherOrAbove } from '@/middleware/auth';
import { validate, validateQuery } from '@/middleware/validate';
import * as controller from './paud-assessment.controller';
import {
  listIndicatorsQuerySchema,
  createIndicatorSchema,
  updateIndicatorSchema,
  listAssessmentsQuerySchema,
  createAssessmentSchema,
  updateAssessmentSchema,
  bulkCreateAssessmentSchema,
  bulkCreateClassAssessmentSchema,
  createEvidenceSchema,
  listNarrativeReportsQuerySchema,
  createNarrativeReportSchema,
  updateNarrativeReportSchema,
  finalizeReportSchema,
  assessmentSummaryQuerySchema,
  classSummaryQuerySchema,
} from './paud-assessment.schema';
import { handleSingleUpload } from '../../middleware/upload';

const router = Router();

// All routes require authentication
router.use(authenticate);

// PAUD assessments, narrative reports and their photo evidence are the TK
// teachers' work; every page that reads them is a staff page (/tk/...). Until
// 2026-09-25 any signed-in account could create, edit and delete them and
// upload files. Checked here, ahead of the upload middleware, so a refused
// request never reaches it.
router.use((req, res, next) =>
  req.method === 'GET' ? isStaffMember(req, res, next) : isTeacherOrAbove(req, res, next)
);

/**
 * @swagger
 * /api/paud-assessment/evidences:
 *   post:
 *     summary: Create evidence for an assessment
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - assessmentId
 *               - file
 *             properties:
 *               assessmentId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *     responses:
 *       201:
 *         description: Evidence created
 */
router.post(
  '/evidences',
  handleSingleUpload('file'),
  validate(createEvidenceSchema),
  controller.createEvidence
);

// ============================================
// INDICATOR ROUTES
// ============================================

/**
 * @swagger
 * /api/paud-assessment/indicators:
 *   get:
 *     summary: List PAUD development indicators
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: aspect
 *         schema:
 *           type: string
 *           enum: [NAM, FM, KOG, BHS, SE, SNI]
 *         description: Filter by development aspect
 *       - in: query
 *         name: ageGroup
 *         schema:
 *           type: string
 *         description: Filter by age group (e.g., "4-5", "5-6")
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *         description: Filter by unit
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
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
 *     responses:
 *       200:
 *         description: List of indicators
 */
router.get('/indicators', validateQuery(listIndicatorsQuerySchema), controller.listIndicators);

/**
 * @swagger
 * /api/paud-assessment/indicators/{id}:
 *   get:
 *     summary: Get indicator by ID
 *     tags: [PAUD Assessment]
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
 *         description: Indicator details
 *       404:
 *         description: Indicator not found
 */
router.get('/indicators/:id', controller.getIndicatorById);

/**
 * @swagger
 * /api/paud-assessment/indicators:
 *   post:
 *     summary: Create a new indicator
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - unitId
 *               - aspect
 *               - code
 *               - description
 *               - ageGroup
 *             properties:
 *               unitId:
 *                 type: string
 *               aspect:
 *                 type: string
 *                 enum: [NAM, FM, KOG, BHS, SE, SNI]
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *               ageGroup:
 *                 type: string
 *               subIndicators:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Indicator created
 */
router.post('/indicators', validate(createIndicatorSchema), controller.createIndicator);

/**
 * @swagger
 * /api/paud-assessment/indicators/{id}:
 *   put:
 *     summary: Update indicator
 *     tags: [PAUD Assessment]
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
 *               description:
 *                 type: string
 *               subIndicators:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Indicator updated
 */
router.put('/indicators/:id', validate(updateIndicatorSchema), controller.updateIndicator);

/**
 * @swagger
 * /api/paud-assessment/indicators/{id}:
 *   delete:
 *     summary: Delete indicator
 *     tags: [PAUD Assessment]
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
 *         description: Indicator deleted
 */
router.delete('/indicators/:id', controller.deleteIndicator);

// ============================================
// ASSESSMENT ROUTES
// ============================================

/**
 * @swagger
 * /api/paud-assessment/assessments:
 *   get:
 *     summary: List assessments
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: indicatorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *       - in: query
 *         name: aspect
 *         schema:
 *           type: string
 *           enum: [NAM, FM, KOG, BHS, SE, SNI]
 *       - in: query
 *         name: achievementLevel
 *         schema:
 *           type: string
 *           enum: [BB, MB, BSH, BSB]
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of assessments
 */
router.get('/assessments', validateQuery(listAssessmentsQuerySchema), controller.listAssessments);

/**
 * @swagger
 * /api/paud-assessment/assessments/class:
 *   post:
 *     summary: Bulk create assessments for a class (single indicator)
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - unitId
 *               - academicYearId
 *               - aspect
 *               - assessments
 *             properties:
 *               classId:
 *                 type: string
 *               unitId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               semester:
 *                 type: string
 *                 enum: ["GANJIL", "GENAP"]
 *               periodType:
 *                 type: string
 *                 enum: ["HARIAN", "MINGGUAN", "BULANAN", "SEMESTER"]
 *               periodDate:
 *                 type: string
 *                 format: date
 *               aspect:
 *                 type: string
 *                 enum: [NAM, FM, KOG, BHS, SE, SNI]
 *               indicatorId:
 *                 type: string
 *               assessments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - studentId
 *                     - achievementLevel
 *                   properties:
 *                     studentId:
 *                       type: string
 *                     achievementLevel:
 *                       type: string
 *                       enum: [BB, MB, BSH, BSB]
 *                     narrativeText:
 *                       type: string
 *                     teacherNotes:
 *                       type: string
 *                     recommendations:
 *                       type: string
 *     responses:
 *       201:
 *         description: Assessments created
 */
router.post(
  '/assessments/class',
  validate(bulkCreateClassAssessmentSchema),
  controller.createClassAssessment
);

/**
 * @openapi
 * /api/paud-assessment/assessments/{id}:
 *   get:
 *     summary: Get assessment by ID
 *     tags: [PAUD Assessment]
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
 *         description: Assessment details
 */
router.get('/assessments/:id', controller.getAssessmentById);

/**
 * @swagger
 * /api/paud-assessment/assessments:
 *   post:
 *     summary: Create assessment
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - indicatorId
 *               - academicYearId
 *               - achievementLevel
 *               - assessmentDate
 *             properties:
 *               studentId:
 *                 type: string
 *               indicatorId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               semester:
 *                 type: string
 *                 enum: ["1", "2"]
 *               achievementLevel:
 *                 type: string
 *                 enum: [BB, MB, BSH, BSB]
 *               assessmentDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Assessment created
 */
router.post('/assessments', validate(createAssessmentSchema), controller.createAssessment);

/**
 * @swagger
 * /api/paud-assessment/assessments/bulk:
 *   post:
 *     summary: Bulk create assessments
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - academicYearId
 *               - assessmentDate
 *               - assessments
 *             properties:
 *               studentId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               semester:
 *                 type: string
 *               assessmentDate:
 *                 type: string
 *                 format: date
 *               assessments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     indicatorId:
 *                       type: string
 *                     achievementLevel:
 *                       type: string
 *                     notes:
 *                       type: string
 *     responses:
 *       201:
 *         description: Assessments created
 */
router.post(
  '/assessments/bulk',
  validate(bulkCreateAssessmentSchema),
  controller.bulkCreateAssessments
);

/**
 * @swagger
 * /api/paud-assessment/assessments/{id}:
 *   put:
 *     summary: Update assessment
 *     tags: [PAUD Assessment]
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
 *               achievementLevel:
 *                 type: string
 *                 enum: [BB, MB, BSH, BSB]
 *               notes:
 *                 type: string
 *               assessmentDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Assessment updated
 */
router.put('/assessments/:id', validate(updateAssessmentSchema), controller.updateAssessment);

/**
 * @swagger
 * /api/paud-assessment/assessments/{id}:
 *   delete:
 *     summary: Delete assessment
 *     tags: [PAUD Assessment]
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
 *         description: Assessment deleted
 */
router.delete('/assessments/:id', controller.deleteAssessment);

// ============================================
// EVIDENCE ROUTES
// ============================================

/**
 * @swagger
 * /api/paud-assessment/evidences/{id}:
 *   delete:
 *     summary: Delete evidence
 *     tags: [PAUD Assessment]
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
 *         description: Evidence deleted
 */
router.delete('/evidences/:id', controller.deleteEvidence);

// ============================================
// NARRATIVE REPORT ROUTES
// ============================================

/**
 * @swagger
 * /api/paud-assessment/reports:
 *   get:
 *     summary: List narrative reports
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [MONTHLY, QUARTERLY, SEMESTER, ANNUAL]
 *       - in: query
 *         name: isFinalized
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of narrative reports
 */
router.get(
  '/reports',
  validateQuery(listNarrativeReportsQuerySchema),
  controller.listNarrativeReports
);

/**
 * @swagger
 * /api/paud-assessment/reports/{id}:
 *   get:
 *     summary: Get narrative report by ID
 *     tags: [PAUD Assessment]
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
 *         description: Narrative report details
 */
router.get('/reports/:id', controller.getNarrativeReportById);

/**
 * @swagger
 * /api/paud-assessment/reports:
 *   post:
 *     summary: Create narrative report
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - academicYearId
 *               - period
 *               - periodNumber
 *             properties:
 *               studentId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               period:
 *                 type: string
 *                 enum: [MONTHLY, QUARTERLY, SEMESTER, ANNUAL]
 *               periodNumber:
 *                 type: integer
 *               namNarrative:
 *                 type: string
 *               fmNarrative:
 *                 type: string
 *               kogNarrative:
 *                 type: string
 *               bhsNarrative:
 *                 type: string
 *               seNarrative:
 *                 type: string
 *               sniNarrative:
 *                 type: string
 *               generalObservation:
 *                 type: string
 *               recommendation:
 *                 type: string
 *     responses:
 *       201:
 *         description: Narrative report created
 */
router.post('/reports', validate(createNarrativeReportSchema), controller.createNarrativeReport);

/**
 * @swagger
 * /api/paud-assessment/reports/{id}:
 *   put:
 *     summary: Update narrative report
 *     tags: [PAUD Assessment]
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
 *               namNarrative:
 *                 type: string
 *               fmNarrative:
 *                 type: string
 *               kogNarrative:
 *                 type: string
 *               bhsNarrative:
 *                 type: string
 *               seNarrative:
 *                 type: string
 *               sniNarrative:
 *                 type: string
 *               generalObservation:
 *                 type: string
 *               recommendation:
 *                 type: string
 *     responses:
 *       200:
 *         description: Narrative report updated
 */
router.put('/reports/:id', validate(updateNarrativeReportSchema), controller.updateNarrativeReport);

/**
 * @swagger
 * /api/paud-assessment/reports/{id}/finalize:
 *   post:
 *     summary: Finalize narrative report
 *     tags: [PAUD Assessment]
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
 *             required:
 *               - principalSignature
 *             properties:
 *               principalSignature:
 *                 type: string
 *               teacherSignature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Narrative report finalized
 */
router.post(
  '/reports/:id/finalize',
  validate(finalizeReportSchema),
  controller.finalizeNarrativeReport
);

/**
 * @swagger
 * /api/paud-assessment/reports/{id}:
 *   delete:
 *     summary: Delete narrative report
 *     tags: [PAUD Assessment]
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
 *         description: Narrative report deleted
 */
router.delete('/reports/:id', controller.deleteNarrativeReport);

// ============================================
// SUMMARY ROUTES
// ============================================

/**
 * @swagger
 * /api/paud-assessment/summary/student:
 *   get:
 *     summary: Get student assessment summary
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student assessment summary by aspect
 */
router.get(
  '/summary/student',
  validateQuery(assessmentSummaryQuerySchema),
  controller.getStudentSummary
);

/**
 * @swagger
 * /api/paud-assessment/summary/class:
 *   get:
 *     summary: Get class/unit summary
 *     tags: [PAUD Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Class summary statistics
 */
router.get('/summary/class', validateQuery(classSummaryQuerySchema), controller.getClassSummary);

export default router;
