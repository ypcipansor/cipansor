import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { tataLaksanaService } from './tatalaksana.service';

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    standardOperatingProcedure: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    sOPRevision: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Tata Laksana Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SOP Management', () => {
    it('should create an SOP', async () => {
      const dto = {
        unitId: 'unit-1',
        documentNumber: 'SOP/IT/01',
        title: 'Penggunaan Internet',
        category: 'IT_INFRASTRUCTURE',
        createdById: 'user-1',
      };

      vi.mocked(prisma.standardOperatingProcedure.create).mockResolvedValue({
        id: 'sop-1',
        ...dto,
      } as any);

      const result = await tataLaksanaService.createSOP(dto);

      expect(prisma.standardOperatingProcedure.create).toHaveBeenCalledWith({
        data: dto,
      });
      expect(result.id).toBe('sop-1');
    });

    it('should get SOPs with search filter', async () => {
      vi.mocked(prisma.standardOperatingProcedure.findMany).mockResolvedValue([
        { id: 'sop-1' },
      ] as any);

      await tataLaksanaService.getSOPs({ unitId: 'unit-1', search: 'Internet' });

      expect(prisma.standardOperatingProcedure.findMany).toHaveBeenCalledWith({
        where: {
          unitId: 'unit-1',
          OR: [{ title: { contains: 'Internet' } }, { documentNumber: { contains: 'Internet' } }],
        },
        include: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should approve an SOP', async () => {
      vi.mocked(prisma.standardOperatingProcedure.update).mockResolvedValue({
        id: 'sop-1',
        status: 'APPROVED',
      } as any);

      await tataLaksanaService.approveSOP('sop-1', 'user-2');

      expect(prisma.standardOperatingProcedure.update).toHaveBeenCalledWith({
        where: { id: 'sop-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'user-2',
        }),
      });
    });

    it('should calculate SOP summary correctly', async () => {
      vi.mocked(prisma.standardOperatingProcedure.count).mockResolvedValueOnce(10); // total
      vi.mocked(prisma.standardOperatingProcedure.count).mockResolvedValueOnce(6); // active
      vi.mocked(prisma.standardOperatingProcedure.count).mockResolvedValueOnce(3); // draft
      vi.mocked(prisma.standardOperatingProcedure.count).mockResolvedValueOnce(1); // deprecated

      vi.mocked(prisma.standardOperatingProcedure.groupBy).mockResolvedValue([
        { category: 'IT', _count: 4 },
        { category: 'HR', _count: 6 },
      ] as any);

      const summary = await tataLaksanaService.getSOPSummary('unit-1');

      expect(summary.total).toBe(10);
      expect(summary.active).toBe(6);
      expect(summary.draft).toBe(3);
      expect(summary.deprecated).toBe(1);
      expect(summary.byCategory['HR']).toBe(6);
      expect(summary.byCategory['IT']).toBe(4);
    });
  });

  describe('SOP Revision', () => {
    it('should create revision and increment version', async () => {
      const existingSop = { id: 'sop-1', version: 1, content: 'Old content' };

      vi.mocked(prisma.standardOperatingProcedure.findUniqueOrThrow).mockResolvedValue(
        existingSop as any
      );
      vi.mocked(prisma.sOPRevision.create).mockResolvedValue({ id: 'rev-1' } as any);
      vi.mocked(prisma.standardOperatingProcedure.update).mockResolvedValue({} as any);

      const dto = {
        sopId: 'sop-1',
        changeNotes: 'Updated rules',
        content: 'New content',
        revisedById: 'user-1',
      };

      await tataLaksanaService.createRevision(dto);

      expect(prisma.sOPRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sopId: 'sop-1',
          version: 2, // 1 + 1
          changeNotes: 'Updated rules',
          content: 'New content',
        }),
      });

      expect(prisma.standardOperatingProcedure.update).toHaveBeenCalledWith({
        where: { id: 'sop-1' },
        data: expect.objectContaining({
          version: 2,
          content: 'New content',
          status: 'REVIEW',
        }),
      });
    });
  });
});
