import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSPMBStats } from './analytics.service';

vi.mock('@prisma/client', () => ({
  Prisma: {},
  Gender: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    admissionPeriod: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    registrant: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

describe('getSPMBStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.registrant.count as any).mockResolvedValue(0);
    vi.mocked(prisma.registrant.groupBy as any).mockResolvedValue([]);
    vi.mocked(prisma.admissionPeriod.findMany as any).mockResolvedValue([]);
  });

  it('selects only the currently-running admission period (isActive + within window), not the latest startDate', async () => {
    vi.mocked(prisma.admissionPeriod.findFirst as any).mockResolvedValue({
      id: 'running-period',
    });

    await getSPMBStats('unit-1');

    // The period query must be constrained to a live window, not just the most
    // recent startDate. A future-dated period must never shadow a running intake.
    expect(prisma.admissionPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          startDate: expect.objectContaining({ lte: expect.any(Date) }),
          endDate: expect.objectContaining({ gte: expect.any(Date) }),
          unitId: 'unit-1',
        }),
      })
    );

    // Registrants are scoped to the running period.
    expect(prisma.registrant.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          admissionPeriodId: 'running-period',
        }),
      })
    );
  });

  it('does not constrain registrants to any period when no period is currently running', async () => {
    vi.mocked(prisma.admissionPeriod.findFirst as any).mockResolvedValue(null);

    await getSPMBStats('unit-1');

    // No period filter applied — only the unit scope remains.
    expect(prisma.registrant.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          admissionPeriod: { unitId: 'unit-1' },
        }),
      })
    );
    expect(prisma.registrant.count).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ admissionPeriodId: expect.anything() }),
      })
    );
  });
});
