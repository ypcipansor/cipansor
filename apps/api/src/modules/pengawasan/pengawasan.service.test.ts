import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { pengawasanService } from './pengawasan.service';

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    internalAudit: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    auditFinding: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditFollowUp: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    risk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
    },
    journalEntry: {
      groupBy: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Pengawasan Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Audits', () => {
    it('should create an audit', async () => {
      const dto = {
        title: 'Audit Keuangan Q1',
        auditType: 'FINANCIAL',
        plannedDate: new Date().toISOString(),
        unitId: 'unit-1',
        leadAuditorId: 'user-1',
      };

      vi.mocked(prisma.internalAudit.create).mockResolvedValue({ id: 'audit-1', ...dto } as any);

      const result = await pengawasanService.createAudit(dto);

      expect(prisma.internalAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Audit Keuangan Q1',
          auditType: 'FINANCIAL',
        }),
        include: expect.any(Object),
      });

      expect(result.id).toBe('audit-1');
    });

    it('should query audits with filter', async () => {
      vi.mocked(prisma.internalAudit.findMany).mockResolvedValue([{ id: 'audit-1' }] as any);

      await pengawasanService.getAudits('unit-1', { status: 'PLANNED', auditType: 'FINANCIAL' });

      expect(prisma.internalAudit.findMany).toHaveBeenCalledWith({
        where: { unitId: 'unit-1', status: 'PLANNED', auditType: 'FINANCIAL' },
        include: expect.any(Object),
        orderBy: expect.any(Object),
      });
    });
  });

  describe('Audit Findings', () => {
    it('should create an audit finding', async () => {
      const dto = {
        auditId: 'audit-1',
        findingNumber: 'F01',
        title: 'Laporan terlambat',
        description: 'Laporan keuangan disubmit melewati tanggal 5.',
        severity: 'MINOR' as any,
        category: 'COMPLIANCE',
      };

      vi.mocked(prisma.auditFinding.create).mockResolvedValue({ id: 'find-1', ...dto } as any);

      await pengawasanService.createFinding(dto);

      expect(prisma.auditFinding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          audit: { connect: { id: 'audit-1' } },
          findingNumber: 'F01',
          severity: 'MINOR',
        }),
        include: expect.any(Object),
      });
    });

    it('should handle disconnect responsible user in finding update', async () => {
      vi.mocked(prisma.auditFinding.update).mockResolvedValue({} as any);

      await pengawasanService.updateFinding('find-1', { responsibleId: null });

      expect(prisma.auditFinding.update).toHaveBeenCalledWith({
        where: { id: 'find-1' },
        data: expect.objectContaining({
          responsible: { disconnect: true },
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('Follow-Ups', () => {
    it('should create follow up action', async () => {
      const dto = {
        findingId: 'find-1',
        action: 'Membuat reminder kalender',
      };

      vi.mocked(prisma.auditFollowUp.create).mockResolvedValue({ id: 'fu-1' } as any);

      await pengawasanService.createFollowUp(dto);

      expect(prisma.auditFollowUp.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'Membuat reminder kalender',
          finding: { connect: { id: 'find-1' } },
        }),
      });
    });

    it('should verify follow up', async () => {
      vi.mocked(prisma.auditFollowUp.update).mockResolvedValue({ id: 'fu-1' } as any);

      await pengawasanService.updateFollowUp('fu-1', { status: 'VERIFIED' }, 'user-2');

      expect(prisma.auditFollowUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-1' },
        data: expect.objectContaining({
          status: 'VERIFIED',
          verifiedBy: { connect: { id: 'user-2' } },
          verifiedAt: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });

    it('should mark resolved with completedAt', async () => {
      vi.mocked(prisma.auditFollowUp.update).mockResolvedValue({ id: 'fu-1' } as any);

      await pengawasanService.updateFollowUp('fu-1', { status: 'RESOLVED' });

      expect(prisma.auditFollowUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          completedAt: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('Suggestion Engine', () => {
    it('should suggest audits based on high risk items', async () => {
      vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
      // Mock prisma.risk.findMany
      vi.mocked(prisma.risk.findMany).mockResolvedValue([
        {
          id: 'risk-1',
          unitId: 'unit-1',
          code: 'RSK-001',
          description: 'Kebocoran data',
          riskLevel: 'EXTREME',
          strategicPlanId: 'plan-1',
          strategicPlan: { title: 'IT Security' },
        },
        {
          id: 'risk-2',
          unitId: 'unit-1',
          code: 'RSK-002',
          description: 'Keterlambatan SPP',
          riskLevel: 'HIGH',
          strategicPlanId: null,
          strategicPlan: null,
        },
      ] as any);

      // risk-1 already has a non-cancelled audit in the same unit, risk-2 does not
      vi.mocked(prisma.internalAudit.findMany).mockResolvedValue([
        { riskId: 'risk-1', unitId: 'unit-1' },
      ] as any);

      const suggestions = await pengawasanService.suggestAuditSchedules('unit-1');

      // Existing-audit query must be scoped to the same unitId
      expect(prisma.internalAudit.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ unitId: 'unit-1' }),
      }));

      expect(suggestions).toHaveLength(1);
      expect(suggestions.find(s => s.riskId === 'risk-2')).toMatchObject({
        riskCode: 'RSK-002',
        priority: 'HIGH',
      });
    });

    it('should suggest audits for high budget utilization', async () => {
      vi.mocked(prisma.risk.findMany).mockResolvedValue([]);
      vi.mocked(prisma.internalAudit.findMany).mockResolvedValue([]);

      vi.mocked(prisma.budget.findMany).mockResolvedValue([
        {
          id: 'b1',
          unitId: 'unit-1',
          amount: { toNumber: () => 1000000 },
          accountId: 'acc-1',
          account: { code: '5101', name: 'Beban Gaji' }
        }
      ] as any);

      vi.mocked(prisma.journalEntry.groupBy).mockResolvedValue([
        {
          accountId: 'acc-1',
          unitId: 'unit-1',
          _sum: {
            debit: { toNumber: () => 950000 },
            credit: { toNumber: () => 0 }
          }
        }
      ] as any);

      const suggestions = await pengawasanService.suggestAuditSchedules('unit-1');

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toMatchObject({
        type: 'BUDGET_OVERRUN',
        suggestedTitle: expect.stringContaining('Beban Gaji'),
        priority: 'HIGH',
      });
      expect(suggestions[0].metadata.utilization).toBe(95);
    });
  });
});
