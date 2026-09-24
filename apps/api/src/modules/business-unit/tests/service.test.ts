import { describe, it, expect, vi, beforeEach } from 'vitest';
import { businessUnitService } from '../business-unit.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    businessUnit: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    canteenTransaction: { groupBy: vi.fn() },
    laundryTransaction: { groupBy: vi.fn() },
  },
}));

describe('BusinessUnitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list business units with current-month revenue', async () => {
    const mockBUs = [
      { id: '1', name: 'Kantin A' },
      { id: '2', name: 'Laundry B' },
    ];
    (prisma.businessUnit.findMany as any).mockResolvedValue(mockBUs);
    (prisma.canteenTransaction.groupBy as any).mockResolvedValue([
      { businessUnitId: '1', _sum: { total: 150000 }, _count: { id: 12 } },
    ]);
    (prisma.laundryTransaction.groupBy as any).mockResolvedValue([
      { businessUnitId: '2', _sum: { total: 80000 }, _count: { id: 4 } },
    ]);

    const result = await businessUnitService.list({ unitId: 'unit-1' });

    expect(result).toEqual([
      { id: '1', name: 'Kantin A', monthlyRevenue: 150000, monthlyTransactions: 12 },
      { id: '2', name: 'Laundry B', monthlyRevenue: 80000, monthlyTransactions: 4 },
    ]);
    expect(prisma.businessUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unitId: 'unit-1' }),
      })
    );
  });

  it('should create a business unit', async () => {
    const data = { unitId: 'u1', name: 'Test BU', code: 'BU01', type: 'CANTEEN' as any };
    (prisma.businessUnit.findUnique as any).mockResolvedValue(null);
    (prisma.businessUnit.create as any).mockResolvedValue({ id: 'bu1', ...data });

    const result = await businessUnitService.create(data);

    expect(result.id).toBe('bu1');
    expect(prisma.businessUnit.create).toHaveBeenCalled();
  });

  it('should getById with unitId scoping', async () => {
    const mockBU = { id: 'bu1', unitId: 'unit-1', name: 'Kantin A' };
    (prisma.businessUnit.findFirst as any).mockResolvedValue(mockBU);

    const result = await businessUnitService.getById('bu1', 'unit-1');

    expect(result).toEqual(mockBU);
    expect(prisma.businessUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'bu1', unitId: 'unit-1' }),
      })
    );
  });

  it('should throw notFound when getById targets a different unit', async () => {
    (prisma.businessUnit.findFirst as any).mockResolvedValue(null);

    await expect(businessUnitService.getById('bu1', 'other-unit')).rejects.toThrow();
  });
});
