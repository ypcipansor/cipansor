import {
  claimBlobForDiscard,
  releaseBlobClaimById,
  markBlobDiscarded,
} from '@/utils/blob-claim';

/** Result of {@link discardUnderClaim}; the caller maps it to a response. */
export type DiscardOutcome = 'deleted' | 'referenced' | 'busy' | 'claim-lost';

/**
 * The ONE storage-agnostic discard protocol, shared by Azure and local.
 *
 * Ordering is the invariant:
 *
 *   claim → final probe under the claim → tombstone → physical delete.
 *
 * A physical delete that throws after the tombstone is deliberately left
 * tombstoned (never released): it may have been applied remotely, so releasing
 * would let a create resurrect a URL whose bytes are gone. Reconciliation
 * resolves the outcome later.
 *
 * Returns a status instead of throwing so the storage layer stays free of HTTP
 * concerns; `busy` and `claim-lost` are both "someone else owns it", `referenced`
 * is "a live record still points here".
 *
 * Lives in its own module so the storage layer and the orphan-discard service
 * share exactly one implementation (the service tests mock the low-level
 * `blob-claim` primitives, not this orchestration).
 */
export async function discardUnderClaim(
  blobUrl: string,
  holderId: string,
  probe: () => Promise<boolean>,
  physicalDelete: () => Promise<void>
): Promise<DiscardOutcome> {
  const claim = await claimBlobForDiscard(blobUrl, holderId);
  if (!claim) return 'busy';

  let tombstoned = false;
  try {
    // Final exhaustive probe UNDER the claim: catches anything that committed
    // before the claim was taken. After this point the claim blocks new commits.
    if (await probe()) {
      await releaseBlobClaimById(claim).catch(() => undefined);
      return 'referenced';
    }

    // Close the last window: tombstone atomically. From this instant no create
    // can take the row over, so the delete cannot land on a live blob.
    if (!(await markBlobDiscarded(claim))) {
      await releaseBlobClaimById(claim).catch(() => undefined);
      return 'claim-lost';
    }
    tombstoned = true;

    await physicalDelete();
    return 'deleted';
  } catch (error) {
    // Only a pre-tombstone abort releases; a post-tombstone failure keeps the
    // row terminal so a create cannot reference a possibly-deleted blob.
    if (!tombstoned) {
      await releaseBlobClaimById(claim).catch(() => undefined);
    }
    throw error;
  }
}
