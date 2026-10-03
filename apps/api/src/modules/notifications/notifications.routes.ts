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

router.post('/read-all', controller.markAllAsRead);

// Announcements are their own module (`/announcements`); hand-written
// notifications go through them (decisions/siaran-pengumuman.md).

// ==================== MOBILE PUSH (FCM) ====================

// Register/refresh the caller's mobile push token (any authenticated user).
// Body: { token: string | null } — null clears the token on logout.
router.put('/fcm-token', controller.updateFcmToken);

// Browser Web Push (the PWA). Any authenticated user; each device registers its
// own subscription. `/push/subscribe`, `/push/unsubscribe` and `/push/status`
// stay static above the `/:id` routes.
router.get('/push/config', controller.getPushConfig);
router.post('/push/subscribe', controller.subscribePush);
router.post('/push/unsubscribe', controller.unsubscribePush);
router.get('/push/status', controller.getPushStatus);

// The caller's own notification preferences. No role check: everyone reads and
// writes only their own row (`req.user.sub`). Static, so above `/:id`.
router.get('/preferences', controller.getMyPreferences);
router.patch('/preferences', controller.updateMyPreferences);

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
