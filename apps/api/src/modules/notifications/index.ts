/**
 * Notifications Module
 *
 * Exports:
 * - Notification CRUD operations
 * - Delivering announcements to the bell (the announcements module owns them)
 * - Parent access management
 * - Email/SMS notification service
 * - WhatsApp notification service
 * - Notification scheduler
 */

// Core notification service functions
export * from './notifications.service';
export { dispatchPendingPush, webPushKeys } from './push-dispatch.service';
export {
  deliverAnnouncement,
  reviseAnnouncementDelivery,
  withdrawAnnouncementDelivery,
  announcementDeliveryCounts,
} from './announcement-delivery.service';
export type { AnnouncementDelivery } from './announcement-delivery.service';

// Email/SMS notification service
export { notificationService, templates, smsTemplates } from './email-sms.service';
export type { NotificationChannel, ServiceNotificationType } from './email-sms.service';

// WhatsApp notification service
export { whatsAppService, WA_TEMPLATES } from './whatsapp.service';

// Notification scheduler
export { notificationScheduler } from './scheduler.service';
