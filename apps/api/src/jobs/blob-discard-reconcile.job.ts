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
 *
 * The lease is RENEWED while a row is being processed (finding D). The Azure
 * SDK does not apply a client-side per-request timeout by default
 * (`tryTimeoutInMs` is undefined and the server default governs), and a single
 * `deleteBlob` can retry 4 times with exponential backoff — so one row's work
 * was not provably under 5 minutes, and a second replica could take the row and
 * race the delete/retry/audit. A short per-operation abort
 * ({@link BLOB_DISCARD_OPERATION_TIMEOUT_MS}) plus the heartbeat below keep a
 * live worker's lease from lapsing mid-operation, while a crashed worker's rows
 * still return on the next run.
 */
export const BLOB_DISCARD_LEASE_MS = 5 * 60 * 1000;

/**
 * Hard ceiling on one storage operation (an Azure delete), well under the
 * lease. Without it a hung connection could hold a worker past the lease and
 * let a second replica start the same row.
 */
export const BLOB_DISCARD_OPERATION_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * How often the worker renews a lease it still holds while processing a row.
 * Deliberately shorter than {@link BLOB_DISCARD_OPERATION_TIMEOUT_MS}, so a
 * renewal always lands before the operation deadline and a live worker's lease
 * cannot lapse mid-delete.
 */
export const BLOB_DISCARD_LEASE_RENEW_INTERVAL_MS = 60 * 1000;

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
 * Renew this worker's lease on a row it still owns (finding D).
 *
 * Called on a heartbeat while a row is being processed, so a storage operation
 * that approaches the lease duration cannot let the lease lapse mid-flight and
 * hand the row to a second replica. Returns false once the lease is no longer
 * ours (a takeover), which a caller could use to abort; the status writes are
 * themselves lease-guarded, so a lost lease can never stamp the row.
 */
export async function renewReconcileLease(id: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "blob_claims"
    SET "reconcile_lease_expires_at" = now() + (${BLOB_DISCARD_LEASE_MS}::int * interval '1 millisecond')
    WHERE "id" = ${id}
      AND "reconcile_lease_owner" = ${BLOB_DISCARD_WORKER_ID}
    RETURNING "id"
  `);
  return rows.length > 0;
}

/**
 * Run `fn` while renewing this worker's lease on `id` every
 * {@link BLOB_DISCARD_LEASE_RENEW_INTERVAL_MS}, clearing the timer on every
 * exit (success or failure) so a test or a completed row leaves nothing behind.
 */
async function withLeaseHeartbeat<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    void renewReconcileLease(id).catch(() => undefined);
  }, BLOB_DISCARD_LEASE_RENEW_INTERVAL_MS);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
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

    // While this row is processed, keep renewing the lease (finding D), and cap
    // every storage operation well under it, so a slow delete can neither lose
    // the row to a second replica nor hold the lease past its expiry.
    await withLeaseHeartbeat(row.id, () => processReconcileRow(row, summary));
  }

  await recordReconcileAudit(summary, dryRun);
  return summary;
}

/**
 * The work for one leased row, isolated so it can run under the lease
 * heartbeat. Returns nothing; it records its outcome on `summary` and on the
 * row (lease-guarded).
 */
async function processReconcileRow(
  row: { id: string; blobUrl: string; reconcileAttempts: number },
  summary: BlobDiscardReconcileSummary
): Promise<void> {
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
      return;
    }

    if (inspected.kind === 'error') {
      // The filesystem could not be inspected (EACCES/EIO). Retry rather than
      // quarantine or stamp DONE — the file may still be on disk.
      summary.failed += 1;
      await scheduleRetry(row.id, row.reconcileAttempts);
      logger.warn('[BlobReconcile] Local reference could not be inspected; rescheduled', {
        blobUrl: row.blobUrl,
      });
      return;
    }

    if (inspected.kind === 'absent') {
      // A trusted local reference whose file is already gone: the earlier
      // delete succeeded (or the file was removed out of band). Idempotent
      // success — terminal DONE, never a quarantine.
      summary.deleted += 1;
      await markDone(row.id);
      return;
    }

    try {
      await withTimeout(removeLocalUpload(inspected.path), BLOB_DISCARD_OPERATION_TIMEOUT_MS);
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
    return;
  }

  try {
    // The explicit outcome is what makes "credentials missing" impossible to
    // mistake for "deleted": `unavailable` means no remote request ran, so the
    // row is rescheduled (never marked DONE) and a later run — after the
    // credentials are restored — retries it.
    //
    // `abortSignal` is passed to the SDK AND the whole call is wrapped in a
    // local deadline: the abort makes the request stop, the wrapper guarantees
    // this job never waits past the ceiling even if a retry policy ignores the
    // signal. Either way a timeout throws (non-404), so the row is rescheduled.
    const outcome = await withTimeout(
      deleteBlobFromCloudStorage(parsed.containerName, parsed.blobName, {
        timeoutMs: BLOB_DISCARD_OPERATION_TIMEOUT_MS,
      }),
      BLOB_DISCARD_OPERATION_TIMEOUT_MS
    );
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
      return;
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

/** Reject when `work` has not settled within `ms`. */
function withTimeout<T>(work: T | Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`storage operation timed out after ${ms}ms`)),
      ms
    );
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Guard every terminal/retry status write with the lease owner, so a worker
 * whose lease has expired (a second replica took the row) can never stamp
 * status, retry counter or audit as if it still owned the row (finding D).
 */
function leasedBlobClaimWhere(id: string): { id: string; reconcileLeaseOwner: string } {
  return { id, reconcileLeaseOwner: BLOB_DISCARD_WORKER_ID };
}

/** Terminal success: never selected again. */
async function markDone(id: string): Promise<void> {
  await prisma.blobClaim.updateMany({
    where: leasedBlobClaimWhere(id),
    data: {
      reconcileStatus: BlobReconcileStatus.DONE,
      reconciledAt: new Date(),
      nextReconcileAt: null,
    },
  });
}

/** Terminal quarantine: malformed/foreign URL, never retried. */
async function quarantineRow(id: string): Promise<void> {
  await prisma.blobClaim.updateMany({
    where: leasedBlobClaimWhere(id),
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
  await prisma.blobClaim.updateMany({
    where: leasedBlobClaimWhere(id),
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
