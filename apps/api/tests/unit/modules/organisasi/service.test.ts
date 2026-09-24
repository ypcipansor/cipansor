import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganisasiService } from '@/modules/organisasi/organisasi.service';

// The service uses the shared prisma instance, so mock that (not the constructor).
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    orgUnit: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    orgPosition: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const prisma = mockPrisma;

describe('OrganisasiService', () => {
  const service = new OrganisasiService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── OrgUnit ─────────────────────────────────────
  describe('getOrgUnits', () => {
    it('should return org units for a given unit', async () => {
      const mockUnits = [
        { id: 'u1', name: 'Divisi Akademik', code: 'AKD', level: 1, children: [], positions: [] },
        { id: 'u2', name: 'Divisi Keuangan', code: 'KEU', level: 1, children: [], positions: [] },
      ];
      (prisma.orgUnit.findMany as any).mockResolvedValue(mockUnits);

      const result = await service.getOrgUnits('unit1');
      expect(result).toHaveLength(2);
      expect(prisma.orgUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit1' } })
      );
    });
  });

  describe('getOrgTree', () => {
    it('should return root-level units with nested children', async () => {
      const mockTree = [
        {
          id: 'root1',
          name: 'Yayasan',
          parentId: null,
          children: [{ id: 'c1', name: 'SD', children: [] }],
          positions: [],
        },
      ];
      (prisma.orgUnit.findMany as any).mockResolvedValue(mockTree);

      const result = await service.getOrgTree('unit1');
      expect(result[0].children).toHaveLength(1);
      expect(prisma.orgUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit1', parentId: null } })
      );
    });
  });

  describe('getOrgUnit', () => {
    it('should return a single org unit with children and positions', async () => {
      const mockUnit = { id: 'u1', name: 'Divisi A', children: [], positions: [], parent: null };
      (prisma.orgUnit.findUniqueOrThrow as any).mockResolvedValue(mockUnit);

      const result = await service.getOrgUnit('u1');
      expect(result.id).toBe('u1');
    });
  });

  describe('createOrgUnit', () => {
    it('should create a new org unit', async () => {
      const input = { unitId: 'unit1', name: 'Divisi Baru', code: 'DBR' };
      const mockCreated = { id: 'new1', ...input, level: 0, sortOrder: 0 };
      (prisma.orgUnit.create as any).mockResolvedValue(mockCreated);

      const result = await service.createOrgUnit(input);
      expect(result.name).toBe('Divisi Baru');
      expect(prisma.orgUnit.create).toHaveBeenCalledWith({ data: input });
    });
  });

  describe('updateOrgUnit', () => {
    it('should update an org unit', async () => {
      const mockUpdated = { id: 'u1', name: 'Updated', code: 'UPD' };
      (prisma.orgUnit.update as any).mockResolvedValue(mockUpdated);

      const result = await service.updateOrgUnit('u1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('deleteOrgUnit', () => {
    it('should delete an org unit', async () => {
      (prisma.orgUnit.delete as any).mockResolvedValue({ id: 'u1' });

      await service.deleteOrgUnit('u1');
      expect(prisma.orgUnit.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  // ── OrgPosition ─────────────────────────────────
  describe('getPositions', () => {
    it('should return positions for an org unit', async () => {
      const mockPositions = [
        { id: 'p1', title: 'Kepala Divisi', holder: { id: 'h1', name: 'Ahmad' } },
        { id: 'p2', title: 'Staff', holder: null },
      ];
      (prisma.orgPosition.findMany as any).mockResolvedValue(mockPositions);

      const result = await service.getPositions('u1');
      expect(result).toHaveLength(2);
      expect(result[0].holder?.name).toBe('Ahmad');
    });
  });

  describe('createPosition', () => {
    it('should create a new position', async () => {
      const input = { orgUnitId: 'u1', title: 'Kepala Sekolah' };
      const mockCreated = { id: 'p1', ...input, level: 0, status: 'ACTIVE' };
      (prisma.orgPosition.create as any).mockResolvedValue(mockCreated);

      const result = await service.createPosition(input);
      expect(result.title).toBe('Kepala Sekolah');
    });
  });

  describe('updatePosition', () => {
    it('should update a position with new holder', async () => {
      const mockUpdated = { id: 'p1', title: 'Staff', holderId: 'user1' };
      (prisma.orgPosition.update as any).mockResolvedValue(mockUpdated);

      const result = await service.updatePosition('p1', { holderId: 'user1' });
      expect(result.holderId).toBe('user1');
    });
  });

  describe('deletePosition', () => {
    it('should delete a position', async () => {
      (prisma.orgPosition.delete as any).mockResolvedValue({ id: 'p1' });

      await service.deletePosition('p1');
      expect(prisma.orgPosition.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });
});
