import { Prisma, NotificationStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  notificationService as channelService,
  type NotificationChannel,
} from './email-sms.service';
import crypto from 'node:crypto';
import type {
  CreateNotificationInput,
  CreateBulkNotificationInput,
  QueryNotificationInput,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  QueryAnnouncementInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  QueryTemplateInput,
} from './notifications.schema';
import type { NotificationTemplate } from '@cipansor/shared';

// Helper to map shared types to Prisma Enum
export const mapTypeToPrisma = (type: string): { dbType: string; originalType: string | null } => {
  const validTypes = ['INFO', 'ANNOUNCEMENT', 'REMINDER', 'ALERT', 'PAYMENT', 'ACADEMIC'];

  if (validTypes.includes(type)) {
    return { dbType: type, originalType: null };
  }

  const mapping: Record<string, string> = {
    ATTENDANCE: 'ACADEMIC',
    FINANCE: 'PAYMENT',
    PERMIT: 'ACADEMIC',
    HEALTH: 'INFO',
    VIOLATION: 'ALERT',
    REWARD: 'INFO',
    SYSTEM: 'INFO',
  };

  return { dbType: mapping[type] || 'INFO', originalType: type };
};

// ==================== NOTIFICATION ====================

export async function getUserNotifications(userId: string, query: QueryNotificationInput) {
  const { page, limit, type, isRead } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(isRead !== undefined && {
      status: isRead ? NotificationStatus.READ : NotificationStatus.UNREAD,
    }),
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
  };

  if (type) {
    const { dbType, originalType } = mapTypeToPrisma(type);
    where.type = dbType as any;

    if (originalType) {
      // Prisma JSON filter workaround
      // Cast to any because Prisma strict typing for JSON filters can be finicky
      (where as any).data = {
        path: ['originalType'],
        equals: originalType,
      };
    }
  }

  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, status: NotificationStatus.UNREAD } }),
  ]);

  const transformedData = data.map((n) => {
    const originalType = (n.data as any)?.originalType;
    if (originalType) {
      return { ...n, type: originalType };
    }
    return n;
  });

  return {
    data: transformedData,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    },
  };
}

export async function getAllNotifications(query: QueryNotificationInput) {
  const { page, limit, type, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = {
    ...(startDate &&
      endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }),
  };

  if (type) {
    const { dbType, originalType } = mapTypeToPrisma(type);
    where.type = dbType as any;
    if (originalType) {
      // Prisma JSON filter workaround
      (where as any).data = {
        path: ['originalType'],
        equals: originalType,
      };
    }
  }

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  const transformedData = data.map((n) => {
    const originalType = (n.data as any)?.originalType;
    if (originalType) {
      return { ...n, type: originalType };
    }
    return n;
  });

  return {
    data: transformedData,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getNotificationById(id: string) {
  const notification = await prisma.notification.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  if (notification) {
    const originalType = (notification.data as any)?.originalType;
    if (originalType) {
      return { ...notification, type: originalType };
    }
  }

  return notification;
}

// ---------------------------------------------------------------------------
// Channel policy — which EXTERNAL channels the system may use (IN_APP is
// always on). Stored as a Setting row (key NOTIFICATION_CHANNELS); managed
// by SUPER_ADMIN via /notifications/settings/channels.
// ---------------------------------------------------------------------------

export interface ChannelPolicy {
  EMAIL: boolean;
  SMS: boolean;
  WHATSAPP: boolean;
}

const DEFAULT_CHANNEL_POLICY: ChannelPolicy = { EMAIL: true, SMS: true, WHATSAPP: true };

export async function getChannelPolicy(): Promise<ChannelPolicy> {
  const setting = await prisma.setting.findFirst({
    where: { key: 'NOTIFICATION_CHANNELS' },
  });
  if (!setting) {
    return DEFAULT_CHANNEL_POLICY;
  }
  const value = setting.value as Partial<ChannelPolicy> | null;
  return { ...DEFAULT_CHANNEL_POLICY, ...(value ?? {}) };
}

export async function updateChannelPolicy(policy: ChannelPolicy) {
  const existing = await prisma.setting.findFirst({
    where: { key: 'NOTIFICATION_CHANNELS' },
  });
  if (existing) {
    return prisma.setting.update({
      where: { id: existing.id },
      data: { value: policy as unknown as Prisma.InputJsonValue },
    });
  }
  const unit = await prisma.unit.findFirst({ select: { id: true } });
  if (!unit) throw new Error('No unit exists to attach the setting to');
  return prisma.setting.create({
    data: {
      unitId: unit.id,
      key: 'NOTIFICATION_CHANNELS',
      value: policy as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function createNotification(data: CreateNotificationInput) {
  const { dbType, originalType } = mapTypeToPrisma(data.type ?? 'INFO');

  // Extract fields that are not in the Prisma model but need to be stored in `data`
  const { priority, channels, recipientType, recipientIds, ...rest } = data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any = {
    ...rest,
    type: dbType,
    data: {
      ...(data.data || {}),
      ...(originalType ? { originalType } : {}),
      // Store non-model fields in JSON data for downstream consumers
      priority,
      channels,
      recipientType,
      ...(recipientIds ? { recipientIds } : {}),
    },
    // Explicitly map scheduledAt if provided
    scheduledAt: data.scheduledAt || null,
  };

  const notification = await prisma.notification.create({ data: createData });

  // Fan out to external channels (EMAIL/SMS/WHATSAPP) listed on the
  // notification. The in-app row above is the record; external dispatch is
  // best-effort and must never fail the caller.
  const externalChannels = (channels ?? []).filter(
    (c): c is Exclude<NotificationChannel, 'IN_APP' | 'PUSH'> =>
      c === 'EMAIL' || c === 'SMS' || c === 'WHATSAPP'
  );
  if (externalChannels.length > 0 && data.userId) {
    try {
      // Respect the system-wide channel policy (super-admin managed).
      const policy = await getChannelPolicy();
      const allowed = externalChannels.filter((c) => policy[c]);
      const user =
        allowed.length > 0
          ? await prisma.user.findUnique({
              where: { id: data.userId },
              select: { email: true, phone: true },
            })
          : null;
      if (user) {
        await Promise.allSettled(
          allowed.map((channel) =>
            channelService.dispatchExternal({
              channel,
              userId: data.userId,
              recipientEmail: user.email ?? undefined,
              recipientPhone: user.phone ?? undefined,
              type: 'GENERAL',
              title: data.title,
              message: data.message,
            })
          )
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('External notification dispatch failed:', error);
    }
  }

  if (originalType) {
    return { ...notification, type: originalType };
  }
  return notification;
}

export async function createBulkNotifications(data: CreateBulkNotificationInput) {
  const { userIds, ...notificationData } = data;
  const { dbType, originalType } = mapTypeToPrisma(notificationData.type);
  const { priority, channels, ...rest } = notificationData;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifications: any[] = userIds.map((userId) => ({
    ...rest,
    type: dbType,
    userId,
    data: {
      ...(originalType ? { originalType } : {}),
      priority,
      channels,
    },
  }));

  return prisma.notification.createMany({
    data: notifications,
  });
}

export async function createManyNotifications(data: CreateNotificationInput[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifications: any[] = data.map((item) => {
    const { dbType, originalType } = mapTypeToPrisma(item.type ?? 'INFO');
    const { priority, channels, recipientType, recipientIds, ...rest } = item;

    return {
      userId: item.userId,
      title: item.title,
      message: item.message,

      type: dbType,
      link: item.link,
      data: {
        ...(item.data || {}),
        ...(originalType ? { originalType } : {}),
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        priority,
        channels,
        recipientType,
        ...(recipientIds ? { recipientIds } : {}),
        ...(item.unitId ? { unitId: item.unitId } : {}),
        ...(item.classId ? { classId: item.classId } : {}),
        ...(item.role ? { role: item.role } : {}),
      },
      scheduledAt: item.scheduledAt || null,
    };
  });

  return prisma.notification.createMany({
    data: notifications,
  });
}

export async function markAsRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { status: NotificationStatus.READ, readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, status: NotificationStatus.UNREAD },
    data: { status: NotificationStatus.READ, readAt: new Date() },
  });
}

export async function deleteNotification(id: string, userId: string, isAdmin = false) {
  const where: Prisma.NotificationWhereInput = { id };
  // If not admin, restrict to user ownership
  if (!isAdmin) {
    where.userId = userId;
  }

  return prisma.notification.deleteMany({
    where,
  });
}

export async function sendNotification(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { createdAt: new Date() },
  });
}

export async function scheduleNotification(id: string, scheduledAt: Date) {
  return prisma.notification.update({
    where: { id },
    data: { scheduledAt },
  });
}

// ==================== STATS ====================

export async function getNotificationStats(startDate?: Date, endDate?: Date) {
  const where: Prisma.NotificationWhereInput = {
    ...(startDate &&
      endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }),
  };

  const [total, unread, rawNotifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, status: NotificationStatus.UNREAD } }),
    prisma.notification.findMany({
      where,
      select: { type: true, data: true },
    }),
  ]);

  const byTypeMap: Record<string, number> = {};

  rawNotifications.forEach((n) => {
    const originalType = (n.data as any)?.originalType || n.type;
    byTypeMap[originalType] = (byTypeMap[originalType] || 0) + 1;
  });

  return {
    total,
    readRate: total > 0 ? ((total - unread) / total) * 100 : 0,
    deliveryRate: 100,
    byType: byTypeMap,
    todayCount: 0,
    weekCount: 0,
  };
}

// ==================== TEMPLATES ====================

export async function getTemplates(query: QueryTemplateInput, unitId?: string) {
  const where: Prisma.SettingWhereInput = { key: 'NOTIFICATION_TEMPLATES' };
  if (unitId) {
    where.unitId = unitId;
  }

  const setting = await prisma.setting.findFirst({
    where,
  });

  let templates = (setting?.value as any[]) || [];

  if (query.type) {
    templates = templates.filter((t) => t.type === query.type);
  }
  if (query.isActive !== undefined) {
    templates = templates.filter((t) => t.isActive === query.isActive);
  }

  return templates;
}

export async function getTemplateById(id: string, unitId?: string) {
  const where: Prisma.SettingWhereInput = { key: 'NOTIFICATION_TEMPLATES' };
  if (unitId) {
    where.unitId = unitId;
  }

  const setting = await prisma.setting.findFirst({
    where,
  });

  const templates = (Array.isArray(setting?.value)
    ? setting.value
    : []) as unknown as NotificationTemplate[];
  return templates.find((t) => t.id === id) || null;
}

export async function createTemplate(data: CreateTemplateInput, unitId?: string) {
  // If unitId is provided, we use it. If not, we fallback to finding the first unit.
  // Ideally, this should always be provided by the controller.
  let targetUnitId = unitId;

  if (!targetUnitId) {
    // Fallback logic kept for compatibility but should be avoided
    const unit = await prisma.unit.findFirst();
    if (!unit) throw new Error('No unit found to store settings');
    targetUnitId = unit.id;
  }

  // Use transaction to minimize race condition window, though simplistic
  return prisma.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
    });

    const templates = (setting?.value as any[]) || [];

    const newTemplate = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    templates.push(newTemplate);

    await tx.setting.upsert({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
      update: { value: templates },
      create: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES', value: templates },
    });

    return newTemplate;
  });
}

export async function updateTemplate(id: string, data: UpdateTemplateInput, unitId?: string) {
  let targetUnitId = unitId;
  if (!targetUnitId) {
    const unit = await prisma.unit.findFirst();
    if (!unit) throw new Error('No unit found');
    targetUnitId = unit.id;
  }

  return prisma.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
    });

    let templates = (setting?.value as any[]) || [];
    const index = templates.findIndex((t) => t.id === id);

    if (index === -1) throw new Error('Template not found');

    templates[index] = { ...templates[index], ...data, updatedAt: new Date() };

    await tx.setting.update({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
      data: { value: templates },
    });

    return templates[index];
  });
}

export async function deleteTemplate(id: string, unitId?: string) {
  let targetUnitId = unitId;
  if (!targetUnitId) {
    const unit = await prisma.unit.findFirst();
    if (!unit) throw new Error('No unit found');
    targetUnitId = unit.id;
  }

  return prisma.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
    });

    let templates = (setting?.value as any[]) || [];
    templates = templates.filter((t) => t.id !== id);

    await tx.setting.update({
      where: { unitId_key: { unitId: targetUnitId!, key: 'NOTIFICATION_TEMPLATES' } },
      data: { value: templates },
    });

    return true;
  });
}

// ==================== ANNOUNCEMENT ====================

export async function getAnnouncements(query: QueryAnnouncementInput) {
  const { page, limit, unitId, priority, active } = query;
  const skip = (page - 1) * limit;
  const now = new Date();

  const where: Prisma.AnnouncementWhereInput = {
    ...(unitId && { unitId }),
    ...(priority !== undefined && { priority }),
    ...(active && {
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      skip,
      take: limit,
      include: {
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAnnouncementById(id: string) {
  return prisma.announcement.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function createAnnouncement(data: CreateAnnouncementInput, createdById: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any = {
    ...data,
    createdById,
    publishedAt: data.publishedAt || new Date(),
  };

  return prisma.announcement.create({
    data: createData,
    include: {
      unit: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateAnnouncement(id: string, data: UpdateAnnouncementInput) {
  const { unitId, type, ...rest } = data;
  const { dbType } = type ? mapTypeToPrisma(type) : { dbType: undefined };

  return prisma.announcement.update({
    where: { id },
    data: {
      ...rest,
      ...(type && { type: dbType as any }), // Cast to any because of enum mismatch in Zod vs Prisma
      ...(unitId && { unit: { connect: { id: unitId } } }),
    },
    include: {
      unit: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function deleteAnnouncement(id: string) {
  return prisma.announcement.delete({ where: { id } });
}
