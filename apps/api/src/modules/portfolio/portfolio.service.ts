/**
 * Portfolio Service - Digital Student Portfolio
 *
 * Mengelola portofolio digital siswa yang mencakup:
 * - Karya akademik
 * - Proyek P5
 * - Prestasi ekstrakurikuler
 * - Pencapaian dan penghargaan
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

// Portfolio types and categories
export const PORTFOLIO_TYPES = [
  { value: 'ACADEMIC', label: 'Karya Akademik', icon: 'BookOpen' },
  { value: 'P5_PROJECT', label: 'Proyek P5', icon: 'Target' },
  { value: 'EXTRACURRICULAR', label: 'Ekstrakurikuler', icon: 'Medal' },
  { value: 'ACHIEVEMENT', label: 'Prestasi', icon: 'Trophy' },
  { value: 'ARTWORK', label: 'Karya Seni', icon: 'Palette' },
  { value: 'TAHFIDZ', label: 'Tahfidz', icon: 'BookMarked' },
  { value: 'OTHER', label: 'Lainnya', icon: 'Folder' },
];

export const PORTFOLIO_CATEGORIES = {
  ACADEMIC: ['Tugas', 'Proyek', 'Penelitian', 'Presentasi', 'Laporan'],
  P5_PROJECT: [
    'Gaya Hidup Berkelanjutan',
    'Kearifan Lokal',
    'Bhinneka Tunggal Ika',
    'Bangunlah Jiwa dan Raganya',
    'Suara Demokrasi',
    'Berekayasa dan Berteknologi',
  ],
  EXTRACURRICULAR: ['Olahraga', 'Seni', 'Pramuka', 'PMR', 'Robotik', 'Jurnalistik', 'Bahasa'],
  ACHIEVEMENT: [
    'Lomba Akademik',
    'Lomba Non-Akademik',
    'Penghargaan Sekolah',
    'Penghargaan Eksternal',
  ],
  ARTWORK: ['Lukisan', 'Gambar', 'Fotografi', 'Desain Grafis', 'Kerajinan', 'Musik'],
  TAHFIDZ: ['Hafalan Juz', 'Setoran Harian', "Muroja'ah"],
  OTHER: ['Lainnya'],
};

// =====================================
// PORTFOLIO CRUD
// =====================================

export interface CreatePortfolioDto {
  studentId: string;
  title: string;
  type: string;
  category?: string;
  description?: string;
  reflection?: string;
  academicYearId?: string;
  subjectId?: string;
  classId?: string;
  isPublic?: boolean;
  isShowcase?: boolean;
}

export async function createPortfolio(data: CreatePortfolioDto) {
  return prisma.portfolio.create({
    data,
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      files: true,
    },
  });
}

export async function getPortfolios(params: {
  studentId?: string;
  unitId?: string;
  type?: string;
  category?: string;
  academicYearId?: string;
  isPublic?: boolean;
  isShowcase?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const {
    studentId,
    unitId,
    type,
    category,
    academicYearId,
    isPublic,
    isShowcase,
    search,
    page = 1,
    limit = 20,
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.PortfolioWhereInput = {};
  if (studentId) where.studentId = studentId;
  if (type) where.type = type;
  if (category) where.category = category;
  if (academicYearId) where.academicYearId = academicYearId;
  if (isPublic !== undefined) where.isPublic = isPublic;
  if (isShowcase !== undefined) where.isShowcase = isShowcase;
  if (unitId) {
    where.student = { unitId };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.portfolio.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            nisn: true, nik: true,
            user: { select: { name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        files: {
          where: { isCover: true },
          take: 1,
        },
        _count: {
          select: { files: true, comments: true },
        },
      },
    }),
    prisma.portfolio.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPortfolioById(id: string) {
  return prisma.portfolio.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      academicYear: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      files: {
        orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
      },
      comments: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function updatePortfolio(id: string, data: Partial<CreatePortfolioDto>) {
  return prisma.portfolio.update({
    where: { id },
    data,
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      files: true,
    },
  });
}

export async function deletePortfolio(id: string) {
  // Delete files first
  await prisma.portfolioFile.deleteMany({ where: { portfolioId: id } });
  await prisma.portfolioComment.deleteMany({ where: { portfolioId: id } });
  return prisma.portfolio.delete({ where: { id } });
}

// =====================================
// PORTFOLIO FILES
// =====================================

export async function addPortfolioFile(data: {
  portfolioId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  isCover?: boolean;
}) {
  // If setting as cover, unset other covers
  if (data.isCover) {
    await prisma.portfolioFile.updateMany({
      where: { portfolioId: data.portfolioId, isCover: true },
      data: { isCover: false },
    });
  }

  // Get next sort order
  const lastFile = await prisma.portfolioFile.findFirst({
    where: { portfolioId: data.portfolioId },
    orderBy: { sortOrder: 'desc' },
  });
  const sortOrder = (lastFile?.sortOrder || 0) + 1;

  return prisma.portfolioFile.create({
    data: {
      ...data,
      sortOrder,
    },
  });
}

export async function updatePortfolioFile(
  id: string,
  data: { isCover?: boolean; sortOrder?: number }
) {
  if (data.isCover) {
    const file = await prisma.portfolioFile.findUnique({ where: { id } });
    if (file) {
      await prisma.portfolioFile.updateMany({
        where: { portfolioId: file.portfolioId, isCover: true },
        data: { isCover: false },
      });
    }
  }
  return prisma.portfolioFile.update({
    where: { id },
    data,
  });
}

export async function deletePortfolioFile(id: string) {
  return prisma.portfolioFile.delete({ where: { id } });
}

// =====================================
// PORTFOLIO COMMENTS
// =====================================

export async function addPortfolioComment(data: {
  portfolioId: string;
  userId: string;
  content: string;
}) {
  return prisma.portfolioComment.create({
    data,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export async function updatePortfolioComment(id: string, content: string) {
  return prisma.portfolioComment.update({
    where: { id },
    data: { content },
  });
}

export async function deletePortfolioComment(id: string) {
  return prisma.portfolioComment.delete({ where: { id } });
}

// =====================================
// PORTFOLIO REVIEW
// =====================================

export async function reviewPortfolio(
  id: string,
  reviewData: {
    reviewedBy: string;
    score?: number;
    feedback?: string;
  }
) {
  return prisma.portfolio.update({
    where: { id },
    data: {
      reviewedBy: reviewData.reviewedBy,
      reviewedAt: new Date(),
      score: reviewData.score,
      feedback: reviewData.feedback,
    },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      reviewer: { select: { id: true, name: true } },
    },
  });
}

// =====================================
// PORTFOLIO STATISTICS
// =====================================

export async function getPortfolioStatistics(params: {
  studentId?: string;
  unitId?: string;
  academicYearId?: string;
}) {
  const { studentId, unitId, academicYearId } = params;

  const where: Prisma.PortfolioWhereInput = {};
  if (studentId) where.studentId = studentId;
  if (academicYearId) where.academicYearId = academicYearId;
  if (unitId) {
    where.student = { unitId };
  }

  const portfolios = await prisma.portfolio.findMany({
    where,
    select: {
      type: true,
      score: true,
      isShowcase: true,
      reviewedAt: true,
    },
  });

  const stats = {
    total: portfolios.length,
    byType: {} as Record<string, number>,
    showcaseCount: 0,
    reviewedCount: 0,
    averageScore: 0,
  };

  let scoreSum = 0;
  let scoreCount = 0;

  for (const p of portfolios) {
    stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
    if (p.isShowcase) stats.showcaseCount++;
    if (p.reviewedAt) stats.reviewedCount++;
    if (p.score) {
      scoreSum += (p.score as Decimal).toNumber();
      scoreCount++;
    }
  }

  if (scoreCount > 0) {
    stats.averageScore = scoreSum / scoreCount;
  }

  return stats;
}

// =====================================
// STUDENT SHOWCASE (PUBLIC PORTFOLIO VIEW)
// =====================================

export async function getStudentShowcase(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      nisn: true, nik: true,
      user: { select: { name: true } },
      unit: { select: { name: true } },
      photoUrl: true,
    },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  const showcasePortfolios = await prisma.portfolio.findMany({
    where: {
      studentId,
      OR: [{ isShowcase: true }, { isPublic: true }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      files: {
        where: { isCover: true },
        take: 1,
      },
    },
  });

  // Get achievements
  const achievements = await prisma.reward.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Get tahfidz summary
  const tahfidzStats = await prisma.tahfidzRecord.aggregate({
    where: { studentId },
    _count: true,
    _sum: { totalAyah: true },
  });

  return {
    student,
    portfolios: showcasePortfolios,
    achievements,
    tahfidz: {
      totalRecords: tahfidzStats._count,
      totalAyah: tahfidzStats._sum?.totalAyah || 0,
    },
  };
}
