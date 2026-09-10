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
    vi.mocked(prisma.registrant.groupBy).mockResolvedValue([
      { campaignId: 'c1', _count: { _all: 20 } },
    ] as any);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { paidAmount: 5000, student: { registrants: [{ campaignId: 'c1' }] } },
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

  it('should NOT credit a snapshot-less invoice to the oldest registration when a later period matches', async () => {
    const campaignIds = ['c1', 'c2'];
    const mockCampaigns = campaignIds.map((id) => ({
      id,
      name: `Campaign ${id}`,
      code: id.toUpperCase(),
      budget: 1000,
      _count: { registrants: 1 },
    }));

    vi.mocked(prisma.marketingCampaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.registrant.groupBy).mockResolvedValue(
      campaignIds.map((id) => ({
        campaignId: id,
        _count: { _all: 1 },
      })) as any
    );

    // Invoice has NO unit snapshot (historical invoice) and was billed during the
    // later registration's admission period. It must be credited to the campaign
    // that was active at billing time, NOT forced onto the oldest registration.
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        unitId: null,
        paidAmount: 5000,
        createdAt: new Date('2026-06-15'),
        dueDate: new Date('2026-06-30'),
        student: {
          registrants: [
            {
              campaignId: 'c1',
              admissionPeriod: {
                unitId: 'unit-sd',
                startDate: new Date('2026-01-01'),
                endDate: new Date('2026-03-31'),
              },
            },
            {
              campaignId: 'c2',
              admissionPeriod: {
                unitId: 'unit-smp',
                startDate: new Date('2026-04-01'),
                endDate: new Date('2026-06-30'),
              },
            },
          ],
        },
      },
    ] as any);

    const result = await calculateCampaignROI();

    const c1 = result.find((r) => r.campaignId === 'c1')!;
    const c2 = result.find((r) => r.campaignId === 'c2')!;
    // Revenue must go to the later (progression) campaign, not the oldest one.
    expect(c1.metrics.revenue).toBe(0);
    expect(c2.metrics.revenue).toBe(5000);
  });

  it('should leave a snapshot-less invoice unattributed when the period is ambiguous', async () => {
    const mockCampaigns = [
      { id: 'c1', name: 'Campaign 1', code: 'C1', budget: 1000, _count: { registrants: 1 } },
      { id: 'c2', name: 'Campaign 2', code: 'C2', budget: 1000, _count: { registrants: 1 } },
    ];
    vi.mocked(prisma.marketingCampaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.registrant.groupBy).mockResolvedValue([
      { campaignId: 'c1', _count: { _all: 1 } },
      { campaignId: 'c2', _count: { _all: 1 } },
    ] as any);

    // No unit snapshot, and the invoice date matches NO admission period, so the
    // invoice cannot be safely attributed. It must NOT default to registrants[0]
    // (which would steal revenue from a later campaign).
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        unitId: null,
        paidAmount: 5000,
        createdAt: new Date('2027-01-01'),
        dueDate: new Date('2027-01-31'),
        student: {
          registrants: [
            {
              campaignId: 'c1',
              admissionPeriod: {
                unitId: 'unit-sd',
                startDate: new Date('2026-01-01'),
                endDate: new Date('2026-03-31'),
              },
            },
            {
              campaignId: 'c2',
              admissionPeriod: {
                unitId: 'unit-smp',
                startDate: new Date('2026-04-01'),
                endDate: new Date('2026-06-30'),
              },
            },
          ],
        },
      },
    ] as any);

    const result = await calculateCampaignROI();
    expect(result.find((r) => r.campaignId === 'c1')!.metrics.revenue).toBe(0);
    expect(result.find((r) => r.campaignId === 'c2')!.metrics.revenue).toBe(0);
  });
});
