import { describe, it, expect, vi, beforeEach } from 'vitest';
import { perencanaanService } from '../perencanaan.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    planObjective: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    strategicPlan: {
      update: vi.fn(),
    },
  },
}));

describe('PerencanaanService - Aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should recalculate objective progress from indicators', async () => {
    const mockObjective = {
      id: 'obj-1',
      planId: 'plan-1',
      indicators: [
        { targetValue: 100, currentValue: 50 },
        { targetValue: 200, currentValue: 150 },
      ],
    };

    (prisma.planObjective.findUnique as any).mockResolvedValue(mockObjective);
    (prisma.planObjective.findMany as any).mockResolvedValue([{ weight: 1, progress: 62.5 }]);

    await perencanaanService.recalculateObjectiveProgress('obj-1');

    // Indicator 1: 50/100 = 50%
    // Indicator 2: 150/200 = 75%
    // Average: (50 + 75) / 2 = 62.5%
    expect(prisma.planObjective.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'obj-1' },
        data: { progress: 62.5 },
      })
    );
  });
});
