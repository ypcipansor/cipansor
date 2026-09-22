import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discardUnderClaim } from '@/utils/blob-discard';
import {
  claimBlobForDiscard,
  releaseBlobClaimById,
  markBlobDiscarded,
  markBlobReconcileDone,
  type BlobClaimHandle,
} from '@/utils/blob-claim';

vi.mock('@/utils/blob-claim', () => ({
  claimBlobForDiscard: vi.fn(),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
  markBlobDiscarded: vi.fn(),
  markBlobReconcileDone: vi.fn().mockResolvedValue(true),
}));

const HANDLE: BlobClaimHandle = {
  id: 'claim-1',
  operationToken: 'tok-1',
  kind: 'DISCARD',
};

/**
 * The single claim → probe → tombstone → delete protocol (BUG 4 / BUG 8 /
 * BUG 9). Ordering is the invariant, so these tests assert ordering, not just
 * outcomes.
 */
describe('discardUnderClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (claimBlobForDiscard as any).mockResolvedValue(HANDLE);
    (markBlobDiscarded as any).mockResolvedValue(true);
  });

  it('claims, probes, tombstones, then deletes — in that order', async () => {
    const order: string[] = [];
    (claimBlobForDiscard as any).mockImplementation(async () => {
      order.push('claim');
      return HANDLE;
    });
    const probe = vi.fn(async () => {
      order.push('probe');
      return false;
    });
    (markBlobDiscarded as any).mockImplementation(async () => {
      order.push('tombstone');
      return true;
    });
    const del = vi.fn(async () => {
      order.push('delete');
    });

    await expect(discardUnderClaim('u', 'holder', probe, del)).resolves.toBe('deleted');
    expect(order).toEqual(['claim', 'probe', 'tombstone', 'delete']);
    // A successful delete does NOT release: the tombstone is terminal.
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });

  it('returns busy when another operation owns the claim', async () => {
    (claimBlobForDiscard as any).mockResolvedValue(null);
    const probe = vi.fn();
    const del = vi.fn();

    await expect(discardUnderClaim('u', 'holder', probe, del)).resolves.toBe('busy');
    expect(probe).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('returns referenced and releases when the final probe finds a live record', async () => {
    const del = vi.fn();
    await expect(
      discardUnderClaim('u', 'holder', async () => true, del)
    ).resolves.toBe('referenced');
    expect(del).not.toHaveBeenCalled();
    expect(markBlobDiscarded).not.toHaveBeenCalled();
    expect(releaseBlobClaimById).toHaveBeenCalledWith(HANDLE);
  });

  it('returns claim-lost and releases when the tombstone cannot be set', async () => {
    (markBlobDiscarded as any).mockResolvedValue(false);
    const del = vi.fn();

    await expect(discardUnderClaim('u', 'holder', async () => false, del)).resolves.toBe(
      'claim-lost'
    );
    expect(del).not.toHaveBeenCalled();
    expect(releaseBlobClaimById).toHaveBeenCalledWith(HANDLE);
  });

  it('keeps the tombstone when the physical delete throws (BUG 7)', async () => {
    const del = vi.fn().mockRejectedValue(new Error('azure down'));

    await expect(discardUnderClaim('u', 'holder', async () => false, del)).rejects.toThrow(
      'azure down'
    );
    expect(markBlobDiscarded).toHaveBeenCalled();
    // Releasing here would let a create reference a possibly-deleted blob.
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
    // A failed delete must stay reconcilable, NOT terminal.
    expect(markBlobReconcileDone).not.toHaveBeenCalled();
  });

  // ── Finding 4: a successful delete is terminal ─────────────────────────────

  it('marks reconciliation DONE after a successful physical delete (finding 4a)', async () => {
    (markBlobReconcileDone as any).mockClear();
    const del = vi.fn(async () => {});

    await expect(discardUnderClaim('u', 'holder', async () => false, del)).resolves.toBe('deleted');

    expect(markBlobReconcileDone).toHaveBeenCalledWith(HANDLE);
    // Never release the tombstone: the URL must stay terminal.
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });

  it('does not mark DONE when the physical delete fails (finding 4b — still retryable)', async () => {
    (markBlobReconcileDone as any).mockClear();
    const del = vi.fn().mockRejectedValue(new Error('transient'));

    await expect(discardUnderClaim('u', 'holder', async () => false, del)).rejects.toThrow(
      'transient'
    );

    expect(markBlobReconcileDone).not.toHaveBeenCalled();
    // The tombstone remains, so reconciliation retries the delete.
    expect(markBlobDiscarded).toHaveBeenCalled();
  });

  it('keeps the tombstone when recording DONE fails after a successful delete (finding 4c)', async () => {
    (markBlobReconcileDone as any).mockClear();
    (markBlobReconcileDone as any).mockRejectedValueOnce(new Error('db blip'));
    const del = vi.fn(async () => {});

    // The delete succeeded, so the request must still resolve as `deleted`; the
    // failed bookkeeping must not turn it into an error or reopen the URL.
    await expect(discardUnderClaim('u', 'holder', async () => false, del)).resolves.toBe('deleted');
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });
});
