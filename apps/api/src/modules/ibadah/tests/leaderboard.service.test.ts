import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IbadahLeaderboardEntry } from '@cipansor/shared';

/**
 * A ranking row carries the santri's name, class and account — the fields
 * both ibadah pages read (`IbadahLeaderboardEntry`). The pages used to read
 * `student.name`, which no row had, so every name showed as "Unknown"; and
 * `totalPoints` already holds the bonus, so a page adding it again doubled it.
 */

const prismaMock = vi.hoisted(() => ({
  dailyIbadahRecord: { groupBy: vi.fn() },
  dailyIbadahTarget: { count: vi.fn() },
  student: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { getLeaderboard } from '../ibadah.service';

const UNIT = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.dailyIbadahRecord.groupBy
    .mockResolvedValueOnce([
      { studentId: 's1', _sum: { pointsEarned: 30, bonusEarned: 5 }, _count: { id: 7 } },
    ])
    .mockResolvedValueOnce([{ studentId: 's1', _count: { id: 6 } }]);
  prismaMock.dailyIbadahTarget.count.mockResolvedValue(1);
  prismaMock.student.findMany.mockResolvedValue([
    {
      id: 's1',
      userId: 'u-santri',
      nis: '9001',
      user: { name: 'Ahmad Fauzan' },
      enrollments: [{ class: { name: '7A' } }],
    },
  ]);
});

describe('the ibadah ranking', () => {
  it('names the santri, their class and account, with the bonus counted once', async () => {
    const result = await getLeaderboard({
      unitId: UNIT,
      periodType: 'WEEKLY',
      limit: 10,
    } as never);
    expect(result.data).toEqual<IbadahLeaderboardEntry[]>([
      expect.objectContaining({
        rank: 1,
        studentId: 's1',
        userId: 'u-santri',
        studentName: 'Ahmad Fauzan',
        nis: '9001',
        className: '7A',
        totalPoints: 35,
        bonusPoints: 5,
        recordCount: 7,
      }),
    ]);
  });
});
