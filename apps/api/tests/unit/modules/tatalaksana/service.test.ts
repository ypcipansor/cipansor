import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TataLaksanaService } from '@/modules/tatalaksana/tatalaksana.service';

const { mockPrisma } = vi.hoisted(() => {
  const mockTx = {
    sOPRevision: { create: vi.fn() },
    standardOperatingProcedure: { update: vi.fn() },
  };
  return {
    mockPrisma: {
      standardOperatingProcedure: {
        findMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      sOPRevision: { create: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const prisma = mockPrisma as any;

describe('TataLaksanaService', () => {
  const service = new TataLaksanaService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSOPs', () => {
    it('should return filtered SOPs', async () => {
      const mockSOPs = [
        { id: 's1', title: 'SOP Keuangan', status: 'ACTIVE', category: 'Keuangan' },
      ];
      prisma.standardOperatingProcedure.findMany.mockResolvedValue(mockSOPs);

      const result = await service.getSOPs({ status: 'ACTIVE' });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('ACTIVE');
    });

    it('should apply search filter', async () => {
      prisma.standardOperatingProcedure.findMany.mockResolvedValue([]);

      await service.getSOPs({ search: 'keuangan' });
      expect(prisma.standardOperatingProcedure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: { contains: 'keuangan' } }),
            ]),
          }),
        })
      );
    });
  });

  describe('getSOP', () => {
    it('should return SOP with revisions', async () => {
      const mockSOP = {
        id: 's1',
        title: 'SOP A',
        version: 2,
        revisions: [
          { id: 'r1', version: 2 },
          { id: 'r2', version: 1 },
        ],
        createdBy: { id: 'u1', name: 'Admin' },
      };
      prisma.standardOperatingProcedure.findUniqueOrThrow.mockResolvedValue(mockSOP);

      const result = await service.getSOP('s1');
      expect(result.revisions).toHaveLength(2);
    });
  });

  describe('createSOP', () => {
    it('should create a new SOP', async () => {
      const input = {
        unitId: 'unit1',
        documentNumber: 'SOP-KEU-001',
        title: 'SOP Keuangan',
        category: 'Keuangan',
        createdById: 'user1',
      };
      const mockCreated = { id: 's1', ...input, version: 1, status: 'DRAFT' };
      prisma.standardOperatingProcedure.create.mockResolvedValue(mockCreated);

      const result = await service.createSOP(input);
      expect(result.status).toBe('DRAFT');
      expect(result.documentNumber).toBe('SOP-KEU-001');
    });
  });

  describe('approveSOP', () => {
    it('should set status to APPROVED and record approver', async () => {
      const mockApproved = { id: 's1', status: 'APPROVED', approvedById: 'admin1' };
      prisma.standardOperatingProcedure.update.mockResolvedValue(mockApproved);

      const result = await service.approveSOP('s1', 'admin1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.standardOperatingProcedure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED', approvedById: 'admin1' }),
        })
      );
    });
  });

  describe('activateSOP', () => {
    it('should set status to ACTIVE', async () => {
      prisma.standardOperatingProcedure.update.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

      const result = await service.activateSOP('s1');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('createRevision', () => {
    it('should create revision and increment version in transaction', async () => {
      const currentSOP = { id: 's1', version: 2, content: 'old content' };
      prisma.standardOperatingProcedure.findUniqueOrThrow.mockResolvedValue(currentSOP);

      const mockRevision = { id: 'r1', version: 3, changeNotes: 'Updated section 3' };

      // Mock the transaction callback
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          sOPRevision: { create: vi.fn().mockResolvedValue(mockRevision) },
          standardOperatingProcedure: {
            update: vi.fn().mockResolvedValue({ ...currentSOP, version: 3 }),
          },
        };
        return fn(tx);
      });

      const result = await service.createRevision({
        sopId: 's1',
        changeNotes: 'Updated section 3',
        revisedById: 'user1',
      });

      expect(result.version).toBe(3);
    });
  });

  describe('deleteSOP', () => {
    it('should delete a SOP', async () => {
      prisma.standardOperatingProcedure.delete.mockResolvedValue({ id: 's1' });

      await service.deleteSOP('s1');
      expect(prisma.standardOperatingProcedure.delete).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
    });
  });

  describe('getSOPSummary', () => {
    it('should return summary counts and category breakdown', async () => {
      prisma.standardOperatingProcedure.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(12) // active
        .mockResolvedValueOnce(5) // draft
        .mockResolvedValueOnce(3); // deprecated

      prisma.standardOperatingProcedure.groupBy.mockResolvedValue([
        { category: 'Keuangan', _count: 8 },
        { category: 'Akademik', _count: 7 },
        { category: 'SDM', _count: 5 },
      ]);

      const result = await service.getSOPSummary();
      expect(result.total).toBe(20);
      expect(result.active).toBe(12);
      expect(result.byCategory).toEqual({ Keuangan: 8, Akademik: 7, SDM: 5 });
    });

    it('should filter by unitId when provided', async () => {
      prisma.standardOperatingProcedure.count.mockResolvedValue(0);
      prisma.standardOperatingProcedure.groupBy.mockResolvedValue([]);

      await service.getSOPSummary('unit1');
      expect(prisma.standardOperatingProcedure.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit1' } })
      );
    });
  });
});
