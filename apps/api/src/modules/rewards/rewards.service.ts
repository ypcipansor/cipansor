import { prisma } from '../../lib/prisma';
import { CreateRewardDto, UpdateRewardDto, QueryRewardDto } from './rewards.schema';

export async function createReward(data: CreateRewardDto, givenById: string) {
  return prisma.reward.create({
    data: {
      ...data,
      givenAt: data.givenAt ? new Date(data.givenAt) : new Date(),
      givenById,
    } as any,
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      givenBy: { select: { id: true, name: true } },
    },
  });
}

export async function getRewards(query: QueryRewardDto) {
  const { studentId, category, startDate, endDate, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(studentId && { studentId }),
    ...(category && { category: { contains: category, mode: 'insensitive' as const } }),
    ...(startDate || endDate
      ? {
          givenAt: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.reward.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        givenBy: { select: { id: true, name: true } },
      },
      orderBy: { givenAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.reward.count({ where }),
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

export async function getRewardById(id: string) {
  return prisma.reward.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      givenBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateReward(id: string, data: UpdateRewardDto) {
  return prisma.reward.update({
    where: { id },
    data: {
      ...data,
      ...(data.givenAt && { givenAt: new Date(data.givenAt) }),
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      givenBy: { select: { id: true, name: true } },
    },
  });
}

export async function deleteReward(id: string) {
  return prisma.reward.delete({ where: { id } });
}

export async function getStudentRewardPoints(studentId: string) {
  const result = await prisma.reward.aggregate({
    where: { studentId },
    _sum: { points: true },
  });
  return result._sum.points || 0;
}

export async function getStudentRewardSummary(studentId: string) {
  const rewards = await prisma.reward.findMany({
    where: { studentId },
    orderBy: { givenAt: 'desc' },
    take: 10,
  });

  const totalPoints = await getStudentRewardPoints(studentId);

  const byCategory = await prisma.reward.groupBy({
    by: ['category'],
    where: { studentId },
    _count: true,
    _sum: { points: true },
    orderBy: { _count: { category: 'desc' } },
  });

  return {
    totalPoints,
    recentRewards: rewards,
    byCategory,
  };
}

export async function getStudentPointBalance(studentId: string) {
  const [rewardPoints, violationPoints] = await Promise.all([
    prisma.reward.aggregate({
      where: { studentId },
      _sum: { points: true },
    }),
    prisma.violation.aggregate({
      where: { studentId },
      _sum: { points: true },
    }),
  ]);

  const earned = rewardPoints._sum.points || 0;
  const deducted = violationPoints._sum.points || 0;

  return {
    earned,
    deducted,
    balance: earned - deducted,
  };
}

export async function getRewardCategories() {
  const categories = await prisma.reward.groupBy({
    by: ['category'],
    _count: true,
    orderBy: { _count: { category: 'desc' } },
  });
  return categories.map((c) => c.category);
}

/**
 * The UI addresses a "reward type" by the free-text `category` string
 * (`/rewards/types/tahfidz/edit`), but there is no RewardType table — the
 * category is just a column on Reward. Aggregate the rows carrying that
 * category into the `{id, name, category, points}` shape the edit form reads,
 * so the detail-by-id route answers instead of 404ing. Returns null when no
 * reward uses the category, which the controller turns into a 404.
 */
export async function getRewardCategoryById(category: string) {
  const agg = await prisma.reward.aggregate({
    where: { category: { equals: category, mode: 'insensitive' } },
    _count: true,
    _sum: { points: true },
    _max: { points: true },
  });
  if (!agg._count) return null;
  return {
    id: category,
    name: category.charAt(0).toUpperCase() + category.slice(1),
    category: category.toUpperCase(),
    points: agg._max.points ?? 0,
    count: agg._count,
    isActive: true,
  };
}

export async function getTopStudentsByPoints(unitId?: string, limit = 10) {
  const where = unitId ? { student: { unitId } } : {};

  const rewards = await prisma.reward.groupBy({
    by: ['studentId'],
    where,
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: limit,
  });

  const studentIds = rewards.map((r) => r.studentId);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, name: true } },
    },
  });

  return rewards.map((r) => ({
    student: students.find((s) => s.id === r.studentId),
    points: r._sum.points || 0,
  }));
}
