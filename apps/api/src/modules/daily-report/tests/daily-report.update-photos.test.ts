import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyReportService } from '../daily-report.service';
import { prisma } from '@/lib/prisma';
import { cleanupBlobsBestEffort } from '@/utils/cloud-storage';

/**
 * Photo replacement in `dailyReportService.update` must be atomic (BUG 8).
 *
 * Before the fix the report `update`, the `deleteMany` of the old photo rows
 * and the `createMany` of the new ones were three independent statements. An
 * insert failure after the delete committed left a report with NO photos and
 * a set of blob URLs that no row referenced any more — and a concurrent reader
 * could see the empty gap. The blob sweep also ran before it could be sure the
 * new rows had committed.
 *
 * These tests pin the transaction boundary and the ordering of the sweep.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    dailyStudentReport: { update: vi.fn() },
    dailyReportPhoto: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    dailyHomework: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock('@/utils/cloud-storage', () => ({
  cleanupBlobsBestEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../notifications', () => ({ whatsAppService: {} }));

const tx = {
  dailyStudentReport: { update: vi.fn() },
  dailyReportPhoto: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
};

describe('dailyReportService.update photo replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.dailyStudentReport.update.mockResolvedValue({ id: 'r1', photos: [] });
    tx.dailyReportPhoto.findMany.mockResolvedValue([{ photoUrl: '/uploads/old.png' }]);
    tx.dailyReportPhoto.deleteMany.mockResolvedValue({ count: 1 });
    tx.dailyReportPhoto.createMany.mockResolvedValue({ count: 1 });
    (prisma.dailyHomework as any).deleteMany.mockResolvedValue({ count: 0 });
  });

  it('runs report update, delete and insert inside one transaction', async () => {
    await dailyReportService.update('r1', { photoUrls: ['/uploads/new.png'] } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.dailyStudentReport.update).toHaveBeenCalledTimes(1);
    expect(tx.dailyReportPhoto.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.dailyReportPhoto.createMany).toHaveBeenCalledTimes(1);
    // The non-transactional client must not have been used for the photo rows.
    expect(prisma.dailyReportPhoto.deleteMany).not.toHaveBeenCalled();
    expect(prisma.dailyReportPhoto.createMany).not.toHaveBeenCalled();
  });

  it('does not sweep retired blobs when the transaction rolls back', async () => {
    // A createMany failure aborts the transaction; the old rows survive and the
    // old blobs are still live, so the sweep must never run.
    tx.dailyReportPhoto.createMany.mockRejectedValue(new Error('insert failed'));

    await expect(
      dailyReportService.update('r1', { photoUrls: ['/uploads/new.png'] } as any),
    ).rejects.toThrow('insert failed');

    expect(cleanupBlobsBestEffort).not.toHaveBeenCalled();
  });

  it('sweeps only the retired URLs, after the transaction committed', async () => {
    tx.dailyReportPhoto.findMany.mockResolvedValue([
      { photoUrl: '/uploads/old.png' },
      { photoUrl: '/uploads/kept.png' },
    ]);

    await dailyReportService.update('r1', {
      photoUrls: ['/uploads/kept.png', '/uploads/new.png'],
    } as any);

    expect(cleanupBlobsBestEffort).toHaveBeenCalledTimes(1);
    const swept = (cleanupBlobsBestEffort as any).mock.calls[0][0];
    expect(swept).toEqual(['/uploads/old.png']);
  });

  it('leaves photo rows untouched when photoUrls is not supplied', async () => {
    await dailyReportService.update('r1', { behaviorNotes: 'ok' } as any);

    expect(tx.dailyReportPhoto.deleteMany).not.toHaveBeenCalled();
    expect(cleanupBlobsBestEffort).not.toHaveBeenCalled();
  });
});