import { describe, it, expect, vi, beforeEach } from 'vitest';
import { complaintsService } from '../complaints.service';
import { prisma } from '@/lib/prisma';

/**
 * Complaint `attachments` is a list of client-supplied blob URLs, so `create`
 * takes the blob-claim protocol (BUG 4 / flag 9). A create that loses the claim
 * race must fail before it commits a row whose attachment a discard may already
 * own.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    complaint: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobsForRecord: vi.fn(),
  releaseBlobClaims: vi.fn().mockResolvedValue(undefined),
}));

import { claimBlobsForRecord, releaseBlobClaims } from '@/utils/blob-claim';

const A = '/uploads/a.png';
const B = '/uploads/b.png';
const tx = { complaint: { create: vi.fn() } };

const data = {
  unitId: 'unit-1',
  userId: 'user-1',
  category: 'FACILITY' as any,
  subject: 'Kerusakan',
  description: 'Deskripsi panjang sekali',
  attachments: [A, B],
};

describe('complaintsService.create claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.complaint.create.mockResolvedValue({ id: 'c1' });
  });

  it('claims every attachment before the row is inserted, then releases inside the transaction', async () => {
    const handles = [
      { id: 'h1', operationToken: 't1', kind: 'RECORD' },
      { id: 'h2', operationToken: 't2', kind: 'RECORD' },
    ];
    (claimBlobsForRecord as any).mockResolvedValue(handles);

    await complaintsService.create(data as any);

    expect(claimBlobsForRecord).toHaveBeenCalledWith([A, B], 'user-1', tx);
    // Claim first, insert second: the inverse order is the race.
    expect((claimBlobsForRecord as any).mock.invocationCallOrder[0]).toBeLessThan(
      tx.complaint.create.mock.invocationCallOrder[0]
    );
    expect(releaseBlobClaims).toHaveBeenCalledWith(handles, tx);
  });

  it('rejects the create when a blob is held by another operation and inserts nothing', async () => {
    (claimBlobsForRecord as any).mockResolvedValue(null);

    await expect(complaintsService.create(data as any)).rejects.toThrow(/sedang diproses/);
    expect(tx.complaint.create).not.toHaveBeenCalled();
  });

  it('skips the claim when there are no attachments', async () => {
    (claimBlobsForRecord as any).mockResolvedValue([]);
    await complaintsService.create({ ...data, attachments: [] } as any);
    expect(claimBlobsForRecord).toHaveBeenCalledWith([], 'user-1', tx);
    expect(tx.complaint.create).toHaveBeenCalled();
  });
});
