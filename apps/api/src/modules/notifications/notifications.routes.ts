import { Router } from 'express';
import * as controller from './notifications.controller';
import { authenticate, authorize, isSuperAdmin } from '../../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==================== NOTIFICATIONS ====================

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get my notifications (Inbox)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: isRead
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
 *         description: List of notifications
 */
router.get('/', controller.getMyNotifications);

/**
 * @swagger
 * /api/notifications/admin:
 *   get:
 *     summary: Get all notifications (Admin View)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
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
 *         description: List of all notifications
 */
// Protected Admin Routes
router.get(
  '/admin',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getAllNotifications
);

/**
 * @swagger
 * /api/notifications:
 *   post:
 *     summary: Create notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *               link:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification created
 */
// Creating notifications usually requires admin/staff privileges
router.post(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.createNotification
);

/**
 * @swagger
 * /api/notifications/bulk:
 *   post:
 *     summary: Send bulk notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *               - title
 *               - message
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notifications sent
 */
router.post(
  '/bulk',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER, UserRole.STAFF),
  controller.createBulkNotifications
);

router.get('/stats', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN), controller.getStats);

// Channel policy: which external channels (email/SMS/WhatsApp) the system
// may use. Read: admins. Write: SUPER_ADMIN only (system-wide switch).
router.get(
  '/settings/channels',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getChannelPolicy
);
router.put('/settings/channels', isSuperAdmin, controller.updateChannelPolicy);

// Which mail transport is configured, and the From/Reply-To it sends under.
// Read-only and admin-scoped: it names mailboxes and a host, never a credential.
router.get(
  '/settings/email-transport',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getEmailTransport
);

// Templates (Admin Only)
router.get(
  '/templates',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getTemplates
);
router.get(
  '/templates/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getTemplateById
);
router.post(
  '/templates',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.createTemplate
);
router.put(
  '/templates/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateTemplate
);
router.delete(
  '/templates/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteTemplate
);

router.post(
  '/:id/send',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.sendNotification
);

/**
 * @swagger
 * /api/notifications/{id}/schedule:
 *   post:
 *     summary: Schedule a notification
 *     tags: [Notifications]
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
 *               - scheduledAt
 *             properties:
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Notification scheduled
 */
router.post(
  '/:id/schedule',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.scheduleNotification
);

router.post('/read-all', controller.markAllAsRead);

// ==================== ANNOUNCEMENTS ====================

router.get('/announcements', controller.getAnnouncements);
router.get('/announcements/:id', controller.getAnnouncementById);
router.post(
  '/announcements',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.createAnnouncement
);
router.put(
  '/announcements/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateAnnouncement
);
router.delete(
  '/announcements/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteAnnouncement
);

// ==================== MOBILE PUSH (FCM) ====================

// Register/refresh the caller's mobile push token (any authenticated user).
// Body: { token: string | null } — null clears the token on logout.
router.put('/fcm-token', controller.updateFcmToken);

// ==================== WHATSAPP ====================

router.post(
  '/whatsapp/send',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.sendWhatsApp
);
router.post(
  '/whatsapp/broadcast',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.broadcastWhatsApp
);
router.get(
  '/whatsapp/status',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.getWhatsAppStatus
);

// ==================== SCHEDULER ====================

router.post('/scheduler/trigger', authorize(UserRole.SUPER_ADMIN), controller.triggerScheduledTask);

// ==================== GENERIC ID ROUTES (MUST BE LAST) ====================

router.post('/:id/read', controller.markAsRead);
// Removed RBAC from delete to allow users to delete their own notifications.
// Controller/Service handles ownership check via { id, userId }.
router.delete('/:id', controller.deleteNotification);
router.get('/:id', controller.getNotificationById);

export default router;
