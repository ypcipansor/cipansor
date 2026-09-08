import type { Request, Response, NextFunction } from 'express';
import * as service from './notifications.service';
import {
  createNotificationSchema,
  createBulkNotificationSchema,
  queryNotificationSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  queryAnnouncementSchema,
  queryStatsSchema,
  createTemplateSchema,
  updateTemplateSchema,
  queryTemplateSchema,
} from './notifications.schema';
import { Errors } from '../../middleware/error';
import { whatsAppService } from './whatsapp.service';
import { notificationScheduler } from './scheduler.service';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { describeEmailTransport } from './email-transport';

// Constants
const ADMIN_ROLES: readonly string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];

// ==================== NOTIFICATION ====================

export async function getMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryNotificationSchema.parse(req.query);
    const result = await service.getUserNotifications(req.user!.sub, query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getAllNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryNotificationSchema.parse(req.query);
    const result = await service.getAllNotifications(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationById(req: Request, res: Response, next: NextFunction) {
  try {
    const notification = await service.getNotificationById(req.params.id);
    if (!notification) {
      throw Errors.notFound('Notification not found');
    }

    // Security check: User must be the owner OR have admin privileges
    const userRole = req.user?.role;
    const isAdmin = userRole !== undefined && ADMIN_ROLES.includes(userRole);

    if (notification.userId !== req.user!.sub && !isAdmin) {
      throw Errors.forbidden('You do not have permission to view this notification');
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

export async function createNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createNotificationSchema.parse(req.body);
    const notification = await service.createNotification(data);
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

export async function createBulkNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBulkNotificationSchema.parse(req.body);
    const result = await service.createBulkNotifications(data);
    res.status(201).json({ success: true, data: { count: result.count } });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    await service.markAsRead(req.params.id, req.user!.sub);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
}

export async function markAllAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.markAllAsRead(req.user!.sub);
    res.json({ success: true, data: { count: result.count } });
  } catch (error) {
    next(error);
  }
}

export async function deleteNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const userRole = req.user?.role;
    const isAdmin = userRole !== undefined && ADMIN_ROLES.includes(userRole);

    await service.deleteNotification(req.params.id, req.user!.sub, isAdmin);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
}

export async function sendNotification(req: Request, res: Response, next: NextFunction) {
  try {
    await service.sendNotification(req.params.id);
    res.json({ success: true, message: 'Notification queued for sending' });
  } catch (error) {
    next(error);
  }
}

const scheduleNotificationSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export async function scheduleNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const { scheduledAt } = scheduleNotificationSchema.parse(req.body);
    const result = await service.scheduleNotification(req.params.id, new Date(scheduledAt));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryStatsSchema.parse(req.query);
    const result = await service.getNotificationStats(query.startDate, query.endDate);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ==================== TEMPLATES ====================

export async function getTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryTemplateSchema.parse(req.query);
    const unitId = req.user?.unitId ?? undefined;
    const result = await service.getTemplates(query, unitId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Get notification template by ID
 */
export async function getTemplateById(req: Request, res: Response, next: NextFunction) {
  try {
    const unitId = req.user?.unitId ?? undefined;
    const result = await service.getTemplateById(req.params.id, unitId);
    if (!result) {
      throw Errors.notFound('Template not found');
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createTemplateSchema.parse(req.body);
    // Pass user's unitId if available (for multi-tenancy)
    const unitId = req.user?.unitId ?? undefined;
    const result = await service.createTemplate(data, unitId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateTemplateSchema.parse(req.body);
    const unitId = req.user?.unitId ?? undefined;
    const result = await service.updateTemplate(req.params.id, data, unitId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const unitId = req.user?.unitId ?? undefined;
    await service.deleteTemplate(req.params.id, unitId);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
}

// ==================== ANNOUNCEMENT ====================

export async function getAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryAnnouncementSchema.parse(req.query);
    const result = await service.getAnnouncements(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getAnnouncementById(req: Request, res: Response, next: NextFunction) {
  try {
    const announcement = await service.getAnnouncementById(req.params.id);
    if (!announcement) {
      throw Errors.notFound('Announcement not found');
    }
    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
}

export async function createAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAnnouncementSchema.parse(req.body);
    const announcement = await service.createAnnouncement(data, req.user!.sub);
    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
}

export async function updateAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateAnnouncementSchema.parse(req.body);
    const announcement = await service.updateAnnouncement(req.params.id, data);
    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
}

export async function deleteAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAnnouncement(req.params.id);
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    next(error);
  }
}

// ==================== MOBILE PUSH (FCM) ====================

export async function updateFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body as { token?: string | null };
    if (token !== null && (typeof token !== 'string' || token.length < 10 || token.length > 4096)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'token must be a string (or null to clear)' },
      });
      return;
    }
    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { fcmToken: token },
    });
    res.json({ success: true, message: token ? 'FCM token registered' : 'FCM token cleared' });
  } catch (error) {
    next(error);
  }
}

// ==================== WHATSAPP ====================

const sendWhatsAppSchema = z.object({
  phone: z.string().min(10),
  message: z.string().min(1),
});

const broadcastSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  type: z
    .enum(['INFO', 'PAYMENT', 'ACADEMIC', 'ATTENDANCE', 'HEALTH', 'COUNSELING', 'ANNOUNCEMENT'])
    .default('ANNOUNCEMENT'),
  targetType: z.enum(['ALL', 'STUDENTS', 'TEACHERS', 'UNIT', 'CLASS']).default('ALL'),
  targetId: z.string().uuid().optional(),
  useWhatsApp: z.boolean().default(false),
});

export async function sendWhatsApp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sendWhatsAppSchema.parse(req.body);
    const result = await whatsAppService.sendMessage({
      to: data.phone,
      message: data.message,
      type: 'text',
    });
    res.json({ success: result.success, data: result });
  } catch (error) {
    next(error);
  }
}

export async function broadcastWhatsApp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = broadcastSchema.parse(req.body);
    const result = await notificationScheduler.broadcastNotification({
      title: data.title,
      message: data.message,
      type: data.type as any,
      targetType: data.targetType,
      targetId: data.targetId,
      useWhatsApp: data.useWhatsApp,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getWhatsAppStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await whatsAppService.getProviderStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
}

// ==================== SCHEDULER ====================

const triggerScheduleSchema = z.object({
  task: z.enum([
    'payment-reminder',
    'attendance-summary',
    'tahfidz-progress',
    'event-reminder',
    'monthly-report',
  ]),
});

export async function triggerScheduledTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { task } = triggerScheduleSchema.parse(req.body);

    await notificationScheduler.runTask(task);

    res.json({ success: true, message: `Task ${task} executed` });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /notifications/settings/channels — current external-channel policy.
 */
export async function getChannelPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await service.getChannelPolicy();
    res.json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /notifications/settings/email-transport — what actually sends the mail.
 *
 * Exists because the settings screen used to *state* the mail configuration
 * from hardcoded strings — noreply@, halo@, smtp.gmail.com:587 — while the
 * server read them from the environment, and showed "Channel Email Aktif"
 * whenever the channel policy was on, even with no transport configured at all.
 * The page now asks rather than asserts.
 */
export async function getEmailTransport(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: describeEmailTransport() });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /notifications/settings/channels — update the policy (SUPER_ADMIN).
 */
export async function updateChannelPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const { EMAIL, SMS, WHATSAPP } = req.body ?? {};
    for (const [name, v] of Object.entries({ EMAIL, SMS, WHATSAPP })) {
      if (typeof v !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `${name} must be a boolean` },
        });
      }
    }
    await service.updateChannelPolicy({ EMAIL, SMS, WHATSAPP });
    res.json({ success: true, data: { EMAIL, SMS, WHATSAPP } });
  } catch (error) {
    next(error);
  }
}
