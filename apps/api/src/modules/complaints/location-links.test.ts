import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = { complaint: { create: vi.fn() } };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    complaint: { create: vi.fn() },
  },
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobsForRecord: vi.fn(),
  releaseBlobClaims: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/prisma';
import { claimBlobsForRecord } from '@/utils/blob-claim';
import { complaintsService } from './complaints.service';

const mocked = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};

describe('complaintsService.create (Si-Peka location links)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.$transaction.mockImplementation(async (fn: any) => fn(tx));
    tx.complaint.create.mockResolvedValue({ id: 'c1' });
    (claimBlobsForRecord as any).mockResolvedValue([]);
  });

  it('persists building/room/asset references when provided', async () => {
    await complaintsService.create({
      unitId: 'unit-1',
      userId: 'user-1',
      category: 'FACILITY' as never,
      subject: 'AC ruang 7A mati total',
      description: 'AC di ruang kelas 7A tidak menyala sejak kemarin pagi.',
      buildingId: 'bld-1',
      roomId: 'room-7a',
      assetId: 'asset-ac-1',
    });

    expect(tx.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildingId: 'bld-1',
          roomId: 'room-7a',
          assetId: 'asset-ac-1',
        }),
      })
    );
  });

  it('leaves location links undefined when not supplied (plain complaints unchanged)', async () => {
    await complaintsService.create({
      unitId: 'unit-1',
      userId: 'user-1',
      category: 'SERVICE' as never,
      subject: 'Antrean lama di TU',
      description: 'Pelayanan tata usaha memakan waktu lebih dari satu jam.',
    });

    const args = tx.complaint.create.mock.calls[0][0];
    expect(args.data.buildingId).toBeUndefined();
    expect(args.data.roomId).toBeUndefined();
    expect(args.data.assetId).toBeUndefined();
  });
});
