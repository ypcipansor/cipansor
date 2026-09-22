import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAlumni, updateAlumni } from './alumni.service';
import { prisma } from '@/lib/prisma';

/**
 * Alumni `photo` is a client-supplied blob reference consumed by create and
 * update, so both take the blob-claim protocol (BUG 4 / flag 9). A save that
 * loses the claim race must abort before the row references the blob.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    alumni: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn(),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/student-unit-history', () => ({ closeUnitEnrollments: vi.fn() }));

import { claimBlobForRecord, releaseBlobClaimById } from '@/utils/blob-claim';

const PHOTO = '/uploads/wajah.png';
const tx = { alumni: { create: vi.fn(), update: vi.fn() } };
const actor = { id: 'user-1', role: 'SUPER_ADMIN', roleCode: 'SUPER_ADMIN', unitId: 'unit-1' };

describe('alumni photo claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    (prisma.alumni.count as any).mockResolvedValue(0);
    (prisma.alumni.findUnique as any).mockResolvedValue({ id: 'a1', unitId: 'unit-1' });
    (prisma.alumni.findFirst as any).mockResolvedValue({ id: 'a1', unitId: 'unit-1' });
    tx.alumni.create.mockResolvedValue({ id: 'a1' });
    tx.alumni.update.mockResolvedValue({ id: 'a1' });
  });

  it('claims the photo before create and releases it inside the transaction', async () => {
    const handle = { id: 'h1', operationToken: 't1', kind: 'RECORD' };
    (claimBlobForRecord as any).mockResolvedValue(handle);

    await createAlumni(
      { unitId: 'unit-1', name: 'Budi', gender: 'MALE', graduationYear: 2024, photo: PHOTO } as any,
      actor as any
    );

    expect(claimBlobForRecord).toHaveBeenCalledWith(PHOTO, expect.anything(), tx);
    expect((claimBlobForRecord as any).mock.invocationCallOrder[0]).toBeLessThan(
      tx.alumni.create.mock.invocationCallOrder[0]
    );
    expect(releaseBlobClaimById).toHaveBeenCalledWith(handle, tx);
  });

  it('aborts the create when the photo is contended', async () => {
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(
      createAlumni(
        { unitId: 'unit-1', name: 'Budi', gender: 'MALE', graduationYear: 2024, photo: PHOTO } as any,
        actor as any
      )
    ).rejects.toThrow(/sedang diproses/);
    expect(tx.alumni.create).not.toHaveBeenCalled();
  });

  it('claims a replacement photo before update commits', async () => {
    const handle = { id: 'h2', operationToken: 't2', kind: 'RECORD' };
    (claimBlobForRecord as any).mockResolvedValue(handle);

    await updateAlumni('a1', { photo: PHOTO } as any, actor as any);

    expect(claimBlobForRecord).toHaveBeenCalledWith(PHOTO, expect.anything(), tx);
    expect(tx.alumni.update).toHaveBeenCalled();
    expect(releaseBlobClaimById).toHaveBeenCalledWith(handle, tx);
  });

  it('aborts the update when the replacement photo is contended', async () => {
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(updateAlumni('a1', { photo: PHOTO } as any, actor as any)).rejects.toThrow(
      /sedang diproses/
    );
    expect(tx.alumni.update).not.toHaveBeenCalled();
  });

  it('does not claim when no photo is supplied', async () => {
    await createAlumni(
      { unitId: 'unit-1', name: 'Budi', gender: 'MALE', graduationYear: 2024 } as any,
      actor as any
    );
    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(tx.alumni.create).toHaveBeenCalled();
  });
});
