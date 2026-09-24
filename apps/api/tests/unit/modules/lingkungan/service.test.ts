import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnvironmentProgram, mockWasteManagement, mockGreenCampusIndicator } = vi.hoisted(
  () => ({
    mockEnvironmentProgram: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockWasteManagement: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    mockGreenCampusIndicator: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  })
);

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    environmentProgram = mockEnvironmentProgram;
    wasteManagement = mockWasteManagement;
    greenCampusIndicator = mockGreenCampusIndicator;
  },
  Prisma: {
    Decimal: class {
      constructor(v: number) {
        return v;
      }
    },
  },
}));

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    environmentProgram: mockEnvironmentProgram,
    wasteManagement: mockWasteManagement,
    greenCampusIndicator: mockGreenCampusIndicator,
  },
}));

import { LingkunganService } from '../../../../src/modules/lingkungan/lingkungan.service';

describe('LingkunganService', () => {
  let service: LingkunganService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LingkunganService();
  });

  describe('createProgram', () => {
    it('should create an environment program', async () => {
      const mockResult = {
        id: 'prog-1',
        title: 'Penghijauan Area Sekolah',
        category: 'Penghijauan',
        status: 'PLANNED',
        unit: { id: 'unit-1', name: 'Unit A' },
        pic: null,
      };

      mockEnvironmentProgram.create.mockResolvedValue(mockResult);

      const result = await service.createProgram({
        title: 'Penghijauan Area Sekolah',
        category: 'Penghijauan',
        unitId: 'unit-1',
      });

      expect(result.title).toBe('Penghijauan Area Sekolah');
      expect(result.status).toBe('PLANNED');
    });
  });

  describe('createWasteRecord', () => {
    it('should record waste management data', async () => {
      const mockResult = {
        id: 'waste-1',
        category: 'ORGANIC',
        weight: 25.5,
        method: 'Kompos',
        recordedBy: { id: 'user-1', name: 'Staff' },
      };

      mockWasteManagement.create.mockResolvedValue(mockResult);

      const result = await service.createWasteRecord({
        category: 'ORGANIC',
        weight: 25.5,
        method: 'Kompos',
        recordDate: '2025-03-01T00:00:00.000Z',
        unitId: 'unit-1',
        recordedById: 'user-1',
      });

      expect(result.weight).toBe(25.5);
      expect(result.category).toBe('ORGANIC');
    });
  });

  describe('getWasteSummary', () => {
    it('should aggregate waste data by category and method', async () => {
      mockWasteManagement.findMany.mockResolvedValue([
        { category: 'ORGANIC', weight: 10, method: 'Kompos' },
        { category: 'ORGANIC', weight: 15, method: 'Kompos' },
        { category: 'INORGANIC', weight: 8, method: 'Daur Ulang' },
        { category: 'PAPER', weight: 5, method: 'Daur Ulang' },
      ]);

      const result = await service.getWasteSummary('unit-1');

      expect(result.totalWeight).toBe(38);
      expect(result.totalRecords).toBe(4);
      expect(result.byCategory.ORGANIC).toBe(25);
      expect(result.byCategory.INORGANIC).toBe(8);
      expect(result.byMethod['Kompos']).toBe(25);
      expect(result.byMethod['Daur Ulang']).toBe(13);
    });

    it('should handle empty records', async () => {
      mockWasteManagement.findMany.mockResolvedValue([]);

      const result = await service.getWasteSummary('unit-1');

      expect(result.totalWeight).toBe(0);
      expect(result.totalRecords).toBe(0);
    });
  });

  describe('createIndicator', () => {
    it('should create a green campus indicator', async () => {
      const mockResult = {
        id: 'ind-1',
        name: 'Konsumsi Energi',
        category: 'Energi',
        targetValue: 100,
        currentValue: 0,
      };

      mockGreenCampusIndicator.create.mockResolvedValue(mockResult);

      const result = await service.createIndicator({
        name: 'Konsumsi Energi',
        category: 'Energi',
        targetValue: 100,
        unit: 'kWh',
        period: 'Bulanan',
        recordDate: '2025-03-01T00:00:00.000Z',
        unitId: 'unit-1',
      });

      expect(result.name).toBe('Konsumsi Energi');
      expect(result.targetValue).toBe(100);
    });
  });

  describe('deleteProgram', () => {
    it('should delete a program', async () => {
      mockEnvironmentProgram.delete.mockResolvedValue({ id: 'prog-1' });
      await service.deleteProgram('prog-1');
      expect(mockEnvironmentProgram.delete).toHaveBeenCalledWith({ where: { id: 'prog-1' } });
    });
  });
});
