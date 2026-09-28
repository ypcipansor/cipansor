import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';
import { notificationMessageHtmlWithinLimit } from './email-transport';

// We define the enum manually to match @cipansor/shared and include Prisma's types for compatibility
// Shared: ANNOUNCEMENT, ATTENDANCE, FINANCE, ACADEMIC, PERMIT, HEALTH, VIOLATION, REWARD, SYSTEM
// Prisma: INFO, ANNOUNCEMENT, REMINDER, ALERT, PAYMENT, ACADEMIC
export const NotificationTypeEnum = z.enum([
  'ANNOUNCEMENT',
  'ATTENDANCE',
  'FINANCE',
  'ACADEMIC',
  'PERMIT',
  'HEALTH',
  'VIOLATION',
  'REWARD',
  'SYSTEM',
  'INFO',
  'REMINDER',
  'ALERT',
  'PAYMENT',
]);

export const NotificationPriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const NotificationChannelEnum = z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP']);
export const RecipientTypeEnum = z.enum(['ALL', 'UNIT', 'CLASS', 'ROLE', 'INDIVIDUAL']);

// ==================== NOTIFICATION ====================

/**
 * Absolute bound on a notification message, on any channel: it bounds the row
 * we store and the cost of escaping it. `title` has long been capped at 255;
 * the message had no limit at all.
 */
export const MAX_NOTIFICATION_MESSAGE_CHARS = 500_000;

/**
 * Reject a message whose escaped HTML would exceed the converter's cap when
 * the caller asked for e-mail on the general notification path.
 *
 * External delivery is best-effort and must never fail the caller, so without
 * this the in-app row would be persisted and the request answered with success
 * while the e-mail was silently dropped by `htmlToText`. The check uses the
 * exact HTML `sendEmail` builds for a notification — `notificationMessageHtml`
 * — not a worst-case expansion: a message of ordinary text escapes to roughly
 * its own length, and rejecting it would refuse a mail that was never at risk.
 */
function emailMessageSizeIssue(
  value: { message: string; channels: string[] },
  ctx: z.RefinementCtx
): void {
  if (!value.channels.includes('EMAIL')) return;
  if (notificationMessageHtmlWithinLimit(value.message)) return;
  ctx.addIssue({
    code: 'custom',
    path: ['message'],
    message:
      `Pesan terlalu panjang untuk dikirim lewat email: HTML-nya melebihi batas ` +
      `ukuran yang dapat diproses sistem. Kirim sebagai IN_APP saja atau ` +
      `perpendek pesannya.`,
  });
}

const notificationObjectSchema = z.object({
  userId: z.string().uuid().optional(), // Optional for bulk/system
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(MAX_NOTIFICATION_MESSAGE_CHARS),
  type: NotificationTypeEnum.default('INFO'),
  priority: NotificationPriorityEnum.default('NORMAL'),
  channels: z.array(NotificationChannelEnum).default(['IN_APP']),

  // Recipient info
  recipientType: RecipientTypeEnum.default('INDIVIDUAL'),
  recipientIds: z.array(z.string()).optional(),
  unitId: z.string().optional(),
  classId: z.string().optional(),
  role: z.string().optional(),

  link: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const createNotificationSchema = notificationObjectSchema.superRefine(emailMessageSizeIssue);

// The bulk path writes rows through `createMany` and dispatches nothing, so the
// e-mail size guard does not apply to it; the raw length cap on the base object
// still does. Adding the refinement here would refuse a bulk request over a
// send it never performs.
export const createBulkNotificationSchema = notificationObjectSchema
  .safeExtend({
    userIds: z.array(z.string().uuid()).min(1),
  })
  .omit({ userId: true, recipientType: true, recipientIds: true });

export const queryNotificationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: NotificationTypeEnum.optional(),
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  priority: NotificationPriorityEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==================== TEMPLATES ====================

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  type: NotificationTypeEnum,
  titleTemplate: z.string().min(1),
  messageTemplate: z.string().min(1),
  channels: z.array(NotificationChannelEnum),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const updateTemplateSchema = partialUpdateSchema(createTemplateSchema);

export const queryTemplateSchema = z.object({
  type: NotificationTypeEnum.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ==================== STATS ====================

export const queryStatsSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==================== ANNOUNCEMENT ====================

export const createAnnouncementSchema = z.object({
  unitId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  type: NotificationTypeEnum.default('ANNOUNCEMENT'),
  priority: z.coerce.number().int().min(0).max(2).default(0), // Keep int for existing logic
  publishedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  targetRoles: z.array(z.string()).optional(),
  attachmentUrl: z.string().url().optional(),
});

export const updateAnnouncementSchema = partialUpdateSchema(createAnnouncementSchema);

export const queryAnnouncementSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  priority: z.coerce.number().int().min(0).max(2).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// Use the INPUT type so fields with schema defaults (priority, channels,
// recipientType, type) are optional for internal callers that build a
// notification directly without re-parsing (e.g. permits, scheduler).
export type CreateNotificationInput = z.input<typeof createNotificationSchema>;
export type CreateBulkNotificationInput = z.infer<typeof createBulkNotificationSchema>;
export type QueryNotificationInput = z.infer<typeof queryNotificationSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type QueryTemplateInput = z.infer<typeof queryTemplateSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type QueryAnnouncementInput = z.infer<typeof queryAnnouncementSchema>;
