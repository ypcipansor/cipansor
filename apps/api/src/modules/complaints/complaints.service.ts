import { prisma } from '@/lib/prisma';
import {
  ComplaintStatus,
  ComplaintPriority,
  ComplaintCategory,
  Prisma,
  UserRole,
} from '@prisma/client';

export const complaintsService = {
  getComplaintUnit: async (id: string) => {
    return prisma.complaint.findUnique({
      where: { id },
      select: { unitId: true },
    });
  },

  create: async (data: {
    unitId: string;
    userId: string;
    category: ComplaintCategory;
    subject: string;
    description: string;
    location?: string;
    buildingId?: string;
    roomId?: string;
    assetId?: string;
    isAnonymous?: boolean;
    attachments?: string[];
  }) => {
    return prisma.complaint.create({
      data: {
        unitId: data.unitId,
        userId: data.userId,
        category: data.category,
        subject: data.subject,
        description: data.description,
        location: data.location,
        buildingId: data.buildingId,
        roomId: data.roomId,
        assetId: data.assetId,
        isAnonymous: data.isAnonymous || false,
        attachments: data.attachments || [],
        status: 'PENDING',
        priority: 'NORMAL',
      },
    });
  },

  findAll: async (params: {
    unitId: string | null;
    userId: string;
    role: string;
    status?: ComplaintStatus;
    category?: ComplaintCategory;
    page?: number;
    limit?: number;
  }) => {
    const { unitId, userId, role, status, category, page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ComplaintWhereInput = {};

    // SUPER_ADMIN sees all if unitId is null, otherwise filters by unitId
    if (role === UserRole.SUPER_ADMIN) {
      if (unitId) where.unitId = unitId;
    } else if (unitId) {
      where.unitId = unitId;
    }

    if (status) where.status = status;
    if (category) where.category = category;

    // Access Control
    //
    // Unit-scoped access requires a unit. A user with no unit assignment —
    // normal for the Perguruan Tinggi roles, and for anyone not yet attached
    // to a unit — used to hit a bare `throw new Error('Unit ID required')`,
    // which the error handler reported as a 500 and broke the page outright.
    // Falling through to an unfiltered query instead would be worse: it would
    // hand a unit admin with no unit every complaint in the yayasan. So they
    // are demoted to seeing only their own, which is the safe reading of
    // "scoped to a unit you do not have".
    const hasFullAccess =
      role === UserRole.SUPER_ADMIN ||
      (!!unitId &&
        (role === UserRole.UNIT_ADMIN ||
          role === UserRole.STAFF ||
          role === UserRole.TEACHER));

    // Students/Parents only see their own
    if (!hasFullAccess) {
      where.userId = userId;
    }

    const [total, data] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          assignedTo: {
            select: { id: true, name: true },
          },
          building: { select: { id: true, name: true, code: true } },
          room: { select: { id: true, name: true, code: true } },
          asset: { select: { id: true, name: true, code: true } },
          _count: {
            select: { comments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Mask anonymous users logic
    // Unmask for SUPER_ADMIN and UNIT_ADMIN (for investigation)
    const canViewAnonymous = role === UserRole.SUPER_ADMIN || role === UserRole.UNIT_ADMIN;

    const sanitizedData = data.map((d) => {
      if (d.isAnonymous && !canViewAnonymous) {
        return {
          ...d,
          user: null, // Hide user details for anonymous complaints
          userId: null,
        };
      }
      return d;
    });

    return {
      data: sanitizedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  findOne: async (id: string, userId: string, role: string, userUnitId: string | null) => {
    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        assignedTo: { select: { id: true, name: true } },
        building: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, code: true } },
        asset: { select: { id: true, name: true, code: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!complaint) return null;

    // Access check
    const hasFullAccess =
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.UNIT_ADMIN ||
      role === UserRole.STAFF ||
      role === UserRole.TEACHER;

    if (!hasFullAccess && complaint.userId !== userId) {
      throw new Error('Unauthorized'); // Controller will handle this
    }

    // Unit Isolation Check
    // If user has full access (Admin/Staff/Teacher), they must be in the same unit as the complaint
    // Unless they are SUPER_ADMIN (who might have null unitId or access across units)
    if (hasFullAccess && role !== UserRole.SUPER_ADMIN) {
      if (complaint.unitId !== userUnitId) {
        throw new Error('Unauthorized'); // Cannot access complaints from other units
      }
    }

    // Filter internal comments for non-staff/non-admin
    // Teachers are considered staff-level for visibility but restricted in management actions
    if (!hasFullAccess) {
      complaint.comments = complaint.comments.filter((c) => !c.isInternal);
    }

    // Mask anonymous users logic
    // Unmask for SUPER_ADMIN and UNIT_ADMIN (for investigation)
    const canViewAnonymous = role === UserRole.SUPER_ADMIN || role === UserRole.UNIT_ADMIN;

    if (complaint.isAnonymous && !canViewAnonymous) {
      // If anonymous, mask the reporter
      complaint.user = null;
      complaint.userId = null;
    }

    return complaint;
  },

  updateStatus: async (id: string, status: ComplaintStatus, resolution?: string) => {
    const data: Prisma.ComplaintUpdateInput = { status };
    if (resolution) data.resolution = resolution;

    if (status === 'RESOLVED') {
      data.resolvedAt = new Date();
    } else {
      // If moving away from RESOLVED, clear resolvedAt?
      // Optional: data.resolvedAt = null;
      // Keeping history might be better, but typically "resolvedAt" implies current resolution state.
      // Let's clear it if status is not resolved to avoid confusion.
      data.resolvedAt = null;
    }

    return prisma.complaint.update({
      where: { id },
      data,
    });
  },

  assignHandler: async (id: string, handlerId: string) => {
    return prisma.complaint.update({
      where: { id },
      data: { assignedToId: handlerId, status: 'IN_PROGRESS' },
    });
  },

  addComment: async (data: {
    complaintId: string;
    userId: string;
    content: string;
    isInternal?: boolean;
  }) => {
    return prisma.complaintComment.create({
      data: {
        complaintId: data.complaintId,
        userId: data.userId,
        content: data.content,
        isInternal: data.isInternal || false,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });
  },
};
