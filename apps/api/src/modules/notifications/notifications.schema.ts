import { z } from 'zod';

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

export const createNotificationSchema = z.object({
  userId: z.string().uuid().optional(), // Optional for bulk/system
  title: z.string().min(1).max(255),
  message: z.string().min(1),
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
  data: z.record(z.unknown()).optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const createBulkNotificationSchema = createNotificationSchema
  .extend({
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

export const updateTemplateSchema = createTemplateSchema.partial();

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

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

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
