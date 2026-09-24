import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMonthlyDepreciation } from './depreciation.service';
import { prisma } from '../../lib/prisma';
import * as inventoryService from './inventory.service';
import * as assetAccountingService from './asset-accounting.service';

// Mock Prisma Client Enums
vi.mock('@prisma/client', () => ({
  AssetStatus: {
    ACTIVE: 'ACTIVE',
    MAINTENANCE: 'MAINTENANCE',
    DAMAGED: 'DAMAGED',
    DISPOSED: 'DISPOSED',
  },
  Prisma: {
    Decimal: vi.fn((v) => ({ toNumber: () => Number(v) })),
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
    },
    journalEntry: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return await cb({
        // Minimal mock for transaction client
      });
    }),
  },
}));

vi.mock('./inventory.service', () => ({
  calculateDepreciation: vi.fn(),
}));

vi.mock('./asset-accounting.service', () => ({
  createDepreciationJournal: vi.fn(),
}));

describe('DepreciationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runMonthlyDepreciation', () => {
    it('should process assets and create journals', async () => {
      const mockAssets = [
        { id: '1', code: 'A01', purchasePrice: 1000, usefulLife: 10, unitId: 'u1' },
        { id: '2', code: 'A02', purchasePrice: 2000, usefulLife: 20, unitId: 'u1' },
      ];

      (prisma.asset.findMany as any).mockResolvedValue(mockAssets);
      (prisma.journalEntry.findMany as any).mockResolvedValue([]); // No existing journals

      (inventoryService.calculateDepreciation as any).mockImplementation((id: string) => {
        if (id === '1')
          return Promise.resolve({ monthlyDepreciation: 100, bookValue: 900, residual: 0 });
        if (id === '2')
          return Promise.resolve({ monthlyDepreciation: 100, bookValue: 1900, residual: 0 });
        return Promise.resolve(null);
      });

      const results = await runMonthlyDepreciation('u1', new Date(), 'user1');

      expect(results.processed).toBe(2);
      expect(results.journals).toBe(2);
      expect(assetAccountingService.createDepreciationJournal).toHaveBeenCalledTimes(2);
    });

    it('should skip already processed assets', async () => {
      const mockAssets = [
        { id: '1', code: 'A01', purchasePrice: 1000, usefulLife: 10, unitId: 'u1' },
      ];

      (prisma.asset.findMany as any).mockResolvedValue(mockAssets);
      (prisma.journalEntry.findMany as any).mockResolvedValue([{ reference: '1' }]);

      const results = await runMonthlyDepreciation('u1', new Date(), 'user1');

      expect(results.processed).toBe(0);
      expect(assetAccountingService.createDepreciationJournal).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mockAssets = [
        { id: '1', code: 'A01', purchasePrice: 1000, usefulLife: 10, unitId: 'u1' },
      ];

      (prisma.asset.findMany as any).mockResolvedValue(mockAssets);
      (prisma.journalEntry.findMany as any).mockResolvedValue([]);
      (inventoryService.calculateDepreciation as any).mockRejectedValue(new Error('Test Error'));

      const results = await runMonthlyDepreciation('u1', new Date(), 'user1');

      expect(results.processed).toBe(0);
      expect(results.errors).toContain('Failed to process asset A01: Test Error');
    });
  });
});
