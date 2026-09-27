import { Router } from 'express';
import {
  DAILY_REPORT_CONFIRMER_ROLE_CODES,
  DAILY_REPORT_READER_ROLE_CODES,
  DAILY_REPORT_STAFF_ROLE_CODES,
} from '@cipansor/shared';
import { authenticate, authorize } from '@/middleware/auth';
import { validate, validateQuery } from '@/middleware/validate';
import * as controller from './daily-report.controller';
import {
  listDailyReportsQuerySchema,
  createDailyReportSchema,
  updateDailyReportSchema,
  confirmDailyReportSchema,
  bulkCreateDailyReportsSchema,
  studentDailySummaryQuerySchema,
  classDailySummaryQuerySchema,
} from './daily-report.schema';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Staff write and read; a wali reads and acknowledges their own child's. Which
// rows each reaches is `studentScope`, in the service.
const staff = authorize(...DAILY_REPORT_STAFF_ROLE_CODES);
const readers = authorize(...DAILY_REPORT_READER_ROLE_CODES);
const confirmers = authorize(...DAILY_REPORT_CONFIRMER_ROLE_CODES);

// ============================================
// DAILY REPORT ROUTES
// ============================================

/**
 * @swagger
 * /api/daily-report:
 *   get:
 *     summary: List daily reports
 *     tags: [Daily Report]
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
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
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
 *         name: mood
 *         schema:
 *           type: string
 *           enum: [HAPPY, NEUTRAL, SAD, SICK, TIRED, EXCITED]
 *       - in: query
 *         name: isConfirmedByParent
 *         schema:
 *           type: boolean
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
 *         description: List of daily reports
 */
router.get('/', readers, validateQuery(listDailyReportsQuerySchema), controller.listDailyReports);

/**
 * @swagger
 * /api/daily-report/summary/student:
 *   get:
 *     summary: Get student monthly summary
 *     tags: [Daily Report]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Student monthly summary
 */
router.get(
  '/summary/student',
  readers,
  validateQuery(studentDailySummaryQuerySchema),
  controller.getStudentMonthlySummary
);

/**
 * @swagger
 * /api/daily-report/summary/class:
 *   get:
 *     summary: Get class daily summary
 *     tags: [Daily Report]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         description: Ignored for an account bound to a unit.
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Class daily summary
 */
router.get(
  '/summary/class',
  staff,
  validateQuery(classDailySummaryQuerySchema),
  controller.getClassDailySummary
);

/**
 * @swagger
 * /api/daily-report/{id}:
 *   get:
 *     summary: Get daily report by ID
 *     tags: [Daily Report]
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
 *         description: Daily report details
 *       404:
 *         description: Report not found
 */
router.get('/:id', readers, controller.getDailyReportById);

/**
 * @swagger
 * /api/daily-report:
 *   post:
 *     summary: Create daily report
 *     tags: [Daily Report]
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
 *               - reportDate
 *             properties:
 *               studentId:
 *                 type: string
 *               reportDate:
 *                 type: string
 *                 format: date
 *               morningMood:
 *                 type: string
 *                 enum: [HAPPY, NEUTRAL, SAD, SICK, TIRED, EXCITED]
 *               afternoonMood:
 *                 type: string
 *                 enum: [HAPPY, NEUTRAL, SAD, SICK, TIRED, EXCITED]
 *               healthNotes:
 *                 type: string
 *               breakfastConsumption:
 *                 type: string
 *                 enum: [HABIS, SETENGAH, SEDIKIT, TIDAK_MAU]
 *               lunchConsumption:
 *                 type: string
 *                 enum: [HABIS, SETENGAH, SEDIKIT, TIDAK_MAU]
 *               activitiesSummary:
 *                 type: string
 *               surahPractice:
 *                 type: string
 *               arrivalTime:
 *                 type: string
 *                 description: Time of day in WIB, "HH:mm".
 *               parentNotes:
 *                 type: string
 *               photos:
 *                 type: array
 *                 maxItems: 5
 *                 description: Files stored through POST /upload.
 *                 items:
 *                   type: object
 *                   required: [url]
 *                   properties:
 *                     url:
 *                       type: string
 *                     caption:
 *                       type: string
 *     responses:
 *       201:
 *         description: Daily report created
 *       404:
 *         description: The pupil is not in the caller's scope
 *       409:
 *         description: The pupil already has a report that day
 */
router.post('/', staff, validate(createDailyReportSchema), controller.createDailyReport);

/**
 * @swagger
 * /api/daily-report/bulk:
 *   post:
 *     summary: Bulk create daily reports for a class
 *     tags: [Daily Report]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportDate
 *               - reports
 *             properties:
 *               reportDate:
 *                 type: string
 *                 format: date
 *               reports:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     studentId:
 *                       type: string
 *                     morningMood:
 *                       type: string
 *                     afternoonMood:
 *                       type: string
 *                     activitiesSummary:
 *                       type: string
 *     responses:
 *       201:
 *         description: Daily reports created
 */
router.post(
  '/bulk',
  staff,
  validate(bulkCreateDailyReportsSchema),
  controller.bulkCreateDailyReports
);

/**
 * @swagger
 * /api/daily-report/{id}:
 *   put:
 *     summary: Update daily report
 *     tags: [Daily Report]
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
 *               morningMood:
 *                 type: string
 *               activitiesSummary:
 *                 type: string
 *               parentNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Daily report updated
 */
router.put('/:id', staff, validate(updateDailyReportSchema), controller.updateDailyReport);

/**
 * @swagger
 * /api/daily-report/{id}/confirm:
 *   post:
 *     summary: Parent confirms daily report
 *     tags: [Daily Report]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentFeedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Daily report confirmed
 */
router.post(
  '/:id/confirm',
  confirmers,
  validate(confirmDailyReportSchema),
  controller.confirmDailyReport
);

/**
 * @swagger
 * /api/daily-report/{id}:
 *   delete:
 *     summary: Delete daily report
 *     tags: [Daily Report]
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
 *         description: Daily report deleted
 */
router.delete('/:id', staff, controller.deleteDailyReport);

export default router;
