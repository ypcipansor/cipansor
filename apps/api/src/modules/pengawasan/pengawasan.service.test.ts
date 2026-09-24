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
    invoice: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
      expect(prisma.internalAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-1' }),
        })
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions.find((s) => s.riskId === 'risk-2')).toMatchObject({
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
          account: { code: '5101', name: 'Beban Gaji' },
        },
      ] as any);

      vi.mocked(prisma.journalEntry.groupBy).mockResolvedValue([
        {
          accountId: 'acc-1',
          unitId: 'unit-1',
          _sum: {
            debit: { toNumber: () => 950000 },
            credit: { toNumber: () => 0 },
          },
        },
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

  describe('Financial arrears — database aggregation', () => {
    /**
     * `getFinancialArrears` issues three aggregates — summary, per-unit, and
     * top-15 — through `Promise.all`, in that order. Each mockResolvedValueOnce
     * below answers one of them, so the tests double as an assertion that the
     * method no longer loads the whole unpaid book into Node.
     */
    const mockAggregates = (summary: any[], units: any[], students: any[]) => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce(summary)
        .mockResolvedValueOnce(units)
        .mockResolvedValueOnce(students);
    };

    const emptyAggregates = () => mockAggregates([], [], []);

    it('maps the aggregate rows into the response contract', async () => {
      mockAggregates(
        [{ total: 200000, unpaidCount: 2, overdueCount: 1 }],
        [
          {
            unitId: 'unit-lama',
            unitName: 'SD IT',
            totalUnpaid: 200000,
            count: 2,
            overdueCount: 1,
          },
        ],
        [
          {
            studentId: 'student-1',
            unitId: 'unit-lama',
            unitName: 'SD IT',
            totalUnpaid: 200000,
            invoiceCount: 2,
            nis: '123',
            studentName: 'Santri Pindah',
            currentUnitId: 'unit-baru',
            currentUnitName: 'SMP IT',
          },
        ]
      );

      const result = await pengawasanService.getFinancialArrears();

      expect(result.summary).toEqual({
        totalUnpaidAmount: 200000,
        totalUnpaidInvoicesCount: 2,
        overdueInvoicesCount: 1,
      });
      expect(result.unitBreakdown).toEqual([
        { unitId: 'unit-lama', unitName: 'SD IT', totalUnpaid: 200000, count: 2, overdueCount: 1 },
      ]);
      // The row is attributed to the issuing unit, while the pupil's current
      // unit travels beside it so the two are never conflated.
      expect(result.topArrearsStudents[0]).toMatchObject({
        studentId: 'student-1',
        unitId: 'unit-lama',
        unitName: 'SD IT',
        currentUnitId: 'unit-baru',
        currentUnitName: 'SMP IT',
        nis: '123',
        studentName: 'Santri Pindah',
        totalUnpaid: 200000,
        invoiceCount: 2,
      });

      // Three aggregates, not a findMany of every unpaid invoice.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('bounds every aggregate by a positive outstanding balance', async () => {
      emptyAggregates();

      await pengawasanService.getFinancialArrears();

      // Each of the three queries must carry the same balance predicate, so a
      // fully-paid PENDING or an overpaid invoice can never inflate a figure.
      for (const call of (prisma.$queryRaw as any).mock.calls) {
        expect(call[0].sql).toContain('i.amount - i.paid_amount > 0');
        expect(call[0].sql).toContain("i.status IN ('PENDING', 'PARTIAL', 'OVERDUE')");
      }
    });

    it('scopes every aggregate to the requested invoice unit, not the current unit', async () => {
      emptyAggregates();

      await pengawasanService.getFinancialArrears('unit-lama');

      for (const call of (prisma.$queryRaw as any).mock.calls) {
        expect(call[0].sql).toContain('AND i.unit_id =');
        expect(call[0].values).toContain('unit-lama');
      }
    });

    it('leaves the unit filter out for a foundation-wide read', async () => {
      emptyAggregates();

      await pengawasanService.getFinancialArrears();

      for (const call of (prisma.$queryRaw as any).mock.calls) {
        expect(call[0].sql).not.toContain('AND i.unit_id =');
      }
    });

    it('returns zeroed summary when there are no outstanding invoices', async () => {
      emptyAggregates();

      const result = await pengawasanService.getFinancialArrears();

      expect(result.summary).toEqual({
        totalUnpaidAmount: 0,
        totalUnpaidInvoicesCount: 0,
        overdueInvoicesCount: 0,
      });
      expect(result.unitBreakdown).toEqual([]);
      expect(result.topArrearsStudents).toEqual([]);
    });
  });
});
