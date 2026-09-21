import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseBlobUrl, deleteFromCloudStorage } from '@/utils/cloud-storage';
import { resolveLocalUploadPath, removeLocalUpload } from '@/utils/local-upload-store';
import { BlobReconcileStatus } from '@prisma/client';

/**
 * Reconciliation for discarded (`blob_claims.discarded_at IS NOT NULL`) blobs
 * whose physical delete outcome is unknown (BUG 7 / flag 11).
 *
 * ## Why this job must exist
 *
 * A discard tombstones its claim and then deletes. If the delete throws, the
 * tombstone is deliberately KEPT (never released): the request may have been
 * applied remotely before the error reached us, and releasing the row would let
 * a create re-claim the URL and persist a reference to a blob that no longer
 * exists. That is fail-closed, but it leaves the blob's true state unknown.
 * Retrying the delete is the only thing that can answer that, and it is safe:
 * delete on an already-absent blob is an idempotent success.
 *
 * ## No starvation (flag 11)
 *
 * The old job selected the oldest tombstones and never recorded its result, so
 * the same rows were re-examined every run and a backlog larger than `limit`
 * starved every newer row. Now:
 *
 *  - A success (or an already-absent blob) sets `reconcileStatus = DONE` and
 *    `reconciledAt`, so the row is never selected again.
 *  - A failure bumps `reconcileAttempts`, stamps `lastReconcileAt` and moves
 *    `nextReconcileAt` forward with bounded exponential backoff.
 *  - A malformed / foreign URL is moved to `QUARANTINED`, terminal, so it stops
 *    consuming the batch.
 *  - Only `PENDING` rows past `nextReconcileAt` are selected, so every row
 *    eventually gets a turn.
 */

/** `audit_logs.action` written by each run. */
export const BLOB_DISCARD_RECONCILE_AUDIT_ACTION = 'BLOB_DISCARD_RECONCILE';
/** `audit_logs.entity` for the same rows. */
export const BLOB_DISCARD_RECONCILE_AUDIT_ENTITY = 'BlobClaim';

/** How many tombstones one run will examine. */
export const BLOB_DISCARD_RECONCILE_LIMIT = 200;

/** Bounded retry: after this many failures a row is quarantined. */
export const BLOB_DISCARD_MAX_ATTEMPTS = 5;

/** Base backoff between retries, doubled per attempt. */
export const BLOB_DISCARD_RETRY_BASE_MS = 5 * 60 * 1000;

export interface BlobDiscardReconcileSummary {
  /** Tombstoned claims considered this run. */
  examined: number;
  /** Blobs whose delete succeeded (or were already gone). */
  deleted: number;
  /** Blobs that could not be deleted this run; rescheduled. */
  failed: number;
  /** Rows quarantined as malformed/foreign URLs. */
  skipped: number;
}

export interface BlobDiscardReconcileOptions {
  /** Cap on rows examined; defaults to {@link BLOB_DISCARD_RECONCILE_LIMIT}. */
  limit?: number;
  /** When true, report what would happen without deleting anything. */
  dryRun?: boolean;
}

/**
 * Re-run the delete for tombstoned blobs whose outcome is unknown.
 *
 * A tombstone older than the discard claim TTL is eligible: before that the
 * original discard request may still be running this job would race it.
 */
export async function reconcileDiscardedBlobs(
  options: BlobDiscardReconcileOptions = {}
): Promise<BlobDiscardReconcileSummary> {
  const limit = options.limit ?? BLOB_DISCARD_RECONCILE_LIMIT;
  const dryRun = options.dryRun ?? false;

  const eligibleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const now = new Date();

  const rows = await prisma.blobClaim.findMany({
    where: {
      discardedAt: { not: null, lt: eligibleBefore },
      reconcileStatus: BlobReconcileStatus.PENDING,
      OR: [{ nextReconcileAt: null }, { nextReconcileAt: { lte: now } }],
    },
    // Oldest tombstone first, but only among rows that are actually due, so a
    // poison row cannot be picked ahead of a fresh one forever.
    orderBy: { discardedAt: 'asc' },
    take: limit,
    select: { id: true, blobUrl: true, reconcileAttempts: true },
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
      // Could be a valid LOCAL upload path, or a malformed/foreign URL. A local
      // file is still ours to reclaim; anything else is quarantined terminal so
      // it stops consuming the batch.
      const localPath = await resolveLocalUploadPath(row.blobUrl).catch(() => null);
      if (!localPath) {
        summary.skipped += 1;
        if (!dryRun) await quarantineRow(row.id);
        continue;
      }
      if (dryRun) {
        summary.deleted += 1;
        continue;
      }
      try {
        await removeLocalUpload(localPath);
        summary.deleted += 1;
        await markDone(row.id);
      } catch (error) {
        summary.failed += 1;
        await scheduleRetry(row.id, row.reconcileAttempts);
        logger.warn('[BlobReconcile] Local delete retry failed; rescheduled', {
          blobUrl: row.blobUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    if (dryRun) {
      summary.deleted += 1;
      continue;
    }

    try {
      // `deleteFromCloudStorage` treats 404/BlobNotFound as success, so an
      // already-absent blob terminates here instead of retrying forever.
      await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
      summary.deleted += 1;
      await markDone(row.id);
    } catch (error) {
      summary.failed += 1;
      await scheduleRetry(row.id, row.reconcileAttempts);
      logger.warn('[BlobReconcile] Retry delete failed; rescheduled', {
        blobUrl: row.blobUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await recordReconcileAudit(summary, dryRun);
  return summary;
}

/** Terminal success: never selected again. */
async function markDone(id: string): Promise<void> {
  await prisma.blobClaim.update({
    where: { id },
    data: {
      reconcileStatus: BlobReconcileStatus.DONE,
      reconciledAt: new Date(),
      nextReconcileAt: null,
    },
  });
}

/** Terminal quarantine: malformed/foreign URL, never retried. */
async function quarantineRow(id: string): Promise<void> {
  await prisma.blobClaim.update({
    where: { id },
    data: {
      reconcileStatus: BlobReconcileStatus.QUARANTINED,
      reconciledAt: new Date(),
      nextReconcileAt: null,
    },
  });
}

/** Bounded exponential backoff; gives up into quarantine after the cap. */
async function scheduleRetry(id: string, attempts: number): Promise<void> {
  const nextAttempt = attempts + 1;
  if (nextAttempt >= BLOB_DISCARD_MAX_ATTEMPTS) {
    await quarantineRow(id);
    return;
  }
  const backoffMs = BLOB_DISCARD_RETRY_BASE_MS * 2 ** attempts;
  await prisma.blobClaim.update({
    where: { id },
    data: {
      reconcileAttempts: nextAttempt,
      lastReconcileAt: new Date(),
      nextReconcileAt: new Date(Date.now() + backoffMs),
    },
  });
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
