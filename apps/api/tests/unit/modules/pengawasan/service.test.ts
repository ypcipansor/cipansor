import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInternalAudit, mockAuditFinding, mockAuditFollowUp } = vi.hoisted(() => ({
  mockInternalAudit: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockAuditFinding: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockAuditFollowUp: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', async (importOriginal) => {
  // The service pulls in `CorrespondenceService`, which reads DB enums
  // (`RoleCode`, `LetterFlowAction`, …) at module load. Keep the real enums and
  // override only the client class.
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    PrismaClient: class {
      internalAudit = mockInternalAudit;
      auditFinding = mockAuditFinding;
      auditFollowUp = mockAuditFollowUp;
    },
    Prisma: actual.Prisma,
  };
});

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    internalAudit: mockInternalAudit,
    auditFinding: mockAuditFinding,
    auditFollowUp: mockAuditFollowUp,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        internalAudit: mockInternalAudit,
        auditFinding: mockAuditFinding,
        auditFollowUp: mockAuditFollowUp,
      })
    ),
  },
}));

import { PengawasanService } from '../../../../src/modules/pengawasan/pengawasan.service';

describe('PengawasanService', () => {
  let service: PengawasanService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PengawasanService();
  });

  describe('createAudit', () => {
    it('should create an internal audit', async () => {
      const mockResult = {
        id: 'audit-1',
        title: 'Audit Keuangan Q1',
        auditType: 'Keuangan',
        status: 'PLANNED',
        unit: { id: 'unit-1', name: 'Unit A' },
        leadAuditor: { id: 'user-1', name: 'Auditor' },
        findings: [],
      };

      mockInternalAudit.create.mockResolvedValue(mockResult);

      const result = await service.createAudit({
        title: 'Audit Keuangan Q1',
        auditType: 'Keuangan',
        plannedDate: '2025-03-01T00:00:00.000Z',
        unitId: 'unit-1',
        leadAuditorId: 'user-1',
      });

      expect(result.id).toBe('audit-1');
      expect(result.status).toBe('PLANNED');
      expect(mockInternalAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Audit Keuangan Q1' }),
        })
      );
    });
  });

  describe('getAudits', () => {
    it('should return audits filtered by status', async () => {
      mockInternalAudit.findMany.mockResolvedValue([
        { id: 'audit-1', status: 'PLANNED' },
        { id: 'audit-2', status: 'PLANNED' },
      ]);

      const result = await service.getAudits('unit-1', { status: 'PLANNED' });

      expect(result).toHaveLength(2);
      expect(mockInternalAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-1', status: 'PLANNED' }),
        })
      );
    });
  });

  describe('createFinding', () => {
    it('should create an audit finding with severity', async () => {
      const mockResult = {
        id: 'finding-1',
        severity: 'MAJOR',
        title: 'Pengelolaan kas tidak sesuai SOP',
        responsible: { id: 'user-2', name: 'PIC' },
      };

      mockAuditFinding.create.mockResolvedValue(mockResult);

      const result = await service.createFinding({
        auditId: 'audit-1',
        findingNumber: 'TM-001',
        title: 'Pengelolaan kas tidak sesuai SOP',
        description: 'Ditemukan ketidaksesuaian prosedur',
        severity: 'MAJOR',
        category: 'Keuangan',
        responsibleId: 'user-2',
      });

      expect(result.severity).toBe('MAJOR');
      expect(mockAuditFinding.create).toHaveBeenCalled();
    });
  });

  describe('createFollowUp', () => {
    it('should create a follow-up action', async () => {
      const mockResult = { id: 'followup-1', status: 'OPEN', action: 'Perbaiki SOP' };
      mockAuditFollowUp.create.mockResolvedValue(mockResult);

      const result = await service.createFollowUp({
        findingId: 'finding-1',
        action: 'Perbaiki SOP',
      });

      expect(result.status).toBe('OPEN');
    });
  });

  describe('updateFollowUp', () => {
    it('should verify a follow-up and set verifier', async () => {
      const mockResult = {
        id: 'followup-1',
        status: 'VERIFIED',
        verifiedBy: { id: 'admin-1', name: 'Admin' },
      };
      mockAuditFollowUp.update.mockResolvedValue(mockResult);

      const result = await service.updateFollowUp('followup-1', { status: 'VERIFIED' }, 'admin-1');

      expect(result.status).toBe('VERIFIED');
      expect(mockAuditFollowUp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'VERIFIED',
            verifiedBy: { connect: { id: 'admin-1' } },
          }),
        })
      );
    });

    it('should set completedAt when status is RESOLVED', async () => {
      const mockResult = { id: 'followup-1', status: 'RESOLVED' };
      mockAuditFollowUp.update.mockResolvedValue(mockResult);

      await service.updateFollowUp('followup-1', { status: 'RESOLVED' });

      expect(mockAuditFollowUp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            completedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('deleteAudit', () => {
    it('should delete an audit', async () => {
      mockInternalAudit.delete.mockResolvedValue({ id: 'audit-1' });
      await service.deleteAudit('audit-1');
      expect(mockInternalAudit.delete).toHaveBeenCalledWith({ where: { id: 'audit-1' } });
    });
  });
});
