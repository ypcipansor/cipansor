import { Router } from 'express';
import { parentController } from './parent.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// All routes require authentication and PARENT role
router.use(authenticate);
router.use(authorize(UserRole.PARENT));

/**
 * @swagger
 * tags:
 *   name: Parent Portal
 *   description: Parent portal API — the wali's view of their children (permits are filed through /api/permits)
 */

/**
 * @swagger
 * /api/parent/dashboard:
 *   get:
 *     summary: Get parent dashboard summary
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary with children overview
 */
router.get('/dashboard', parentController.getDashboard.bind(parentController));

/**
 * @swagger
 * /api/parent/children:
 *   get:
 *     summary: Get all children linked to parent
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of children
 */
router.get('/children', parentController.getChildren.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/profile:
 *   get:
 *     summary: Get child's full profile
 *     tags: [Parent Portal]
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
 *         description: Child profile data
 */
router.get('/children/:studentId/profile', parentController.getChildProfile.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/attendance:
 *   get:
 *     summary: Get child's attendance records
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Attendance records with summary
 */
router.get(
  '/children/:studentId/attendance',
  parentController.getChildAttendance.bind(parentController)
);

/**
 * @swagger
 * /api/parent/children/{studentId}/tahfidz:
 *   get:
 *     summary: Get child's tahfidz progress
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: activityType
 *         schema:
 *           type: string
 *           enum: [ZIYADAH, MUROJAAH, TASMI, ASSESSMENT]
 *     responses:
 *       200:
 *         description: Tahfidz records with summary
 */
router.get('/children/:studentId/tahfidz', parentController.getChildTahfidz.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/ibadah:
 *   get:
 *     summary: Get child's ibadah statistics
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Ibadah statistics and records
 */
router.get('/children/:studentId/ibadah', parentController.getChildIbadah.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/grades:
 *   get:
 *     summary: Get child's grades
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Grades with subject grouping
 */
router.get('/children/:studentId/grades', parentController.getChildGrades.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/weekly-progress:
 *   get:
 *     summary: Get child's aggregated weekly progress
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Any date within the desired week (defaults to current week)
 *     responses:
 *       200:
 *         description: Weekly attendance, tahfidz, behavior and academic summary
 */
router.get(
  '/children/:studentId/weekly-progress',
  parentController.getChildWeeklyProgress.bind(parentController)
);

/**
 * @swagger
 * /api/parent/children/{studentId}/report-cards:
 *   get:
 *     summary: Get child's report cards
 *     tags: [Parent Portal]
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
 *         description: Published report cards
 */
router.get(
  '/children/:studentId/report-cards',
  parentController.getChildReportCards.bind(parentController)
);

/**
 * @swagger
 * /api/parent/children/{studentId}/finance:
 *   get:
 *     summary: Get child's financial information
 *     tags: [Parent Portal]
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
 *         description: Invoices and payment summary
 */
router.get('/children/:studentId/finance', parentController.getChildFinance.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/violations:
 *   get:
 *     summary: Get child's violations
 *     tags: [Parent Portal]
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
 *         description: Violations with summary
 */
/**
 * @swagger
 * /api/parent/children/{studentId}/counseling:
 *   get:
 *     summary: Get child's counseling summaries shared with parents
 *     description: Only sessions flagged parentNotified or non-confidential; psychological observation data is never exposed here.
 *     tags: [Parent Portal]
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
 *         description: Counseling summaries and recommendations
 */
router.get(
  '/children/:studentId/counseling',
  parentController.getChildCounseling.bind(parentController)
);

router.get(
  '/children/:studentId/violations',
  parentController.getChildViolations.bind(parentController)
);

/**
 * @swagger
 * /api/parent/children/{studentId}/rewards:
 *   get:
 *     summary: Get child's rewards
 *     tags: [Parent Portal]
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
 *         description: Rewards with summary
 */
router.get('/children/:studentId/rewards', parentController.getChildRewards.bind(parentController));

/**
 * @swagger
 * /api/parent/children/{studentId}/health:
 *   get:
 *     summary: Get child's health records
 *     tags: [Parent Portal]
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
 *         description: Medical records
 */
router.get('/children/:studentId/health', parentController.getChildHealth.bind(parentController));

/**
 * @swagger
 * /api/parent/announcements:
 *   get:
 *     summary: Get announcements for parent
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Relevant announcements
 */
router.get('/announcements', parentController.getAnnouncements.bind(parentController));

/**
 * @swagger
 * /api/parent/notifications:
 *   get:
 *     summary: Get notifications for parent
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [UNREAD, READ, ARCHIVED]
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
 *         description: Notifications with unread count
 */
router.get('/notifications', parentController.getNotifications.bind(parentController));

/**
 * @swagger
 * /api/parent/notifications/{notificationId}/read:
 *   put:
 *     summary: Mark notification as read
 *     tags: [Parent Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.put(
  '/notifications/:notificationId/read',
  parentController.markNotificationRead.bind(parentController)
);

export default router;
