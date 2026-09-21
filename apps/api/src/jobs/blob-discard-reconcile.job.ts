import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseBlobUrl, deleteFromCloudStorage } from '@/utils/cloud-storage';

/**
 * Reconciliation for discarded (`blob_claims.discarded_at IS NOT NULL`) blobs
 * whose Azure delete outcome is unknown (BUG 7).
 *
 * ## Why this job must exist
 *
 * A discard tombstones its claim and then calls Azure. If the delete throws,
 * the tombstone is deliberately KEPT (never released): the request may have
 * been applied at Azure before the error reached us, and releasing the row
 * would let a create re-claim the URL and persist a reference to a blob that no
 * longer exists. That is fail-closed, but it leaves the blob's true state
 * unknown — did the delete land or not?
 *
 * Retrying the delete is the only thing that can answer that, and it is safe to
 * retry: `deleteBlob` on an already-absent blob is an idempotent success at
 * Azure, and the tombstone means no record can ever reference the URL again, so
 * removing the bytes (or confirming they are gone) cannot break a live record.
 *
 * This job walks the tombstoned, expired claims and re-runs the delete. A URL
 * that is malformed or no longer owned by this application is skipped — it was
 * never ours to delete.
 *
 * ## Bounded, recorded, idempotent
 *
 *  - Bounded: at most `limit` rows per run, oldest first, so a backlog cannot
 *    turn one nightly run into an unbounded Azure sweep.
 *  - Recorded: one `audit_logs` row per run, even when nothing was found — the
 *    same discipline the identity/transcript purges use, so "when did we last
 *    enforce this" is answerable from the database after log rotation.
 *  - Idempotent: deleting an already-deleted blob succeeds, and a failed retry
 *    is simply retried next run.
 */

/** `audit_logs.action` written by each run. */
export const BLOB_DISCARD_RECONCILE_AUDIT_ACTION = 'BLOB_DISCARD_RECONCILE';
/** `audit_logs.entity` for the same rows. */
export const BLOB_DISCARD_RECONCILE_AUDIT_ENTITY = 'BlobClaim';

/** How many tombstones one run will examine. */
export const BLOB_DISCARD_RECONCILE_LIMIT = 200;

export interface BlobDiscardReconcileSummary {
  /** Tombstoned claims considered this run. */
  examined: number;
  /** Blobs whose delete was re-run and succeeded (or was already gone). */
  deleted: number;
  /** Blobs that could not be deleted this run; retried next run. */
  failed: number;
  /** Rows skipped as malformed or not owned by this application. */
  skipped: number;
}

export interface BlobDiscardReconcileOptions {
  /** Cap on rows examined; defaults to {@link BLOB_DISCARD_RECONCILE_LIMIT}. */
  limit?: number;
  /** When true, report what would happen without calling Azure. */
  dryRun?: boolean;
}

/**
 * Re-run the delete for tombstoned blobs whose outcome is unknown.
 *
 * A tombstone older than the discard claim TTL is eligible: before that the
 * original discard request may still be running and this job would race its
 * release/probe work. `discarded_at` is set immediately before the Azure call,
 * so anything at least one TTL old is a delete that has finished (successfully
 * or not) from the original request's point of view.
 */
export async function reconcileDiscardedBlobs(
  options: BlobDiscardReconcileOptions = {}
): Promise<BlobDiscardReconcileSummary> {
  const limit = options.limit ?? BLOB_DISCARD_RECONCILE_LIMIT;
  const dryRun = options.dryRun ?? false;

  // One discard TTL of grace: the original request holds its claim across the
  // delete, so an entry younger than this may still be in flight.
  const eligibleBefore = new Date(Date.now() - 5 * 60 * 1000);

  const rows = await prisma.blobClaim.findMany({
    where: {
      discardedAt: { not: null, lt: eligibleBefore },
    },
    orderBy: { discardedAt: 'asc' },
    take: limit,
    select: { id: true, blobUrl: true, holderId: true, discardedAt: true },
  });

  const summary: BlobDiscardReconcileSummary = {
    examined: rows.length,
    deleted: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const parsed = parseBlobUrl(row.blobUrl);
    if (!parsed) {
      // Malformed, or a blob belonging to another storage account. It was never
      // ours to delete; skip rather than throw.
      summary.skipped += 1;
      continue;
    }

    if (dryRun) {
      summary.deleted += 1;
      continue;
    }

    try {
      await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
      summary.deleted += 1;
    } catch (error) {
      summary.failed += 1;
      logger.warn('[BlobReconcile] Retry delete failed; will retry next run', {
        blobUrl: row.blobUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await recordReconcileAudit(summary, dryRun);
  return summary;
}

/**
 * Write one audit row per run. Never allowed to fail the job: the deletion work
 * is the point, and losing the summary should not undo it.
 */
async function recordReconcileAudit(
  summary: BlobDiscardReconcileSummary,
  dryRun: boolean
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: BLOB_DISCARD_RECONCILE_AUDIT_ACTION,
        entity: BLOB_DISCARD_RECONCILE_AUDIT_ENTITY,
        entityId: null,
        newValues: {
          dryRun,
          examined: summary.examined,
          deleted: summary.deleted,
          failed: summary.failed,
          skipped: summary.skipped,
        },
      },
    });
  } catch (error) {
    logger.error('[BlobReconcile] Failed to write reconcile audit log', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
