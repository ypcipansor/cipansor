import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock before imports
vi.mock('../../lib/prisma', () => {
  const mockPrisma = {
    shariaCompliance: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shariaAudit: {
      create: vi.fn(),
    },
    internalAudit: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
  return { prisma: mockPrisma };
});

import { prisma } from '../../lib/prisma';
import { syariahService } from './syariah.service';
import { pengawasanService } from '../pengawasan/pengawasan.service';

// Mock external dependencies
vi.mock('../pengawasan/pengawasan.service', () => ({
  pengawasanService: {
    createFinding: vi.fn(),
    createAudit: vi.fn(),
  },
}));

describe('Syariah Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCompliance', () => {
    it('should create compliance category', async () => {
      const dto = {
        category: 'MUAMALAH' as any,
        title: 'Transaksi Koperasi',
        description: 'Bebas riba',
        unitId: 'unit-1',
      };

      const mockResponse = { id: 'comp-1', ...dto };
      vi.mocked(prisma.shariaCompliance.create).mockResolvedValue(mockResponse as any);

      const result = await syariahService.createCompliance(dto);

      expect(prisma.shariaCompliance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'MUAMALAH',
          title: 'Transaksi Koperasi',
          unit: { connect: { id: 'unit-1' } },
        }),
        include: expect.any(Object),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createShariaAudit', () => {
    it('should create audit and update compliance score/status', async () => {
      const dto = {
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2026-03-01T00:00:00Z',
        findings: 'Semua sesuai',
        score: 90,
      };

      vi.mocked(prisma.shariaAudit.create).mockResolvedValue({
        id: 'audit-1',
        ...dto,
        compliance: { unitId: 'unit-1', title: 'Koperasi' },
      } as any);
      vi.mocked(prisma.shariaCompliance.update).mockResolvedValue({} as any);

      await syariahService.createShariaAudit(dto);

      expect(prisma.shariaAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          score: 90,
          findings: 'Semua sesuai',
        }),
        include: expect.any(Object),
      });

      // Score 90 should result in COMPLIANT status
      expect(prisma.shariaCompliance.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: expect.objectContaining({
          score: 90,
          status: 'COMPLIANT',
        }),
      });
    });

    it('should set status to PARTIALLY if score is between 50 and 79', async () => {
      const dto = {
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2026-03-01T00:00:00Z',
        findings: 'Ada catatan',
        score: 75,
      };

      vi.mocked(prisma.shariaAudit.create).mockResolvedValue({
        id: 'audit-2',
        ...dto,
        compliance: { unitId: 'unit-1', title: 'Koperasi' },
      } as any);
      vi.mocked(prisma.shariaCompliance.update).mockResolvedValue({} as any);

      await syariahService.createShariaAudit(dto);

      expect(prisma.shariaCompliance.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: expect.objectContaining({
          score: 75,
          status: 'PARTIALLY',
        }),
      });
    });

    it('should create audit finding if score is below 70', async () => {
      const dto = {
        complianceId: 'comp-1',
        auditorId: 'user-1',
        auditDate: '2026-03-01T00:00:00Z',
        findings: 'Banyak ketidaksesuaian',
        score: 60,
      };

      vi.mocked(prisma.shariaAudit.create).mockResolvedValue({
        id: 'audit-3',
        ...dto,
        compliance: { unitId: 'unit-1', title: 'Koperasi' },
      } as any);
      vi.mocked(prisma.shariaCompliance.update).mockResolvedValue({ title: 'Koperasi' } as any);
      vi.mocked(prisma.internalAudit.findFirst).mockResolvedValue({ id: 'int-audit-1' } as any);

      await syariahService.createShariaAudit(dto);

      expect(pengawasanService.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          auditId: 'int-audit-1',
          category: 'SYARIAH',
          title: expect.stringContaining('Ketidakpatuhan Syariah: Koperasi'),
        })
      );
    });
  });

  describe('getComplianceSummary', () => {
    it('should calculate summary dashboard data accurately', async () => {
      vi.mocked(prisma.shariaCompliance.findMany).mockResolvedValue([
        { status: 'COMPLIANT', category: 'MUAMALAH', score: 90 },
        { status: 'PARTIALLY', category: 'MUAMALAH', score: 70 },
        { status: 'NON_COMPLIANT', category: 'IBADAH', score: 40 },
        { status: 'COMPLIANT', category: 'IBADAH', score: 100 },
      ] as any);

      const result = await syariahService.getComplianceSummary('unit-1');

      expect(result.total).toBe(4);
      expect(result.compliant).toBe(2);
      expect(result.partial).toBe(1);
      expect(result.nonCompliant).toBe(1);
      expect(result.averageScore).toBe(75); // (90 + 70 + 40 + 100) / 4

      expect(result.byCategory['MUAMALAH'].total).toBe(2);
      expect(result.byCategory['MUAMALAH'].averageScore).toBe(80); // (90 + 70) / 2

      expect(result.byCategory['IBADAH'].total).toBe(2);
      expect(result.byCategory['IBADAH'].averageScore).toBe(70); // (40 + 100) / 2
    });

    it('should exclude null scores from averageScore calculations', async () => {
      vi.mocked(prisma.shariaCompliance.findMany).mockResolvedValue([
        { status: 'COMPLIANT', category: 'MUAMALAH', score: 90 },
        { status: 'UNDER_REVIEW', category: 'MUAMALAH', score: null },
        { status: 'COMPLIANT', category: 'IBADAH', score: 80 },
      ] as any);

      const result = await syariahService.getComplianceSummary('unit-1');

      // Overall: only scored items (90 + 80) / 2 = 85, not (90 + 0 + 80) / 3
      expect(result.averageScore).toBe(85);

      // MUAMALAH: only scored item (90) / 1 = 90, not (90 + 0) / 2
      expect(result.byCategory['MUAMALAH'].total).toBe(2);
      expect(result.byCategory['MUAMALAH'].averageScore).toBe(90);

      // IBADAH: single scored item
      expect(result.byCategory['IBADAH'].averageScore).toBe(80);

      // Empty categories should have averageScore 0
      expect(result.byCategory['TARBIYAH'].total).toBe(0);
      expect(result.byCategory['TARBIYAH'].averageScore).toBe(0);
    });
  });
});
