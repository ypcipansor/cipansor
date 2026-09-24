import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockShariaCompliance, mockShariaAudit, mockInternalAudit, mockAuditFinding } = vi.hoisted(
  () => ({
    mockShariaCompliance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockShariaAudit: {
      create: vi.fn(),
    },
    mockInternalAudit: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    mockAuditFinding: {
      create: vi.fn(),
    },
  })
);

vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    shariaCompliance: mockShariaCompliance,
    shariaAudit: mockShariaAudit,
    internalAudit: mockInternalAudit,
    auditFinding: mockAuditFinding,
    $transaction: vi.fn((callback) => callback(mockPrisma)),
  };
  return {
    prisma: mockPrisma,
  };
});

import { SyariahService } from '../../../../src/modules/syariah/syariah.service';

describe('SyariahService', () => {
  let service: SyariahService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SyariahService();
  });

  describe('createCompliance', () => {
    it('should create a sharia compliance item', async () => {
      const mockResult = {
        id: 'comp-1',
        category: 'MUAMALAH',
        title: 'Akad Murabahah SPP',
        status: 'UNDER_REVIEW',
        unit: { id: 'unit-1', name: 'Unit A' },
      };

      mockShariaCompliance.create.mockResolvedValue(mockResult);

      const result = await service.createCompliance({
        category: 'MUAMALAH',
        title: 'Akad Murabahah SPP',
        unitId: 'unit-1',
      });

      expect(result.category).toBe('MUAMALAH');
      expect(result.status).toBe('UNDER_REVIEW');
    });
  });

  describe('getCompliances', () => {
    it('should filter by category and status', async () => {
      mockShariaCompliance.findMany.mockResolvedValue([
        { id: 'comp-1', category: 'IBADAH', status: 'COMPLIANT' },
      ]);

      const result = await service.getCompliances('unit-1', {
        category: 'IBADAH',
        status: 'COMPLIANT',
      });

      expect(result).toHaveLength(1);
      expect(mockShariaCompliance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unitId: 'unit-1', category: 'IBADAH', status: 'COMPLIANT' },
        })
      );
    });
  });

  describe('createShariaAudit', () => {
    it('should create audit and update compliance score', async () => {
      const mockAudit = {
        id: 'audit-1',
        score: 85,
        auditor: { id: 'user-1', name: 'Auditor' },
        compliance: { unitId: 'unit-1', title: 'Test' },
      };

      mockShariaAudit.create.mockResolvedValue(mockAudit);
      mockShariaCompliance.update.mockResolvedValue({});

      const result = await service.createShariaAudit({
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2025-03-01T00:00:00.000Z',
        findings: 'Sudah sesuai dengan prinsip syariah',
        score: 85,
      });

      expect(result.score).toBe(85);

      // Should update compliance to COMPLIANT (score >= 80)
      expect(mockShariaCompliance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-1' },
          data: expect.objectContaining({ status: 'COMPLIANT' }),
        })
      );
    });

    it('should set PARTIALLY status for score between 50-79', async () => {
      mockShariaAudit.create.mockResolvedValue({
        id: 'audit-2',
        score: 65,
        compliance: { unitId: 'unit-1', title: 'Test' },
      });
      mockShariaCompliance.update.mockResolvedValue({});
      mockInternalAudit.findFirst.mockResolvedValue({ id: 'ia-1' });
      mockAuditFinding.create.mockResolvedValue({});

      await service.createShariaAudit({
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2025-03-01T00:00:00.000Z',
        findings: 'Perlu perbaikan',
        score: 65,
      });

      expect(mockShariaCompliance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PARTIALLY' }),
        })
      );
    });

    it('should set NON_COMPLIANT status for score below 50', async () => {
      mockShariaAudit.create.mockResolvedValue({
        id: 'audit-3',
        score: 30,
        compliance: { unitId: 'unit-1', title: 'Test' },
      });
      mockShariaCompliance.update.mockResolvedValue({});
      mockInternalAudit.findFirst.mockResolvedValue({ id: 'ia-1' });
      mockAuditFinding.create.mockResolvedValue({});

      await service.createShariaAudit({
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2025-03-01T00:00:00.000Z',
        findings: 'Tidak sesuai',
        score: 30,
      });

      expect(mockShariaCompliance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'NON_COMPLIANT' }),
        })
      );
    });
  });

  describe('getComplianceSummary', () => {
    it('should aggregate compliance data by status and category', async () => {
      mockShariaCompliance.findMany.mockResolvedValue([
        { status: 'COMPLIANT', category: 'MUAMALAH', score: 90 },
        { status: 'COMPLIANT', category: 'IBADAH', score: 85 },
        { status: 'PARTIALLY', category: 'TARBIYAH', score: 60 },
        { status: 'NON_COMPLIANT', category: 'AKHLAQ', score: 30 },
        { status: 'UNDER_REVIEW', category: 'GOVERNANCE', score: null },
      ]);

      const result = await service.getComplianceSummary('unit-1');

      expect(result.total).toBe(5);
      expect(result.compliant).toBe(2);
      expect(result.partial).toBe(1);
      expect(result.nonCompliant).toBe(1);
      expect(result.underReview).toBe(1);
      expect(result.averageScore).toBeCloseTo(66.25); // (90+85+60+30)/4
      expect(result.byCategory.MUAMALAH.total).toBe(1);
      expect(result.byCategory.MUAMALAH.averageScore).toBe(90);
    });

    it('should handle empty unit', async () => {
      mockShariaCompliance.findMany.mockResolvedValue([]);
      const result = await service.getComplianceSummary('unit-empty');
      expect(result.total).toBe(0);
      expect(result.averageScore).toBe(0);
    });
  });
});
