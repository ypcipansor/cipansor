import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMaintenanceRequest,
  updateMaintenanceStatus,
  disposeAsset,
  getQrCode,
} from '../../../../src/modules/inventory/inventory.service';
import { AssetStatus, AssetMaintenanceStatus, AssetDisposalReason } from '@prisma/client';

// Mock Enums
vi.mock('@prisma/client', async (importOriginal) => {
  const original = await importOriginal();
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(original as any),
    AssetStatus: { ACTIVE: 'ACTIVE', DISPOSED: 'DISPOSED', MAINTENANCE: 'MAINTENANCE' },
    AssetMaintenanceStatus: {
      PENDING: 'PENDING',
      COMPLETED: 'COMPLETED',
      IN_PROGRESS: 'IN_PROGRESS',
    },
    AssetDisposalReason: { SOLD: 'SOLD' },
    NotificationType: { ALERT: 'ALERT' },
  };
});

const prismaMock = vi.hoisted(() => ({
  assetMaintenance: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  asset: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  assetDisposal: {
    create: vi.fn(),
  },
  // Add notification mock to prevent crashes if real code runs
  notification: {
    create: vi.fn(),
  },
  $transaction: vi.fn((arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === 'function') return arg(prismaMock);
    return arg;
  }),
}));

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock notifications service with correct relative path (4 levels up)
vi.mock('../../../../src/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn(),
}));

import { createNotification } from '../../../../src/modules/notifications/notifications.service';

describe('Inventory Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMaintenanceRequest', () => {
    it('should create a maintenance request with PENDING status', async () => {
      const input = {
        assetId: 'asset-1',
        type: 'repair',
        description: 'Broken screen',
        notes: 'Urgent',
      };
      const userId = 'user-1';

      prismaMock.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        code: 'AST-001',
        name: 'Laptop',
        unitId: 'unit-1',
      });

      prismaMock.assetMaintenance.create.mockResolvedValue({
        id: 'maintenance-1',
        ...input,
        status: AssetMaintenanceStatus.PENDING,
        requestedById: userId,
      });

      prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

      const result = await createMaintenanceRequest(input, userId);

      expect(prismaMock.assetMaintenance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: 'asset-1',
          status: AssetMaintenanceStatus.PENDING,
          requestedById: userId,
        }),
      });
      expect(result.status).toBe(AssetMaintenanceStatus.PENDING);

      // Allow async promises to settle
      await new Promise(process.nextTick);

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          type: 'ALERT',
        })
      );
    });

    it('still returns the saved maintenance when notifications fail', async () => {
      // The row is committed before the notifications fan out. A derived
      // message can exceed the notification size cap for a very long
      // description, so the notify must not fail the request.
      const input = {
        assetId: 'asset-1',
        type: 'repair',
        description: 'x'.repeat(500_000),
      };

      prismaMock.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        code: 'AST-001',
        name: 'Laptop',
        unitId: 'unit-1',
      });
      prismaMock.assetMaintenance.create.mockResolvedValue({
        id: 'maintenance-2',
        ...input,
        status: AssetMaintenanceStatus.PENDING,
      });
      prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);
      vi.mocked(createNotification).mockRejectedValue(new Error('Pesan melebihi batas'));

      const result = await createMaintenanceRequest(input, 'user-1');

      expect(result.id).toBe('maintenance-2');
      await new Promise(process.nextTick);
    });
  });

  describe('updateMaintenanceStatus', () => {
    it('should update status and asset status when COMPLETED', async () => {
      const maintenanceId = 'm-1';
      const input = { status: AssetMaintenanceStatus.COMPLETED };

      prismaMock.assetMaintenance.findUnique.mockResolvedValue({
        id: maintenanceId,
        assetId: 'asset-1',
        status: AssetMaintenanceStatus.IN_PROGRESS,
      });

      prismaMock.assetMaintenance.update.mockResolvedValue({
        id: maintenanceId,
        status: AssetMaintenanceStatus.COMPLETED,
      });

      await updateMaintenanceStatus(maintenanceId, input);

      expect(prismaMock.asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.ACTIVE },
      });

      expect(prismaMock.assetMaintenance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: maintenanceId },
          data: expect.objectContaining({ status: AssetMaintenanceStatus.COMPLETED }),
        })
      );
    });
  });

  describe('disposeAsset', () => {
    it('should dispose asset and create disposal record', async () => {
      const assetId = 'asset-1';
      const input = {
        date: new Date(),
        reason: AssetDisposalReason.SOLD,
        salePrice: 500000,
        notes: 'Sold to vendor',
      };
      const userId = 'admin-1';

      prismaMock.asset.findUnique.mockResolvedValue({
        id: assetId,
        status: AssetStatus.ACTIVE,
        purchasePrice: 1000000,
        purchaseDate: new Date('2023-01-01'),
        usefulLife: 12,
        residualValue: 0,
      });

      prismaMock.asset.update.mockResolvedValue({ id: assetId, status: AssetStatus.DISPOSED });
      prismaMock.assetDisposal.create.mockResolvedValue({ id: 'disposal-1', assetId, ...input });

      await disposeAsset(assetId, input, userId);

      expect(prismaMock.asset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { status: AssetStatus.DISPOSED, deletedAt: expect.any(Date) },
      });

      expect(prismaMock.assetDisposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId,
          reason: AssetDisposalReason.SOLD,
          approvedById: userId,
        }),
      });
    });
  });

  describe('getQrCode', () => {
    it('should return a data URL for the asset', async () => {
      const assetId = 'asset-1';
      prismaMock.asset.findUnique.mockResolvedValue({ id: assetId, code: 'AST-001' });

      const result = await getQrCode(assetId);

      expect(prismaMock.asset.findUnique).toHaveBeenCalledWith({ where: { id: assetId } });
      expect(result).toContain('data:image/png;base64');
    });

    it('should throw error if asset not found', async () => {
      prismaMock.asset.findUnique.mockResolvedValue(null);
      await expect(getQrCode('invalid-id')).rejects.toThrow('Asset not found');
    });
  });
});
