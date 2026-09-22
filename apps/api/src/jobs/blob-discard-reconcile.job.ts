import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  parseBlobUrl,
  deleteBlobFromCloudStorage,
  configuredStorageAccount,
} from '@/utils/cloud-storage';
import { parseAzureBlobIdentityKey } from '@/utils/blob-identity';
import {
  inspectLocalUploadRef,
  removeLocalUpload,
  type LocalUploadRef,
} from '@/utils/local-upload-store';
import { BlobReconcileStatus, Prisma } from '@prisma/client';

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
 *  - Storage credentials missing is NOT a success: the delete was never
 *    attempted, so the row is rescheduled (`unavailable`) rather than stamped
 *    `DONE` — otherwise restoring the credentials would never reclaim the blob.
 *
 * ## One worker per row
 *
 * The scheduler can run on several API replicas, so a run takes a short-lived
 * lease on each row (`reconcile_lease_owner` / `reconcile_lease_expires_at`, a
 * single conditional UPDATE) before touching it. A replica that cannot take the
 * lease skips the row, so the physical delete, the retry counter and the audit
 * trail are never raced. The lease is not renewed: it expires well within the
 * hourly schedule, so a crashed worker's rows return on the next run.
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

/** Ceiling on the exponential backoff, so a long outage still retries hourly. */
export const BLOB_DISCARD_RETRY_MAX_MS = 60 * 60 * 1000;

/**
 * How long a worker's lease on a row lasts. The scheduler runs hourly, so a
 * lease that outlives the run but is shorter than the schedule guarantees a
 * crashed replica's rows become eligible again on the next run.
 */
export const BLOB_DISCARD_LEASE_MS = 5 * 60 * 1000;

/** Identifies this worker process in `blob_claims.reconcile_lease_owner`. */
export const BLOB_DISCARD_WORKER_ID = `${process.env.HOSTNAME ?? 'worker'}:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;

export interface BlobDiscardReconcileSummary {
  /** Tombstoned claims considered this run. */
  examined: number;
  /** Blobs whose delete succeeded (or were already gone). */
  deleted: number;
  /** Blobs that could not be deleted this run; rescheduled. */
  failed: number;
  /** Rows quarantined as malformed/foreign URLs. */
  skipped: number;
  /**
   * Rows reevaluated but not attempted because storage credentials are not
   * configured. Kept separate from `failed` so an operator can tell "Azure is
   * unreachable" from "Azure credentials are missing" at a glance.
   */
  unavailable: number;
  /**
   * Rows already locked by another worker (another replica) this run. They are
   * neither processed nor counted as failures; the owning worker does the work.
   */
  busy: number;
}

export interface BlobDiscardReconcileOptions {
  /** Cap on rows examined; defaults to {@link BLOB_DISCARD_RECONCILE_LIMIT}. */
  limit?: number;
  /** When true, report what would happen without deleting anything. */
  dryRun?: boolean;
}

/**
 * Atomically take a short-lived lease on a due `PENDING` row for reconciliation.
 *
 * Exposed so the multi-replica mutual exclusion can be proven against a real
 * Postgres (a mocked conditional UPDATE proves nothing about row locking):
 * exactly one caller may hold a row at a time.
 */
export async function claimRowForReconcile(id: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "blob_claims"
    SET "reconcile_lease_owner" = ${BLOB_DISCARD_WORKER_ID},
        "reconcile_lease_expires_at" = now() + (${BLOB_DISCARD_LEASE_MS}::int * interval '1 millisecond')
    WHERE "id" = ${id}
      AND "reconcile_status" = 'PENDING'::"BlobReconcileStatus"
      AND "discarded_at" IS NOT NULL
      AND ("reconcile_lease_expires_at" IS NULL OR "reconcile_lease_expires_at" < now())
      AND ("next_reconcile_at" IS NULL OR "next_reconcile_at" <= now())
    RETURNING "id"
  `);
  return rows.length > 0;
}

/**
 * Resolve a persisted claim key to the storage coordinates to delete, or null
 * when the row does not name a blob this deployment owns.
 *
 * Claim rows persist the CANONICAL key (`azure://<account>/<container>/<blob>`,
 * or `/uploads/<file>`), not a raw URL — `parseBlobUrl` therefore returns null
 * for a valid Azure claim and the job used to quarantine it as a foreign URL,
 * silently never reclaiming the blob. Parse the canonical key here.
 *
 * The configured account is enforced: a claim naming an account we do not own
 * is refused (quarantined) rather than sent to our storage client.
 */
function resolveAzureClaim(key: string): { containerName: string; blobName: string } | null {
  const identity = parseAzureBlobIdentityKey(key);
  if (!identity) return null;
  const account = configuredStorageAccount();
  if (!account || identity.account !== account) return null;
  return { containerName: identity.container, blobName: identity.blobPath };
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
    examined: 0,
    deleted: 0,
    failed: 0,
    skipped: 0,
    unavailable: 0,
    busy: 0,
  };

  for (const row of rows) {
    // Dry run takes nothing and touches nothing; report and move on.
    if (dryRun) {
      summary.examined += 1;
      const parsed = parseBlobUrl(row.blobUrl) ?? resolveAzureClaim(row.blobUrl);
      if (parsed) {
        summary.deleted += 1;
        continue;
      }
      const inspected = await inspectLocalUploadRef(row.blobUrl).catch((): LocalUploadRef => ({
        kind: 'error',
      }));
      // A resolved OR already-absent trusted local reference would end DONE.
      if (inspected.kind === 'resolved' || inspected.kind === 'absent') summary.deleted += 1;
      else summary.skipped += 1;
      continue;
    }

    // One worker per row. Another replica that fails to take the lease skips it
    // entirely rather than racing the same delete, retry counter and audit trail.
    if (!(await claimRowForReconcile(row.id))) {
      summary.busy += 1;
      continue;
    }
    summary.examined += 1;

    const parsed = parseBlobUrl(row.blobUrl) ?? resolveAzureClaim(row.blobUrl);

    if (!parsed) {
      // Could be a valid LOCAL upload reference, an already-absent one, a
      // malformed/traversal/foreign URL, or a transient filesystem failure.
      const inspected = await inspectLocalUploadRef(row.blobUrl).catch((): LocalUploadRef => ({
        kind: 'error',
      }));

      if (inspected.kind === 'invalid') {
        // Malformed, traversal, a foreign URL, or a symlink out of the root:
        // never ours to delete, terminal so it stops consuming the batch.
        summary.skipped += 1;
        await quarantineRow(row.id);
        continue;
      }

      if (inspected.kind === 'error') {
        // The filesystem could not be inspected (EACCES/EIO). Retry rather than
        // quarantine or stamp DONE — the file may still be on disk.
        summary.failed += 1;
        await scheduleRetry(row.id, row.reconcileAttempts);
        logger.warn('[BlobReconcile] Local reference could not be inspected; rescheduled', {
          blobUrl: row.blobUrl,
        });
        continue;
      }

      if (inspected.kind === 'absent') {
        // A trusted local reference whose file is already gone: the earlier
        // delete succeeded (or the file was removed out of band). Idempotent
        // success — terminal DONE, never a quarantine.
        summary.deleted += 1;
        await markDone(row.id);
        continue;
      }

      try {
        await removeLocalUpload(inspected.path);
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

    try {
      // The explicit outcome is what makes "credentials missing" impossible to
      // mistake for "deleted": `unavailable` means no remote request ran, so the
      // row is rescheduled (never marked DONE) and a later run — after the
      // credentials are restored — retries it.
      const outcome = await deleteBlobFromCloudStorage(parsed.containerName, parsed.blobName);
      if (outcome === 'unavailable') {
        summary.unavailable += 1;
        summary.failed += 1;
        // A missing connection string is a deploy/configuration condition, not
        // a poison row: it WILL recover, so this must never quarantine. Just
        // reschedule and keep the retry counter for observability.
        await scheduleRetry(row.id, row.reconcileAttempts, { quarantineAtCap: false });
        logger.warn(
          '[BlobReconcile] Azure credentials unavailable; delete not attempted, rescheduled',
          { blobUrl: row.blobUrl }
        );
        continue;
      }
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
async function scheduleRetry(
  id: string,
  attempts: number,
  opts: { quarantineAtCap?: boolean } = {}
): Promise<void> {
  const quarantineAtCap = opts.quarantineAtCap ?? true;
  const nextAttempt = attempts + 1;
  if (quarantineAtCap && nextAttempt >= BLOB_DISCARD_MAX_ATTEMPTS) {
    await quarantineRow(id);
    return;
  }
  // Cap the wait so a transmission that may recover soon (missing credentials)
  // is still retried within the hour rather than doubling unbounded.
  const backoffMs = Math.min(BLOB_DISCARD_RETRY_BASE_MS * 2 ** attempts, BLOB_DISCARD_RETRY_MAX_MS);
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
          unavailable: summary.unavailable,
          busy: summary.busy,
        },
      },
    });
  } catch (error) {
    logger.error('[BlobReconcile] Failed to write reconcile audit log', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
