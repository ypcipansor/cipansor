import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { claimBlobForRecord, releaseBlobClaimById, type BlobClaimHandle } from '@/utils/blob-claim';
import { UserRole, Prisma, KitabCategory, KitabLevel } from '@prisma/client';

// User type from JwtPayload
interface AuthenticatedUser {
  sub: string;
  role: string;
  unitId: string | null;
}

interface ListKitabQuery {
  category?: KitabCategory;
  level?: KitabLevel;
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

interface CreateKitabInput {
  title: string;
  author: string;
  category: KitabCategory;
  level: KitabLevel;
  totalPages?: number;
  totalBab?: number;
  description?: string;
  coverUrl?: string;
  isActive?: boolean;
}

interface UpdateKitabInput {
  title?: string;
  author?: string;
  category?: KitabCategory;
  level?: KitabLevel;
  totalPages?: number;
  totalBab?: number;
  description?: string;
  coverUrl?: string;
  isActive?: boolean;
}

interface ListProgressQuery {
  kitabId?: string;
  studentId?: string;
  teacherId?: string;
  academicYearId?: string;
  page: number;
  limit: number;
}

export interface UpdateProgressInput {
  kitabId: string;
  studentId: string;
  teacherId: string;
  academicYearId: string;
  currentPage?: number;
  currentBab?: number;
  grade?: string;
  notes?: string;
}

export class KitabProgressService {
  // ==================
  // KITAB METHODS
  // ==================

  /**
   * List kitab kuning
   */
  async listKitab(query: ListKitabQuery) {
    const { page, limit, category, level, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.KitabKuningWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (level) {
      where.level = level;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [kitabList, total] = await Promise.all([
      prisma.kitabKuning.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ level: 'asc' }, { title: 'asc' }],
        include: {
          _count: { select: { progressRecords: true } },
        },
      }),
      prisma.kitabKuning.count({ where }),
    ]);

    return {
      data: kitabList,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get kitab by ID
   */
  async getKitabById(id: string) {
    const kitab = await prisma.kitabKuning.findUnique({
      where: { id },
      include: {
        _count: { select: { progressRecords: true } },
      },
    });

    if (!kitab) {
      throw Errors.notFound('Kitab not found');
    }

    return kitab;
  }

  /**
   * Create kitab
   */
  async createKitab(input: CreateKitabInput, actorId?: string) {
    // Claim the cover before the row references it, so a concurrent discard of
    // a just-uploaded file cannot delete it between its reference probe and
    // this insert (BUG 4 / flag 9).
    const holderId = actorId ?? 'kitab';
    let claim: BlobClaimHandle | null = null;
    if (input.coverUrl) {
      claim = await claimBlobForRecord(input.coverUrl, holderId);
      if (!claim) {
        throw Errors.conflict('Sampul kitab sedang diproses pihak lain; unggah ulang berkas');
      }
    }
    try {
      const kitab = await prisma.kitabKuning.create({
        data: {
          title: input.title,
          author: input.author,
          category: input.category,
          level: input.level,
          totalPages: input.totalPages,
          totalBab: input.totalBab,
          description: input.description,
          coverUrl: input.coverUrl,
          isActive: input.isActive ?? true,
        },
      });

      return kitab;
    } finally {
      if (input.coverUrl) {
        if (claim) await releaseBlobClaimById(claim).catch(() => undefined);
      }
    }
  }

  /**
   * Update kitab
   */
  async updateKitab(id: string, input: UpdateKitabInput, actorId?: string) {
    await this.getKitabById(id);

    // A replaced cover is a new blob reference (flag 9).
    const holderId = actorId ?? 'kitab';
    let claim: BlobClaimHandle | null = null;
    if (input.coverUrl) {
      claim = await claimBlobForRecord(input.coverUrl, holderId);
      if (!claim) {
        throw Errors.conflict('Sampul kitab sedang diproses pihak lain; unggah ulang berkas');
      }
    }
    try {
      const updated = await prisma.kitabKuning.update({
        where: { id },
        data: input,
      });

      return updated;
    } finally {
      if (input.coverUrl) {
        if (claim) await releaseBlobClaimById(claim).catch(() => undefined);
      }
    }
  }

  /**
   * Delete kitab
   */
  async deleteKitab(id: string) {
    await this.getKitabById(id);

    // Check if there are progress records
    const progressCount = await prisma.kitabProgress.count({
      where: { kitabId: id },
    });

    if (progressCount > 0) {
      throw Errors.conflict('Cannot delete kitab with existing progress records');
    }

    await prisma.kitabKuning.delete({ where: { id } });

    return { success: true };
  }

  // ==================
  // PROGRESS METHODS
  // ==================

  /**
   * List progress records
   */
  async listProgress(query: ListProgressQuery, currentUser: AuthenticatedUser) {
    const { page, limit, kitabId, studentId, teacherId, academicYearId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.KitabProgressWhereInput = {};

    if (kitabId) {
      where.kitabId = kitabId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (teacherId) {
      where.teacherId = teacherId;
    }

    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    // Filter by unit if not super admin
    if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.unitId) {
      where.student = { unitId: currentUser.unitId };
    }

    const [records, total] = await Promise.all([
      prisma.kitabProgress.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          kitab: {
            select: {
              id: true,
              title: true,
              author: true,
              category: true,
              level: true,
              totalPages: true,
            },
          },
          student: { include: { user: { select: { name: true } } } },
          teacher: { include: { user: { select: { name: true } } } },
          academicYear: { select: { id: true, name: true } },
        },
      }),
      prisma.kitabProgress.count({ where }),
    ]);

    return {
      data: records,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Update or create progress
   */
  async updateProgress(input: UpdateProgressInput, currentUser: AuthenticatedUser) {
    const { kitabId, studentId, teacherId, academicYearId, currentPage, currentBab, grade, notes } =
      input;

    // Verify kitab exists
    await this.getKitabById(kitabId);

    // Verify student
    const student = await prisma.student.findUnique({
      where: { id: studentId, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student not found');
    }

    // Check unit access
    if (currentUser.role !== UserRole.SUPER_ADMIN && student.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    // Upsert progress
    const progress = await prisma.kitabProgress.upsert({
      where: {
        kitabId_studentId_academicYearId: {
          kitabId,
          studentId,
          academicYearId,
        },
      },
      update: {
        teacherId,
        currentPage: currentPage ?? undefined,
        currentBab: currentBab ?? undefined,
        grade,
        notes,
      },
      create: {
        kitabId,
        studentId,
        teacherId,
        academicYearId,
        currentPage: currentPage ?? 0,
        currentBab: currentBab ?? 0,
        grade,
        notes,
      },
      include: {
        kitab: { select: { title: true, totalPages: true } },
        student: { include: { user: { select: { name: true } } } },
        teacher: { include: { user: { select: { name: true } } } },
      },
    });

    return progress;
  }

  /**
   * Mark kitab as completed
   */
  async markCompleted(progressId: string, grade: string, currentUser: AuthenticatedUser) {
    const progress = await prisma.kitabProgress.findUnique({
      where: { id: progressId },
      include: { student: true },
    });

    if (!progress) {
      throw Errors.notFound('Progress record not found');
    }

    if (
      currentUser.role !== UserRole.SUPER_ADMIN &&
      progress.student.unitId !== currentUser.unitId
    ) {
      throw Errors.forbidden('Access denied');
    }

    const updated = await prisma.kitabProgress.update({
      where: { id: progressId },
      data: {
        completedAt: new Date(),
        grade,
      },
    });

    return updated;
  }

  // ==================
  // STATISTICS
  // ==================

  /**
   * Get statistics
   */
  async getStatistics(unitId?: string, academicYearId?: string) {
    const where: Prisma.KitabProgressWhereInput = {};

    if (unitId) {
      where.student = { unitId };
    }

    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    const [totalKitab, totalProgress, completedProgress, byCategory] = await Promise.all([
      prisma.kitabKuning.count({ where: { isActive: true } }),
      prisma.kitabProgress.count({ where }),
      prisma.kitabProgress.count({ where: { ...where, completedAt: { not: null } } }),
      prisma.kitabKuning.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
    ]);

    return {
      totalKitab,
      totalProgress,
      completedProgress,
      completionRate: totalProgress > 0 ? (completedProgress / totalProgress) * 100 : 0,
      byCategory: byCategory.map((item) => ({
        category: item.category,
        count: item._count.category,
      })),
    };
  }

  /**
   * Get student report
   */
  async getStudentReport(studentId: string, currentUser: AuthenticatedUser) {
    const student = await prisma.student.findUnique({
      where: { id: studentId, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && student.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const progress = await prisma.kitabProgress.findMany({
      where: { studentId },
      include: {
        kitab: true,
        teacher: { include: { user: { select: { name: true } } } },
        academicYear: { select: { name: true } },
      },
      orderBy: [{ academicYear: { name: 'desc' } }, { kitab: { level: 'asc' } }],
    });

    const completed = progress.filter((p) => p.completedAt !== null);

    return {
      studentId,
      totalKitab: progress.length,
      completedKitab: completed.length,
      inProgressKitab: progress.length - completed.length,
      progress,
    };
  }
}

export const kitabProgressService = new KitabProgressService();
