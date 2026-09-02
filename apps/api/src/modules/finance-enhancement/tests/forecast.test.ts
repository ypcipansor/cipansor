import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';

// Mock prisma before importing the service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    accountCode: {
      findMany: vi.fn(),
    },
    journalEntry: {
      aggregate: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
    purchaseRequest: {
      findMany: vi.fn(),
    },
  },
}));

// Now import the service
import { getCashFlowForecast } from '../reporting.service';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@cipansor/shared';

describe('Finance Forecasting Logic', () => {
  const unitId = 'unit-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate forecast correctly with inflows and outflows', async () => {
    // 1. Current Balance Mock: 10M
    (prisma.accountCode.findMany as any).mockResolvedValue([
      { id: 'acc-1', name: 'Kas Utama', code: '1-101', type: AccountType.ASSET },
    ]);
    (prisma.journalEntry.aggregate as any).mockResolvedValue({
      _sum: { debit: new Decimal(15000000), credit: new Decimal(5000000) },
    });

    // 2. Pending Invoices (Inflow): 5M next month
    // Set date to 15th to avoid end-of-month rollover issues (e.g., Aug 31 -> Oct 1)
    const nextMonth = new Date();
    nextMonth.setDate(15);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    (prisma.invoice.findMany as any).mockResolvedValue([
      {
        dueDate: nextMonth,
        amount: new Decimal(5000000),
        paidAmount: new Decimal(0),
      },
    ]);

    // 3. Approved PRs (Outflow): 2M next month
    (prisma.purchaseRequest.findMany as any).mockResolvedValue([
      {
        date: nextMonth,
        totalEstimated: new Decimal(2000000),
      },
    ]);

    const result = await getCashFlowForecast(unitId, 3);

    expect(result.initialBalance).toBe(10000000);
    expect(result.forecast).toHaveLength(3);

    // Month 1 (Current Month): No specific items mocked, flow 0
    expect(result.forecast[0].income).toBe(0);
    expect(result.forecast[0].expense).toBe(0);
    expect(result.forecast[0].balance).toBe(10000000);

    // Month 2 (Next Month): 5M in, 2M out -> +3M
    expect(result.forecast[1].income).toBe(5000000);
    expect(result.forecast[1].expense).toBe(2000000);
    expect(result.forecast[1].netFlow).toBe(3000000);
    expect(result.forecast[1].balance).toBe(13000000);
  });
});
