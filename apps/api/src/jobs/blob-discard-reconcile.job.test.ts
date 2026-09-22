import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Reconciliation for tombstoned blobs whose physical delete outcome is unknown
 * (BUG 7 / flag 11).
 *
 * BUG 7: when the physical delete throws after the tombstone is set, the blob's
 * true state is unknown — the request may already have been applied at Azure —
 * so the tombstone is deliberately kept and this job retries the delete until
 * the outcome is certain. Delete on an already-absent blob is an idempotent
 * success, so the retry is always safe.
 *
 * Flag 11 (starvation): the job must record its result. A success is terminal
 * (never selected again), a failure is bounded (`reconcileAttempts` /
 * `lastReconcileAt` / `nextReconcileAt` backoff), and a malformed URL is
 * quarantined — so a backlog bigger than `limit` can never pin the same oldest
 * rows forever and starve the newer ones.
 */
const { findManyMock, updateMock, auditCreateMock, warnMock, queryRawMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  warnMock: vi.fn(),
  // The worker lease is taken with `$queryRaw` (a conditional UPDATE). The
  // default is "lease granted"; a test that proves mutual exclusion makes it
  // return no rows.
  queryRawMock: vi.fn().mockResolvedValue([{ id: 'leased' }]),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    blobClaim: { findMany: findManyMock, update: updateMock },
    auditLog: { create: auditCreateMock },
    $queryRaw: queryRawMock,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/cloud-storage', () => ({
  parseBlobUrl: (url: string) =>
    url.startsWith('https://store.blob.core.windows.net/cipansor-documents/')
      ? { containerName: 'cipansor-documents', blobName: url.split('/').pop() as string }
      : null,
  deleteBlobFromCloudStorage: vi.fn(),
}));

vi.mock('@/utils/local-upload-store', () => ({
  resolveLocalUploadPath: vi.fn().mockResolvedValue(null),
  removeLocalUpload: vi.fn(),
}));

import { deleteBlobFromCloudStorage } from '@/utils/cloud-storage';
import { removeLocalUpload, resolveLocalUploadPath } from '@/utils/local-upload-store';
import {
  reconcileDiscardedBlobs,
  BLOB_DISCARD_RECONCILE_AUDIT_ACTION,
  BLOB_DISCARD_RECONCILE_LIMIT,
  BLOB_DISCARD_MAX_ATTEMPTS,
  BLOB_DISCARD_RETRY_MAX_MS,
  BLOB_DISCARD_WORKER_ID,
} from './blob-discard-reconcile.job';
import { BlobReconcileStatus } from '@prisma/client';

const deleteMock = vi.mocked(deleteBlobFromCloudStorage);
const OLD = new Date(Date.now() - 10 * 60 * 1000);
const BLOB = 'https://store.blob.core.windows.net/cipansor-documents/gone.pdf';
const FOREIGN = 'https://elsewhere.example.com/x/y.pdf';

describe('reconcileDiscardedBlobs (BUG 7 / flag 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMock.mockResolvedValue('deleted');
    updateMock.mockResolvedValue({});
    auditCreateMock.mockResolvedValue({});
    queryRawMock.mockResolvedValue([{ id: 'leased' }]);
    (resolveLocalUploadPath as any).mockResolvedValue(null);
  });

  it('retries the delete for a tombstoned, expired claim and marks it DONE', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);

    const summary = await reconcileDiscardedBlobs();

    expect(deleteMock).toHaveBeenCalledWith('cipansor-documents', 'gone.pdf');
    expect(summary).toMatchObject({ examined: 1, deleted: 1, failed: 0, skipped: 0 });
    // Terminal: a successful delete must never be selected again.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          reconcileStatus: BlobReconcileStatus.DONE,
          reconciledAt: expect.any(Date),
          nextReconcileAt: null,
        }),
      })
    );
  });

  it('only considers tombstones older than one discard TTL and past their backoff window', async () => {
    findManyMock.mockResolvedValue([]);

    await reconcileDiscardedBlobs();

    const arg = findManyMock.mock.calls[0][0];
    expect(arg.where.discardedAt.not).toBeNull();
    expect(arg.where.discardedAt.lt).toBeInstanceOf(Date);
    expect(Date.now() - (arg.where.discardedAt.lt as Date).getTime()).toBeGreaterThanOrEqual(
      4 * 60 * 1000
    );
    // Only PENDING rows that are due are selected, so a poison row cannot be
    // picked ahead of a fresh one on every run (flag 11).
    expect(arg.where.reconcileStatus).toBe(BlobReconcileStatus.PENDING);
    expect(arg.where.OR).toEqual([{ nextReconcileAt: null }, { nextReconcileAt: { lte: expect.any(Date) } }]);
    expect(arg.take).toBe(BLOB_DISCARD_RECONCILE_LIMIT);
  });

  it('quarantines a URL it does not own instead of throwing (terminal, not retried)', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: FOREIGN, reconcileAttempts: 0 }]);

    const summary = await reconcileDiscardedBlobs();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 1, deleted: 0, failed: 0, skipped: 1 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.QUARANTINED }),
      })
    );
  });

  it('reschedules a failed retry with attempts/lastAttemptAt/backoff instead of leaving it eligible', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);
    deleteMock.mockRejectedValueOnce(new Error('network'));

    const summary = await reconcileDiscardedBlobs();

    expect(summary).toMatchObject({ examined: 1, deleted: 0, failed: 1 });
    expect(warnMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          reconcileAttempts: 1,
          lastReconcileAt: expect.any(Date),
          nextReconcileAt: expect.any(Date),
        }),
      })
    );
  });

  // ── Regression: missing credentials must NOT look like a successful delete ──

  it('does NOT mark a row DONE when storage credentials are unavailable; reschedules and reports failure', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);
    // The old contract resolved `undefined` with no credentials, so the job
    // stamped DONE and the blob was never retried once credentials returned.
    deleteMock.mockResolvedValueOnce('unavailable');

    const summary = await reconcileDiscardedBlobs();

    expect(summary).toMatchObject({
      examined: 1,
      deleted: 0,
      failed: 1,
      unavailable: 1,
    });
    // The row must stay retryable, not terminal.
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.DONE }),
      })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          reconcileAttempts: 1,
          lastReconcileAt: expect.any(Date),
          nextReconcileAt: expect.any(Date),
        }),
      })
    );
    // A warning is logged, and it must not leak the connection string.
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('credentials unavailable'),
      expect.not.objectContaining({ error: expect.anything() })
    );
    const warned = JSON.stringify(warnMock.mock.calls);
    expect(warned).not.toMatch(/AccountKey|DefaultEndpointsProtocol|sig=/);
  });

  it('keeps a credentials-unavailable row eligible across runs (never DONE)', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 1 }]);
    deleteMock.mockResolvedValue('unavailable');

    await reconcileDiscardedBlobs();
    updateMock.mockClear();
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 2 }]);
    await reconcileDiscardedBlobs();

    // Both runs reschedule; neither writes a terminal status.
    for (const call of updateMock.mock.calls) {
      expect(call[0].data.reconcileStatus).toBeUndefined();
    }
  });

  it('never quarantines a credentials-unavailable row, even past the retry cap', async () => {
    // A long outage must not permanently stop retrying: the save-after-outage
    // guarantee only holds if the row is still PENDING when credentials return.
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: BLOB, reconcileAttempts: BLOB_DISCARD_MAX_ATTEMPTS + 10 },
    ]);
    deleteMock.mockResolvedValueOnce('unavailable');

    const summary = await reconcileDiscardedBlobs();

    expect(summary).toMatchObject({ unavailable: 1, failed: 1, deleted: 0 });
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reconcileStatus: BlobReconcileStatus.QUARANTINED,
        }),
      })
    );
    // Backoff is capped so recovery is still attempted within the hour.
    const scheduled = updateMock.mock.calls.at(-1)![0];
    expect(scheduled.data.nextReconcileAt.getTime() - Date.now()).toBeLessThanOrEqual(
      BLOB_DISCARD_RETRY_MAX_MS + 1000
    );
  });

  it('treats an already-absent blob (404) as a terminal success (idempotent)', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);
    deleteMock.mockResolvedValueOnce('already-absent');

    const summary = await reconcileDiscardedBlobs();

    expect(summary).toMatchObject({ examined: 1, deleted: 1, failed: 0, unavailable: 0 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.DONE }),
      })
    );
  });

  // ── Finding 4: one worker owns a row at a time ──

  it('takes a worker lease before deleting, keyed to this worker', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);

    await reconcileDiscardedBlobs();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    // `Prisma.sql` passes one tagged-template object; its SQL text and bound
    // values carry the lease target and the worker identity.
    const serialized = JSON.stringify(queryRawMock.mock.calls[0][0]);
    expect(serialized).toContain('lease');
    expect(serialized).toContain(BLOB_DISCARD_WORKER_ID);
    expect(serialized).toContain('c1');
  });

  it('skips (busy) a row another worker holds instead of racing its delete', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);
    // Another replica already holds the lease: the conditional UPDATE matches
    // no row, so this worker must not delete, retry-count or audit the row.
    queryRawMock.mockResolvedValueOnce([]);

    const summary = await reconcileDiscardedBlobs();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 0, deleted: 0, failed: 0, busy: 1 });
  });

  it('quarantines a row after the bounded retry cap, so it cannot retry forever', async () => {
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: BLOB, reconcileAttempts: BLOB_DISCARD_MAX_ATTEMPTS - 1 },
    ]);
    deleteMock.mockRejectedValueOnce(new Error('network'));

    await reconcileDiscardedBlobs();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.QUARANTINED }),
      })
    );
  });

  it('reclaims a local /uploads file rather than skipping it', async () => {
    (resolveLocalUploadPath as any).mockResolvedValue('/tmp/uploads-test/a.png');
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: '/uploads/123e4567-e89b-42d3-a456-426614174000.png', reconcileAttempts: 0 },
    ]);

    const summary = await reconcileDiscardedBlobs();

    expect(removeLocalUpload).toHaveBeenCalledWith('/tmp/uploads-test/a.png');
    expect(summary).toMatchObject({ deleted: 1, skipped: 0 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.DONE }) })
    );
  });

  it('does NOT mark a local row DONE when the local delete fails; reschedules instead', async () => {
    // A permission/IO failure on the local unlink must propagate out of
    // `removeLocalUpload` (finding: swallowed unlink) and make the job retry,
    // never stamp DONE while the file is still on disk.
    (resolveLocalUploadPath as any).mockResolvedValue('/tmp/uploads-test/a.png');
    (removeLocalUpload as any).mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    );
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: '/uploads/123e4567-e89b-42d3-a456-426614174000.png', reconcileAttempts: 0 },
    ]);

    const summary = await reconcileDiscardedBlobs();

    expect(summary).toMatchObject({ deleted: 0, failed: 1 });
    // The row is RESCHEDULED (backoff stamped), never terminal. `PENDING` is the
    // schema default, so `scheduleRetry` does not set it explicitly — the proof
    // that it is not DONE is that no UPDATE set DONE and a next attempt is due.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ nextReconcileAt: expect.any(Date) }),
      })
    );
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reconcileStatus: BlobReconcileStatus.DONE }) })
    );
  });

  it('writes exactly one audit row per run, even when nothing was found', async () => {
    findManyMock.mockResolvedValue([]);

    await reconcileDiscardedBlobs();

    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: BLOB_DISCARD_RECONCILE_AUDIT_ACTION }),
      })
    );
  });

  it('does not call Azure in dry-run but still reports what it would do', async () => {
    findManyMock.mockResolvedValue([{ id: 'c1', blobUrl: BLOB, reconcileAttempts: 0 }]);

    const summary = await reconcileDiscardedBlobs({ dryRun: true });

    expect(deleteMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 1, deleted: 1 });
  });

  it('bounds a run so a backlog cannot become an unbounded Azure sweep', async () => {
    findManyMock.mockResolvedValue([]);

    await reconcileDiscardedBlobs({ limit: 7 });

    expect(findManyMock.mock.calls[0][0].take).toBe(7);
  });

  it('processes a NEW row even when an older backlog exceeds the limit (no starvation, flag 11)', async () => {
    // The query is the starvation fix: DONE rows are excluded and the remainder
    // are ordered by tombstone age with a bounded take. Simulate a first run
    // that fills the limit with old rows and completes them, then a second run
    // that must reach the newer row the first run could not fit.
    const oldRows = Array.from({ length: BLOB_DISCARD_RECONCILE_LIMIT }, (_, i) => ({
      id: `old-${i}`,
      blobUrl: BLOB,
      reconcileAttempts: 0,
    }));
    const newRow = { id: 'new-1', blobUrl: BLOB, reconcileAttempts: 0 };

    findManyMock
      .mockResolvedValueOnce(oldRows) // first run: full batch of old rows
      .mockResolvedValueOnce([newRow]); // second run: only the fresh row is left

    await reconcileDiscardedBlobs();
    expect(deleteMock).toHaveBeenCalledTimes(BLOB_DISCARD_RECONCILE_LIMIT);

    deleteMock.mockClear();
    const second = await reconcileDiscardedBlobs();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ examined: 1, deleted: 1 });
    // The selection excludes anything already terminal, which is what lets the
    // second run reach a row the first could not fit.
    expect(findManyMock.mock.calls[1][0].where.reconcileStatus).toBe(BlobReconcileStatus.PENDING);
  });
});
