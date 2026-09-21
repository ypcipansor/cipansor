import { prisma } from '@/lib/prisma';
import { Prisma, NotificationType } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { claimBlobForRecord, releaseBlobClaim } from '@/utils/blob-claim';

interface CreateAnnouncementInput {
  unitId?: string;
  title: string;
  content: string;
  type?: NotificationType;
  priority?: number;
  attachmentUrl?: string;
  publishedAt?: Date;
  expiresAt?: Date;
  targetRoles?: string[];
  createdById: string;
}

interface UpdateAnnouncementInput {
  title?: string;
  content?: string;
  type?: NotificationType;
  priority?: number;
  attachmentUrl?: string;
  publishedAt?: Date;
  expiresAt?: Date;
  targetRoles?: string[];
}

interface AnnouncementQuery {
  unitId?: string;
  type?: NotificationType;
  priority?: number;
  published?: boolean;
  page?: number;
  limit?: number;
}

export class AnnouncementService {
  async findAll(query: AnnouncementQuery) {
    const { unitId, type, priority, published, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AnnouncementWhereInput = {};

    // Filter by unit (include global announcements)
    if (unitId) {
      where.OR = [
        { unitId },
        { unitId: null }, // Global announcements
      ];
    }

    if (type) {
      where.type = type;
    }

    if (priority !== undefined) {
      where.priority = priority;
    }

    // Only published announcements
    if (published) {
      where.publishedAt = { lte: new Date() };
      where.OR = [{ expiresAt: null }, { expiresAt: { gte: new Date() } }];
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: {
          unit: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    return {
      data: announcements,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    return prisma.announcement.findUnique({
      where: { id },
      include: {
        unit: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async create(data: CreateAnnouncementInput) {
    // Claim the attachment blob before the row references it, so a concurrent
    // discard of a just-uploaded file cannot delete it between its reference
    // probe and this insert (BUG 4 / flag 9).
    if (data.attachmentUrl) {
      const claimed = await claimBlobForRecord(data.attachmentUrl, data.createdById);
      if (!claimed) {
        throw Errors.conflict(
          'Lampiran pengumuman sedang diproses pihak lain; unggah ulang berkas tersebut'
        );
      }
    }
    try {
      return await prisma.announcement.create({
        data: {
          unitId: data.unitId,
          title: data.title,
          content: data.content,
          type: data.type || 'ANNOUNCEMENT',
          priority: data.priority || 0,
          attachmentUrl: data.attachmentUrl,
          publishedAt: data.publishedAt || new Date(),
          expiresAt: data.expiresAt,
          targetRoles: data.targetRoles || [],
          createdById: data.createdById,
        },
        include: {
          unit: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });
    } finally {
      if (data.attachmentUrl) {
        await releaseBlobClaim(data.attachmentUrl, data.createdById).catch(() => undefined);
      }
    }
  }

  async update(id: string, data: UpdateAnnouncementInput, actorId: string) {
    // An attachment added by an update is a new blob reference, so it takes the
    // same claim as create (flag 9).
    if (data.attachmentUrl) {
      const claimed = await claimBlobForRecord(data.attachmentUrl, actorId);
      if (!claimed) {
        throw Errors.conflict(
          'Lampiran pengumuman sedang diproses pihak lain; unggah ulang berkas tersebut'
        );
      }
    }
    try {
      return await prisma.announcement.update({
        where: { id },
        data,
        include: {
          unit: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });
    } finally {
      if (data.attachmentUrl) {
        await releaseBlobClaim(data.attachmentUrl, actorId).catch(() => undefined);
      }
    }
  }

  async delete(id: string) {
    return prisma.announcement.delete({
      where: { id },
    });
  }

  // Get stats for dashboard
  async getStats(unitId?: string) {
    const where: Prisma.AnnouncementWhereInput = {};

    if (unitId) {
      where.OR = [{ unitId }, { unitId: null }];
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, urgent, thisMonth] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.count({
        where: {
          AND: [
            where,
            { publishedAt: { lte: now } },
            { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
          ],
        },
      }),
      prisma.announcement.count({
        where: {
          AND: [
            where,
            { priority: 2 }, // urgent
            { publishedAt: { lte: now } },
            { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
          ],
        },
      }),
      prisma.announcement.count({
        where: {
          AND: [where, { createdAt: { gte: startOfMonth } }],
        },
      }),
    ]);

    return {
      total,
      active,
      urgent,
      thisMonth,
    };
  }

  // Get recent announcements for dashboard
  async getRecent(unitId?: string, limit: number = 5) {
    const where: Prisma.AnnouncementWhereInput = {
      publishedAt: { lte: new Date() },
    };

    if (unitId) {
      where.OR = [{ unitId }, { unitId: null }];
    }

    return prisma.announcement.findMany({
      where,
      include: {
        unit: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });
  }
}

export const announcementService = new AnnouncementService();
