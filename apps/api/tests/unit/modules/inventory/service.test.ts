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

// Mock notifications service with correct relative path (4 levels up)
vi.mock('../../../../src/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn(),
}));

import { createNotification } from '../../../../src/modules/notifications/notifications.service';

// The maintenance invoice is a client-uploaded blob: the service claims it
// before writing the row (BUG 4 / flag 9). The claim protocol itself has its
// own unit + integration tests; here the claim is stubbed.
vi.mock('../../../../src/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn().mockResolvedValue({
    id: 'claim-1',
    operationToken: 'token-1',
    kind: 'RECORD',
  }),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
}));
import { claimBlobForRecord, releaseBlobClaimById } from '../../../../src/utils/blob-claim';

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

    it('claims the invoice blob before writing and releases it after (BUG 4)', async () => {
      const maintenanceId = 'm-invoice';
      prismaMock.assetMaintenance.findUnique.mockResolvedValue({
        id: maintenanceId,
        assetId: 'asset-1',
        status: AssetMaintenanceStatus.IN_PROGRESS,
      });
      prismaMock.assetMaintenance.update.mockResolvedValue({ id: maintenanceId });

      await updateMaintenanceStatus(
        maintenanceId,
        { status: AssetMaintenanceStatus.IN_PROGRESS, invoiceUrl: 'https://cdn.test/inv.pdf' },
        'admin-1'
      );

      // Claimed before the row write so a discard cannot race the update.
      expect(claimBlobForRecord).toHaveBeenCalledWith('https://cdn.test/inv.pdf', 'admin-1');
      expect(releaseBlobClaimById).toHaveBeenCalledWith(expect.objectContaining({ id: 'claim-1' }));
    });

    it('refuses the update when the invoice blob is claimed elsewhere (BUG 4)', async () => {
      prismaMock.assetMaintenance.findUnique.mockResolvedValue({
        id: 'm-busy',
        assetId: 'asset-1',
        status: AssetMaintenanceStatus.IN_PROGRESS,
      });
      vi.mocked(claimBlobForRecord).mockResolvedValueOnce(null);

      await expect(
        updateMaintenanceStatus(
          'm-busy',
          { status: AssetMaintenanceStatus.IN_PROGRESS, invoiceUrl: 'https://cdn.test/busy.pdf' },
          'admin-1'
        )
      ).rejects.toThrow(/sedang diproses pihak lain/);

      expect(prismaMock.assetMaintenance.update).not.toHaveBeenCalled();
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
