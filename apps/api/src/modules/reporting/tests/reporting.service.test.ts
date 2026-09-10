import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportingService } from '../reporting.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    invoice: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    student: { findMany: vi.fn(), count: vi.fn() },
    classEnrollment: { findMany: vi.fn() },
    attendance: { groupBy: vi.fn(), findMany: vi.fn() },
    tahfidzProgress: { findMany: vi.fn() },
    violation: { findMany: vi.fn() },
    reward: { findMany: vi.fn() },
    hr: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn() },
}));

describe('ReportingService — unit-scoped financial reports (ISSUE #4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FINANCIAL_SUMMARY filters invoices by the invoice OWN unitId snapshot, not student.unitId', async () => {
    (prisma.invoice.aggregate as any).mockResolvedValue({
      _sum: { amount: 100, paidAmount: 40 },
      _count: 5,
    });
    (prisma.invoice.groupBy as any).mockResolvedValue([]);

    await reportingService.generateReport({
      type: 'FINANCIAL_SUMMARY',
      format: 'JSON',
      filters: { unitId: 'unit-sdit' },
    });

    const aggregateCall = (prisma.invoice.aggregate as any).mock.calls[0][0];
    expect(aggregateCall.where).toEqual({ unitId: 'unit-sdit' });
    expect(aggregateCall.where).not.toHaveProperty('student');
    expect(aggregateCall.where.student).toBeUndefined();
  });

  it('INVOICE_LIST filters invoices by the invoice OWN unitId snapshot, not student.unitId', async () => {
    (prisma.invoice.findMany as any).mockResolvedValue([]);

    await reportingService.generateReport({
      type: 'INVOICE_LIST',
      format: 'JSON',
      filters: { unitId: 'unit-smp', status: 'PAID' },
    });

    const findManyCall = (prisma.invoice.findMany as any).mock.calls[0][0];
    expect(findManyCall.where.unitId).toBe('unit-smp');
    expect(findManyCall.where.student).toBeUndefined();
  });
});