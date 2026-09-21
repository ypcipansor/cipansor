import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * BUG 7: ketika `deleteFromCloudStorage` melempar setelah tombstone dipasang,
 * keadaan blob tidak diketahui — permintaan itu mungkin sudah diterapkan Azure.
 * Tombstone karena itu TIDAK dilepas, dan pekerjaan ini yang mencoba ulang
 * penghapusan sampai keadaan blob pasti. Berkas ini menetapkan bahwa percobaan
 * ulang itu:
 *
 *  - menghapus blob yang tertombstone dan cukup tua;
 *  - TIDAK menyentuh baris yang masih segar (permintaan aslinya bisa masih
 *    berjalan) atau yang belum ditombstone;
 *  - melewati URL yang bukan milik aplikasi ini, bukan gagal;
 *  - mencatat satu baris audit bahkan ketika tidak ada yang ditemukan;
 *  - idempoten: blob yang sudah lenyap adalah keberhasilan.
 */
const { findManyMock, deleteMock, auditCreateMock, warnMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  deleteMock: vi.fn(),
  auditCreateMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    blobClaim: { findMany: findManyMock },
    auditLog: { create: auditCreateMock },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/cloud-storage', () => ({
  parseBlobUrl: (url: string) =>
    url.startsWith('https://store.blob.core.windows.net/cipansor-documents/')
      ? {
          containerName: 'cipansor-documents',
          blobName: url.split('/').pop() as string,
        }
      : null,
  deleteFromCloudStorage: deleteMock,
}));

import {
  reconcileDiscardedBlobs,
  BLOB_DISCARD_RECONCILE_AUDIT_ACTION,
  BLOB_DISCARD_RECONCILE_LIMIT,
} from './blob-discard-reconcile.job';

const OLD = new Date(Date.now() - 10 * 60 * 1000);
const BLOB = 'https://store.blob.core.windows.net/cipansor-documents/gone.pdf';

describe('reconcileDiscardedBlobs (BUG 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMock.mockResolvedValue(undefined);
    auditCreateMock.mockResolvedValue({});
  });

  it('retries the delete for a tombstoned, expired claim', async () => {
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: BLOB, holderId: 'u1', discardedAt: OLD },
    ]);

    const summary = await reconcileDiscardedBlobs();

    expect(deleteMock).toHaveBeenCalledWith('cipansor-documents', 'gone.pdf');
    expect(summary).toMatchObject({ examined: 1, deleted: 1, failed: 0, skipped: 0 });
  });

  it('only considers tombstones older than one discard TTL', async () => {
    findManyMock.mockResolvedValue([]);

    await reconcileDiscardedBlobs();

    const arg = findManyMock.mock.calls[0][0];
    // `discardedAt: { not: null, lt: <5 minutes ago> }` — a fresher tombstone
    // may still be held by the in-flight original request.
    expect(arg.where.discardedAt.not).toBeNull();
    expect(arg.where.discardedAt.lt).toBeInstanceOf(Date);
    expect(Date.now() - (arg.where.discardedAt.lt as Date).getTime()).toBeGreaterThanOrEqual(
      4 * 60 * 1000
    );
    expect(arg.take).toBe(BLOB_DISCARD_RECONCILE_LIMIT);
  });

  it('skips a URL it does not own instead of throwing', async () => {
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: 'https://elsewhere.example.com/x/y.pdf', holderId: 'u1', discardedAt: OLD },
    ]);

    const summary = await reconcileDiscardedBlobs();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 1, deleted: 0, failed: 0, skipped: 1 });
  });

  it('counts a failed retry and leaves it for the next run (idempotent)', async () => {
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: BLOB, holderId: 'u1', discardedAt: OLD },
    ]);
    deleteMock.mockRejectedValueOnce(new Error('network'));

    const summary = await reconcileDiscardedBlobs();

    // The tombstone is untouched; the row is simply retried next run.
    expect(summary).toMatchObject({ examined: 1, deleted: 0, failed: 1 });
    expect(warnMock).toHaveBeenCalled();
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
    findManyMock.mockResolvedValue([
      { id: 'c1', blobUrl: BLOB, holderId: 'u1', discardedAt: OLD },
    ]);

    const summary = await reconcileDiscardedBlobs({ dryRun: true });

    expect(deleteMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 1, deleted: 1 });
  });

  it('bounds a run so a backlog cannot become an unbounded Azure sweep', async () => {
    findManyMock.mockResolvedValue([]);

    await reconcileDiscardedBlobs({ limit: 7 });

    expect(findManyMock.mock.calls[0][0].take).toBe(7);
  });
});
