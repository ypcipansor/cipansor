import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStrategicPlan, mockPlanObjective, mockPlanIndicator, mockPlanActivity } = vi.hoisted(() => {
  return {
    mockStrategicPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockPlanObjective: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockPlanIndicator: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockPlanActivity: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    strategicPlan = mockStrategicPlan;
    planObjective = mockPlanObjective;
    planIndicator = mockPlanIndicator;
    planActivity = mockPlanActivity;
  },
  Prisma: { Decimal: class { constructor(v: number) { return v; } } },
}));

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    strategicPlan: mockStrategicPlan,
    planObjective: mockPlanObjective,
    planIndicator: mockPlanIndicator,
    planActivity: mockPlanActivity,
  },
}));

import { PerencanaanService } from '../../../../src/modules/perencanaan/perencanaan.service';

describe('PerencanaanService', () => {
  let service: PerencanaanService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PerencanaanService();
  });

  describe('createPlan', () => {
    it('should create a strategic plan with correct data', async () => {
      const mockResult = {
        id: 'plan-1',
        title: 'RENSTRA 2025-2030',
        type: 'RENSTRA',
        status: 'DRAFT',
        unitId: 'unit-1',
        createdById: 'user-1',
        unit: { id: 'unit-1', name: 'Unit A' },
        createdBy: { id: 'user-1', name: 'Admin' },
        objectives: [],
      };

      mockStrategicPlan.create.mockResolvedValue(mockResult);
      // RENSTRA harus menggantung pada RPJP — induknya wajib ada dan berjenis RPJP.
      mockStrategicPlan.findFirst.mockResolvedValue(null);
      mockStrategicPlan.findUnique.mockResolvedValue({ id: 'rpjp-1', type: 'RPJP' });

      const result = await service.createPlan({
        title: 'RENSTRA 2025-2030',
        type: 'RENSTRA',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2030-12-31T00:00:00.000Z',
        unitId: 'unit-1',
        parentId: 'rpjp-1',
        createdById: 'user-1',
      });

      expect(result.id).toBe('plan-1');
      expect(result.title).toBe('RENSTRA 2025-2030');
      expect(mockStrategicPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'RENSTRA 2025-2030',
            type: 'RENSTRA',
          }),
        })
      );
    });
  });

  describe('getPlans', () => {
    it('returns the unit’s own plans AND the foundation-wide plans, filtered by query', async () => {
      const mockPlans = [
        { id: 'plan-1', title: 'RENSTRA', type: 'RENSTRA', status: 'APPROVED' },
        { id: 'plan-2', title: 'RKAS', type: 'RKAS', status: 'DRAFT' },
      ];

      mockStrategicPlan.findMany.mockResolvedValue(mockPlans);

      const result = await service.getPlans('unit-1', { type: 'RENSTRA' });

      expect(result).toHaveLength(2);
      expect(mockStrategicPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            // A unit user sees their own unit plus the foundation-wide plans
            // (unitId null) — the yayasan's RPJP/Renstra/consolidated RKA.
            OR: [{ unitId: null }, { unitId: 'unit-1' }],
            type: 'RENSTRA',
          }),
        })
      );
    });
  });

  describe('getPlanById', () => {
    it('should return a plan with nested relations', async () => {
      const mockPlan = {
        id: 'plan-1',
        title: 'RENSTRA',
        objectives: [
          { id: 'obj-1', indicators: [], activities: [] },
        ],
      };

      mockStrategicPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.getPlanById('plan-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('plan-1');
      expect(result?.objectives).toHaveLength(1);
    });

    it('should return null for non-existent plan', async () => {
      mockStrategicPlan.findUnique.mockResolvedValue(null);
      const result = await service.getPlanById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('approvePlan', () => {
    it('should set status to APPROVED with approver info', async () => {
      const mockResult = { id: 'plan-1', status: 'APPROVED' };
      mockStrategicPlan.update.mockResolvedValue(mockResult);

      const result = await service.approvePlan('plan-1', 'admin-1');

      expect(result.status).toBe('APPROVED');
      expect(mockStrategicPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1' },
          data: expect.objectContaining({
            status: 'APPROVED',
          }),
        })
      );
    });
  });

  describe('createObjective', () => {
    it('should create an objective and recalculate plan progress', async () => {
      const mockObj = { id: 'obj-1', planId: 'plan-1', title: 'Sasaran 1', plan: { id: 'plan-1' } };
      mockPlanObjective.create.mockResolvedValue(mockObj);
      mockPlanObjective.findMany.mockResolvedValue([{ weight: 50, progress: 80 }, { weight: 50, progress: 40 }]);
      mockStrategicPlan.update.mockResolvedValue({});

      const result = await service.createObjective({
        planId: 'plan-1',
        title: 'Sasaran 1',
      });

      expect(result.id).toBe('obj-1');
      // Verify plan progress recalculated
      expect(mockStrategicPlan.update).toHaveBeenCalled();
    });
  });

  describe('createIndicator', () => {
    it('should create a key performance indicator', async () => {
      const mockInd = { id: 'ind-1', name: 'Tingkat Kelulusan', targetValue: 95 };
      mockPlanIndicator.create.mockResolvedValue(mockInd);

      const result = await service.createIndicator({
        objectiveId: 'obj-1',
        name: 'Tingkat Kelulusan',
        unit: '%',
        targetValue: 95,
      });

      expect(result.name).toBe('Tingkat Kelulusan');
      expect(result.targetValue).toBe(95);
    });
  });

  describe('deletePlan', () => {
    it('should delete a plan', async () => {
      mockStrategicPlan.delete.mockResolvedValue({ id: 'plan-1' });
      await service.deletePlan('plan-1');
      expect(mockStrategicPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
    });
  });
});
