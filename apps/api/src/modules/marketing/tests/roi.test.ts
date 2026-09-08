import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCampaignROI } from '../roi.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketingCampaign: {
      findMany: vi.fn(),
    },
    registrant: {
      groupBy: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

describe('Marketing ROI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate ROI correctly for multiple campaigns', async () => {
    const mockCampaigns = [
      { id: 'c1', name: 'Facebook Ads', code: 'FB01', budget: 1000, _count: { registrants: 100 } },
    ];

    vi.mocked(prisma.marketingCampaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.registrant.groupBy).mockResolvedValue([{ campaignId: 'c1', _count: { _all: 20 } }] as any);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { paidAmount: 5000, student: { registrants: [{ campaignId: 'c1' }] } }
    ] as any);

    const result = await calculateCampaignROI();

    expect(result).toHaveLength(1);
    expect(result[0].metrics.roi).toBe(400);
    expect(result[0].metrics.conversionRate).toBe(20);
  });

  it('should return empty array when no campaigns exist', async () => {
    vi.mocked(prisma.marketingCampaign.findMany).mockResolvedValue([]);
    const result = await calculateCampaignROI();
    expect(result).toEqual([]);
  });
});
