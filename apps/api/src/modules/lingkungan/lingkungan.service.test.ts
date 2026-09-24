import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { lingkunganService } from './lingkungan.service';
import { Prisma } from '@prisma/client';

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    environmentProgram: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    wasteManagement: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    greenCampusIndicator: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Lingkungan Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Programs', () => {
    it('should get programs with unit filter', async () => {
      vi.mocked(prisma.environmentProgram.findMany).mockResolvedValue([
        { id: 'prog-1', title: 'Go Green' },
      ] as any);

      // Must pass empty query object to avoid TypeError on undefined 'status'
      await lingkunganService.getPrograms('unit-1', {});

      expect(prisma.environmentProgram.findMany).toHaveBeenCalledWith({
        where: { unitId: 'unit-1' },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should create program', async () => {
      const dto = {
        unitId: 'unit-1',
        title: 'Penanaman Pohon',
        description: 'Tanam 1000 pohon',
        category: 'GREENER',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        budget: 5000000,
        picId: 'user-1',
      };

      vi.mocked(prisma.environmentProgram.create).mockResolvedValue({
        id: 'prog-1',
        ...dto,
      } as any);

      const result = await lingkunganService.createProgram(dto as any);

      expect(prisma.environmentProgram.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Penanaman Pohon',
          category: 'GREENER',
          budget: new Prisma.Decimal(5000000),
          pic: { connect: { id: 'user-1' } },
          unit: { connect: { id: 'unit-1' } },
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('prog-1');
    });
  });

  describe('Waste Management', () => {
    it('should create waste record', async () => {
      const dto = {
        unitId: 'unit-1',
        category: 'ORGANIC' as any,
        weight: 10.5,
        method: 'COMPOSTING',
        recordDate: new Date().toISOString(),
        notes: 'Sisa makanan',
        recordedById: 'user-1',
      };

      vi.mocked(prisma.wasteManagement.create).mockResolvedValue({ id: 'waste-1', ...dto } as any);

      await lingkunganService.createWasteRecord(dto);

      expect(prisma.wasteManagement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'ORGANIC',
          weight: 10.5,
          method: 'COMPOSTING',
        }),
        include: expect.any(Object),
      });
    });

    it('should calculate waste summary correctly', async () => {
      vi.mocked(prisma.wasteManagement.findMany).mockResolvedValue([
        { category: 'ORGANIC', weight: 10, method: 'COMPOSTING' },
        { category: 'INORGANIC', weight: 5, method: 'RECYCLING' },
        { category: 'ORGANIC', weight: 20, method: 'BIOGAS' },
        { category: 'INORGANIC', weight: 10, method: 'LANDFILL' },
      ] as any);

      const summary = await lingkunganService.getWasteSummary('unit-1');

      expect(summary.totalWeight).toBe(45); // 10 + 5 + 20 + 10
      expect(summary.totalRecords).toBe(4);
      expect(summary.byCategory['ORGANIC']).toBe(30);
      expect(summary.byCategory['INORGANIC']).toBe(15);
      expect(summary.byMethod['COMPOSTING']).toBe(10);
      expect(summary.byMethod['RECYCLING']).toBe(5);
    });
  });

  describe('Green Indicators', () => {
    it('should create indicator', async () => {
      const dto = {
        name: 'Listrik',
        category: 'ENERGY',
        targetValue: 100,
        currentValue: 80,
        unit: 'kWh',
        period: 'MONTHLY',
        recordDate: new Date().toISOString(),
        unitId: 'unit-1',
      };

      vi.mocked(prisma.greenCampusIndicator.create).mockResolvedValue({
        id: 'ind-1',
        ...dto,
      } as any);

      await lingkunganService.createIndicator(dto);

      expect(prisma.greenCampusIndicator.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Listrik',
          category: 'ENERGY',
          targetValue: 100,
          currentValue: 80,
        }),
      });
    });
  });
});
