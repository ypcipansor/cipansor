import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinanceEnhancementService } from '../../../src/modules/finance-enhancement/finance-enhancement.service';
import { prisma } from '../../../src/lib/prisma';
import { AccountType } from '@cipansor/shared';

// Mock Prisma
vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    accountCode: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    journalEntry: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
    },
    financialPeriod: {
      findFirst: vi.fn(), // Added this
    },
    scholarship: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    scholarshipRecipient: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    paymentComponent: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
    purchaseRequest: {
      findMany: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    budget: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('FinanceEnhancementService', () => {
  let service: FinanceEnhancementService;

  beforeEach(() => {
    service = new FinanceEnhancementService();
    vi.clearAllMocks();
  });

  describe('Account Codes', () => {
    it('should get account codes with pagination', async () => {
      (prisma.accountCode.findMany as any).mockResolvedValue([
        { id: '1', code: '100', name: 'Assets', type: 'ASSET' },
      ]);
      (prisma.accountCode.count as any).mockResolvedValue(1);

      const result = await service.getAccountCodes({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].code).toBe('100');
      expect(prisma.accountCode.findMany).toHaveBeenCalled();
    });

    it('should create an account code', async () => {
      const input = { code: '100', name: 'Assets', type: AccountType.ASSET };
      (prisma.accountCode.findUnique as any).mockResolvedValue(null);
      (prisma.accountCode.create as any).mockResolvedValue({ id: '1', ...input });

      const result = await service.createAccountCode(input);

      expect(result.code).toBe('100');
      expect(prisma.accountCode.create).toHaveBeenCalled();
    });

    it('should throw error if account code exists', async () => {
      const input = { code: '100', name: 'Assets', type: AccountType.ASSET };
      (prisma.accountCode.findUnique as any).mockResolvedValue({ id: '1' });

      await expect(service.createAccountCode(input)).rejects.toThrow('Account code already exists');
    });
  });

  describe('Journal Entries', () => {
    it('should create a journal entry', async () => {
      const input = {
        unitId: 'u1',
        accountId: 'a1',
        date: new Date(),
        debit: 1000,
        createdById: 'user1',
      };

      // Mock period check
      (prisma.financialPeriod.findFirst as any).mockResolvedValue(null); // No closed period
      // Mock academic year lookup
      (prisma.academicYear.findFirst as any).mockResolvedValue(null);

      (prisma.journalEntry.create as any).mockResolvedValue({
        id: '1',
        unitId: input.unitId,
        accountId: input.accountId,
        date: input.date,
        debit: 1000,
        credit: 0,
        createdById: input.createdById,
        account: { normalBalance: 'DEBIT' },
      });

      const result = await service.createJournalEntry(input);

      expect(result.debit).toBe(1000);
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('Reports: Trial Balance', () => {
    it('should calculate trial balance correctly', async () => {
      // Setup mocks
      const groupByResult = [
        { accountId: 'a1', _sum: { debit: 1000, credit: 0 } },
        { accountId: 'a2', _sum: { debit: 0, credit: 1000 } },
      ];
      (prisma.journalEntry.groupBy as any).mockResolvedValue(groupByResult);

      (prisma.accountCode.findMany as any).mockResolvedValue([
        { id: 'a1', code: '100', name: 'Cash', type: 'ASSET' },
        { id: 'a2', code: '400', name: 'Revenue', type: 'REVENUE' },
      ]);

      const result = await service.getTrialBalance({
        unitId: 'u1',
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result.accounts).toHaveLength(2);
      expect(result.totals.debit).toBe(1000);
      expect(result.totals.credit).toBe(1000);
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('Reports: Income Expense', () => {
    it('should calculate income expense report correctly', async () => {
      // Mock $queryRaw response
      const mockRawData = [
        { period: '2023-10', type: 'REVENUE', total: BigInt(5000) },
        { period: '2023-10', type: 'EXPENSE', total: BigInt(-2000) },
      ];

      (prisma.$queryRaw as any).mockResolvedValue(mockRawData);

      const result = await service.getIncomeExpenseReport({
        unitId: 'u1',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        groupBy: 'month',
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result.summary.totalIncome).toBe(5000);
      expect(result.summary.totalExpense).toBe(2000);
      expect(result.summary.netIncome).toBe(3000);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].period).toBe('2023-10');
      expect(result.breakdown[0].net).toBe(3000);
    });
  });
});
