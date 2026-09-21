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
const { findManyMock, updateMock, auditCreateMock, warnMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    blobClaim: { findMany: findManyMock, update: updateMock },
    auditLog: { create: auditCreateMock },
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
  deleteFromCloudStorage: vi.fn(),
}));

vi.mock('@/utils/local-upload-store', () => ({
  resolveLocalUploadPath: vi.fn().mockResolvedValue(null),
  removeLocalUpload: vi.fn(),
}));

import { deleteFromCloudStorage } from '@/utils/cloud-storage';
import { removeLocalUpload, resolveLocalUploadPath } from '@/utils/local-upload-store';
import {
  reconcileDiscardedBlobs,
  BLOB_DISCARD_RECONCILE_AUDIT_ACTION,
  BLOB_DISCARD_RECONCILE_LIMIT,
  BLOB_DISCARD_MAX_ATTEMPTS,
} from './blob-discard-reconcile.job';
import { BlobReconcileStatus } from '@prisma/client';

const deleteMock = vi.mocked(deleteFromCloudStorage);
const OLD = new Date(Date.now() - 10 * 60 * 1000);
const BLOB = 'https://store.blob.core.windows.net/cipansor-documents/gone.pdf';
const FOREIGN = 'https://elsewhere.example.com/x/y.pdf';

describe('reconcileDiscardedBlobs (BUG 7 / flag 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue({});
    auditCreateMock.mockResolvedValue({});
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
