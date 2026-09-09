import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { perencanaanService } from '../perencanaan.service';

// Mock external dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategicPlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      delete: vi.fn(),
    },
    planObjective: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    planIndicator: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    planActivity: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    journalEntry: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Perencanaan Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Strategic Plans', () => {
    it('should create a plan', async () => {
      const dto = {
        title: 'Rencana Jangka Panjang',
        type: 'RENSTRA' as any,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        budget: 50000000,
        unitId: 'unit-1',
        parentId: 'rpjp-1',
        createdById: 'user-1',
      };

      vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
      // RENSTRA harus menggantung pada RPJP — induknya wajib ada dan berjenis RPJP.
      vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
        id: 'rpjp-1',
        type: 'RPJP',
      } as any);
      vi.mocked(prisma.strategicPlan.create).mockResolvedValue({ id: 'plan-1', ...dto } as any);

      await perencanaanService.createPlan(dto);

      expect(prisma.strategicPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Rencana Jangka Panjang',
          type: 'RENSTRA',
        }),
        include: expect.any(Object),
      });
    });

    it('rejects a second active RENSTRA (only one combined RENSTRA allowed)', async () => {
      vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue({ id: 'existing' } as any);

      await expect(
        perencanaanService.createPlan({
          title: 'Renstra kedua',
          type: 'RENSTRA' as any,
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          unitId: 'unit-1',
          createdById: 'user-1',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
    });

    it('walidates that RENSTRA and RKA Yayasan must hang off their mandated parent', async () => {
      // Sebelumnya penjaga "parentless" hanya menolak RKA unit. Akibatnya
      // RENSTRA maupun RKA Yayasan tanpa parentId tetap lolos dan terlepas
      // dari kaskade wajib (Renstra harus berinduk RPJP; RKA Yayasan harus
      // berinduk Renstra). Kedua kasus ini harus ditolak.
      const base = {
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-12-31T00:00:00.000Z',
        createdById: 'user-1',
      };

      // RENSTRA tanpa induk RPJP → ditolak.
      vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
      await expect(
        perencanaanService.createPlan({
          ...base,
          title: 'Renstra Yayasan 2027-2031',
          type: 'RENSTRA' as any,
          unitId: null,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.strategicPlan.create).not.toHaveBeenCalled();

      // RKA Yayasan tanpa induk Renstra → ditolak.
      vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
      await expect(
        perencanaanService.createPlan({
          ...base,
          title: 'RKA Yayasan 2027',
          type: 'RKA' as any,
          unitId: null,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
    });

    /**
     * The annual tier: one consolidated RKA Yayasan (unitId null) hanging off
     * the Renstra, and unit RKAs hanging off THAT — not off the Renstra. The
     * seed's own unit RKA described itself as "turunan unit dari RKA Yayasan"
     * while its row pointed one level too high, and nothing caught it because
     * the only rule was "RKA must refer to a RENSTRA parent".
     */
    describe('two-tier annual cascade', () => {
      const base = {
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-12-31T00:00:00.000Z',
        createdById: 'user-1',
      };

      it('accepts an RKA Yayasan hanging off the Renstra', async () => {
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
          id: 'renstra-1',
          type: 'RENSTRA',
          unitId: null,
        } as any);
        vi.mocked(prisma.strategicPlan.create).mockResolvedValue({ id: 'rka-y' } as any);

        await perencanaanService.createPlan({
          ...base,
          title: 'RKA Yayasan 2027',
          type: 'RKA' as any,
          parentId: 'renstra-1',
        });

        expect(prisma.strategicPlan.create).toHaveBeenCalledWith({
          // A yayasan document has NO unit — that is what makes it the
          // foundation's own plan. The unconditional `unit: { connect: … }`
          // that used to sit here threw on a null id.
          data: expect.objectContaining({ unit: undefined }),
          include: expect.any(Object),
        });
      });

      it('rejects a unit RKA that hangs off the Renstra directly', async () => {
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
          id: 'renstra-1',
          type: 'RENSTRA',
          unitId: null,
        } as any);

        await expect(
          perencanaanService.createPlan({
            ...base,
            title: 'RKA SMP IT 2027',
            type: 'RKA' as any,
            unitId: 'unit-smp',
            parentId: 'renstra-1',
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
      });

      it('accepts a unit RKA hanging off the consolidated RKA Yayasan', async () => {
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
          id: 'rka-y',
          type: 'RKA',
          unitId: null,
        } as any);
        vi.mocked(prisma.strategicPlan.create).mockResolvedValue({ id: 'rka-u' } as any);

        await perencanaanService.createPlan({
          ...base,
          title: 'RKA SMP IT 2027',
          type: 'RKA' as any,
          unitId: 'unit-smp',
          parentId: 'rka-y',
        });

        expect(prisma.strategicPlan.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ unit: { connect: { id: 'unit-smp' } } }),
          include: expect.any(Object),
        });
      });

      it('rejects a unit RKA whose parent is another unit RKA', async () => {
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
          id: 'rka-sd',
          type: 'RKA',
          unitId: 'unit-sd',
        } as any);

        await expect(
          perencanaanService.createPlan({
            ...base,
            title: 'RKA SMP IT 2027',
            type: 'RKA' as any,
            unitId: 'unit-smp',
            parentId: 'rka-sd',
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
      });

      it('rejects a unit RKA with no parent at all', async () => {
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue(null);

        await expect(
          perencanaanService.createPlan({
            ...base,
            title: 'RKA melayang',
            type: 'RKA' as any,
            unitId: 'unit-smp',
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
      });

      it('rejects a second RKA Yayasan in the same year', async () => {
        // The pengurus approves exactly one consolidated annual budget.
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue({ id: 'rka-2027' } as any);

        await expect(
          perencanaanService.createPlan({
            ...base,
            title: 'RKA Yayasan 2027 (kedua)',
            type: 'RKA' as any,
            parentId: 'renstra-1',
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(prisma.strategicPlan.create).not.toHaveBeenCalled();
      });

      it('leaves unit RKAs unconstrained — every unit files its own slice', async () => {
        // findFirst is the year-clash probe; it must never run for a unit RKA.
        vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue({ id: 'rka-2027' } as any);
        vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
          id: 'rka-y',
          type: 'RKA',
          unitId: null,
        } as any);
        vi.mocked(prisma.strategicPlan.create).mockResolvedValue({ id: 'rka-u2' } as any);

        await perencanaanService.createPlan({
          ...base,
          title: 'RKA SDIT 2027',
          type: 'RKA' as any,
          unitId: 'unit-sd',
          parentId: 'rka-y',
        });

        expect(prisma.strategicPlan.create).toHaveBeenCalled();
      });
    });

    it('should approve plan', async () => {
      vi.mocked(prisma.strategicPlan.update).mockResolvedValue({ id: 'plan-1' } as any);

      await perencanaanService.approvePlan('plan-1', 'user-2');

      expect(prisma.strategicPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedBy: { connect: { id: 'user-2' } },
        }),
      });
    });
  });

  /**
   * The list is unit-scoped, but the yayasan's RPJP/Renstra/consolidated RKA
   * are filed against no unit (unitId null) by design. These pin the emitted
   * `where` so the foundation documents cannot silently disappear from the
   * list again, and so the board's all-units view is not accidentally narrowed.
   */
  describe('getPlans foundation scoping', () => {
    const whereOf = () =>
      vi.mocked(prisma.strategicPlan.findMany).mock.calls.at(-1)![0]!.where as any;

    beforeEach(() => {
      vi.mocked(prisma.strategicPlan.findMany).mockResolvedValue([] as any);
    });

    it('shows a unit user their own unit AND the foundation-wide plans', async () => {
      await perencanaanService.getPlans('smp-it', { collaboratorId: 'user-9' });
      expect(whereOf().OR).toEqual([
        { unitId: null },
        { unitId: 'smp-it' },
        { collaborators: { some: { userId: 'user-9' } } },
      ]);
    });

    it('still surfaces foundation-wide plans to a caller with no unit', async () => {
      await perencanaanService.getPlans(null, {});
      // Without a unit the only breadth is the foundation documents.
      expect(whereOf().OR).toEqual([{ unitId: null }]);
    });

    it('does not narrow a foundation-scoped caller to any unit', async () => {
      await perencanaanService.getPlans(null, { seesAllUnits: true, type: 'RPJP' });
      const where = whereOf();
      // No OR filter at all — every unit's plan plus the foundation-wide ones.
      expect(where.OR).toBeUndefined();
      expect(where.type).toBe('RPJP');
    });
  });

  describe('Objectives and Progress', () => {
    it('should calculate objective progress and update plan progress', async () => {
      const objData = {
        planId: 'plan-1',
        title: 'Meningkatkan Mutu',
        weight: 60,
      };

      vi.mocked(prisma.planObjective.create).mockResolvedValue({ id: 'obj-1', ...objData } as any);
      
      // Mocks for progress recalculation
      vi.mocked(prisma.planObjective.findMany).mockResolvedValue([
        { weight: 60, progress: 50 },
        { weight: 40, progress: 100 },
      ] as any);

      vi.mocked(prisma.strategicPlan.update).mockResolvedValue({} as any);

      await perencanaanService.createObjective(objData);

      expect(prisma.strategicPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        // (60*50 + 40*100) / 100 = (3000 + 4000) / 100 = 70
        data: { progress: 70 },
      });
    });

    it('should update progress on objective delete', async () => {
      vi.mocked(prisma.planObjective.findUnique).mockResolvedValue({ planId: 'plan-1' } as any);
      vi.mocked(prisma.planObjective.delete).mockResolvedValue({} as any);

      vi.mocked(prisma.planObjective.findMany).mockResolvedValue([
        { weight: 100, progress: 20 },
      ] as any);

      await perencanaanService.deleteObjective('obj-1');

      expect(prisma.strategicPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { progress: 20 },
      });
    });
  });

  describe('Indicators and Activities', () => {
    it('should create indicator', async () => {
      const dto = {
        objectiveId: 'obj-1',
        name: 'Nilai UN Average',
        unit: 'Score',
        targetValue: 8.5,
      };

      vi.mocked(prisma.planIndicator.create).mockResolvedValue({ id: 'ind-1' } as any);
      // createIndicator recalculates objective progress, loading the objective + indicators.
      vi.mocked(prisma.planObjective.findUnique).mockResolvedValue({
        id: 'obj-1',
        indicators: [],
      } as any);
      vi.mocked(prisma.planObjective.update).mockResolvedValue({} as any);

      await perencanaanService.createIndicator(dto);

      expect(prisma.planIndicator.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Nilai UN Average',
          targetValue: 8.5,
        }),
      });
    });

    it('should create activity with budget linkage', async () => {
      const dto = {
        objectiveId: 'obj-1',
        title: 'Pemantapan UN',
        priority: 'HIGH' as any,
        budget: 5000000,
        budgetId: 'budget-123',
      };

      vi.mocked(prisma.planActivity.create).mockResolvedValue({ id: 'act-1' } as any);

      await perencanaanService.createActivity(dto);

      expect(prisma.planActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Pemantapan UN',
          priority: 'HIGH',
          budgetRel: { connect: { id: 'budget-123' } },
        }),
        include: expect.objectContaining({
          budgetRel: expect.any(Object),
        }),
      });
    });

    it('should update activity with budget linkage', async () => {
      const dto = {
        title: 'Pemantapan UN Updated',
        budgetId: 'budget-456',
      };

      vi.mocked(prisma.planActivity.update).mockResolvedValue({ id: 'act-1' } as any);

      await perencanaanService.updateActivity('act-1', dto);

      expect(prisma.planActivity.update).toHaveBeenCalledWith({
        where: { id: 'act-1' },
        data: expect.objectContaining({
          title: 'Pemantapan UN Updated',
          budgetRel: { connect: { id: 'budget-456' } },
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('Budget Realization', () => {
    it('should calculate budget realization from journal entries', async () => {
      const planId = 'plan-123';
      const mockPlan = {
        id: planId,
        unitId: 'unit-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        objectives: [
          {
            id: 'obj-1',
            activities: [
              {
                id: 'act-1',
                budget: { toNumber: () => 1000000 },
                budgetRel: {
                  accountId: 'acc-1',
                  account: { normalBalance: 'DEBIT' }
                }
              }
            ]
          }
        ]
      };

      vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue(mockPlan as any);
      vi.mocked(prisma.journalEntry.aggregate).mockResolvedValue({
        _sum: { debit: { toNumber: () => 500000 }, credit: { toNumber: () => 100000 } }
      } as any);

      const result = (await perencanaanService.getPlanById(planId))!;
      expect(result.totalRealization).toBe(400000); // 500k - 100k
      expect(result.financialProgress).toBe(40); // 400k / 1m
      expect(prisma.journalEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ accountId: 'acc-1' })
      }));
    });

    it('should not double-count realization when activities share the same budget account', async () => {
      const planId = 'plan-shared';
      const mockPlan = {
        id: planId,
        unitId: 'unit-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        objectives: [
          {
            id: 'obj-1',
            activities: [
              {
                id: 'act-1',
                budget: { toNumber: () => 600000 },
                budgetRel: {
                  accountId: 'acc-shared',
                  account: { normalBalance: 'DEBIT' }
                }
              },
              {
                id: 'act-2',
                budget: { toNumber: () => 400000 },
                budgetRel: {
                  accountId: 'acc-shared',
                  account: { normalBalance: 'DEBIT' }
                }
              }
            ]
          }
        ]
      };

      vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue(mockPlan as any);
      vi.mocked(prisma.journalEntry.aggregate).mockResolvedValue({
        _sum: { debit: { toNumber: () => 500000 }, credit: { toNumber: () => 0 } }
      } as any);

      const result = (await perencanaanService.getPlanById(planId))!;
      // Journal aggregate should be called only ONCE for the shared account
      expect(prisma.journalEntry.aggregate).toHaveBeenCalledTimes(1);

      // Total realization should equal the account total (500k), NOT 500k * 2
      expect(result.totalRealization).toBe(500000);

      // Realization distributed proportionally: act-1 gets 60%, act-2 gets 40%
      const activities = result.objectives[0].activities;
      expect(activities[0].realization).toBe(300000); // 500k * (600k / 1m)
      expect(activities[1].realization).toBe(200000); // 500k * (400k / 1m)
    });
  });

  describe('getPlanRealizationTrend', () => {
    it('buckets journal movements per month by normal balance', async () => {
      vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
        id: 'plan-1',
        unitId: 'unit-1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        objectives: [
          {
            activities: [
              {
                budgetRel: {
                  accountId: 'acc-exp',
                  account: { normalBalance: 'DEBIT' },
                },
              },
            ],
          },
        ],
      } as any);
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        { accountId: 'acc-exp', date: new Date('2026-01-15'), debit: 100000, credit: 0 },
        { accountId: 'acc-exp', date: new Date('2026-01-20'), debit: 50000, credit: 10000 },
        { accountId: 'acc-exp', date: new Date('2026-03-05'), debit: 75000, credit: 0 },
      ] as any);

      const result = (await perencanaanService.getPlanRealizationTrend('plan-1'))!;
      expect(result).toEqual({
        planId: 'plan-1',
        trend: [
          { month: '2026-01', realization: 140000 },
          { month: '2026-03', realization: 75000 },
        ],
      });
    });

    it('returns empty trend when the plan has no budget accounts', async () => {
      vi.mocked(prisma.strategicPlan.findUnique).mockResolvedValue({
        id: 'plan-1',
        unitId: 'unit-1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        objectives: [],
      } as any);

      const result = (await perencanaanService.getPlanRealizationTrend('plan-1'))!;
      expect(result).toEqual({ planId: 'plan-1', trend: [] });
    });
  });
});
