/**
 * Notifications Module
 *
 * Exports:
 * - Notification CRUD operations
 * - Announcement management
 * - Parent access management
 * - Email/SMS notification service
 * - WhatsApp notification service
 * - Notification scheduler
 */

// Core notification service functions
export * from './notifications.service';
export { dispatchPendingPush, webPushKeys } from './push-dispatch.service';

// Email/SMS notification service
export { notificationService, templates, smsTemplates } from './email-sms.service';
export type { NotificationChannel, ServiceNotificationType } from './email-sms.service';

// WhatsApp notification service
export { whatsAppService, WA_TEMPLATES } from './whatsapp.service';

// Notification scheduler
export { notificationScheduler } from './scheduler.service';
