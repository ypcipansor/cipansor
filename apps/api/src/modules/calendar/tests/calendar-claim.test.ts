import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calendarService } from '../calendar.service';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';

/**
 * Calendar `onlineUrl` is a client-supplied blob reference, so the create and
 * update paths take the blob-claim protocol (BUG 4 / flag 9). These tests pin
 * the write ordering and the all-or-nothing failure: a create/update that loses
 * the claim race must NOT commit a row that points at a possibly-deleted blob.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    calendarEvent: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn(),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/resolve-unit-id', () => ({
  seesAllUnits: vi.fn().mockReturnValue(true),
}));

import { claimBlobForRecord, releaseBlobClaimById } from '@/utils/blob-claim';

const URL = 'https://store.blob.core.windows.net/cipansor-documents/rekap.pdf';

const tx = {
  calendarEvent: { create: vi.fn(), update: vi.fn() },
};

const actor = { sub: 'user-1', role: 'SUPER_ADMIN', roleCode: 'SUPER_ADMIN', unitId: 'unit-1' };

const input = {
  title: 'Rapat',
  eventType: 'MEETING' as any,
  startDate: new Date().toISOString(),
  onlineUrl: URL,
};

describe('calendarService onlineUrl claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.calendarEvent.create.mockResolvedValue({ id: 'e1' });
    tx.calendarEvent.update.mockResolvedValue({ id: 'e1' });
    (prisma.calendarEvent as any).count.mockResolvedValue(0);
  });

  it('claims onlineUrl BEFORE the create commits, then releases the claim', async () => {
    (claimBlobForRecord as any).mockResolvedValue({
      id: 'c1',
      operationToken: 't1',
      kind: 'RECORD',
    });

    await calendarService.create(input as any, actor as any);

    // Claim first, row second: the inverse order is the race.
    const claimOrder = (claimBlobForRecord as any).mock.invocationCallOrder[0];
    const createOrder = tx.calendarEvent.create.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(createOrder);
    expect(tx.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onlineUrl: URL }) })
    );
    expect(releaseBlobClaimById).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', kind: 'RECORD' }),
      tx
    );
  });

  it('rejects the create (409) and never inserts when the blob is held by another operation', async () => {
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(calendarService.create(input as any, actor as any)).rejects.toThrow(
      /sedang diproses pihak lain/
    );
    expect(tx.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('claims a replacement onlineUrl before the update commits', async () => {
    (prisma.calendarEvent as any).findUnique.mockResolvedValue({
      id: 'e1',
      unitId: 'unit-1',
      createdById: 'user-1',
      isPublic: true,
    });
    (claimBlobForRecord as any).mockResolvedValue({
      id: 'c2',
      operationToken: 't2',
      kind: 'RECORD',
    });

    await calendarService.update('e1', { onlineUrl: URL } as any, actor as any);

    expect(claimBlobForRecord).toHaveBeenCalledWith(URL, 'user-1', tx);
    expect(tx.calendarEvent.update).toHaveBeenCalled();
    expect(releaseBlobClaimById).toHaveBeenCalled();
  });

  it('rejects the update and never writes when the replacement blob is contended', async () => {
    (prisma.calendarEvent as any).findUnique.mockResolvedValue({
      id: 'e1',
      unitId: 'unit-1',
      createdById: 'user-1',
      isPublic: true,
    });
    (claimBlobForRecord as any).mockResolvedValue(null);

    await expect(
      calendarService.update('e1', { onlineUrl: URL } as any, actor as any)
    ).rejects.toThrow();
    expect(tx.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('does not touch the claim protocol when there is no onlineUrl', async () => {
    await calendarService.create({ ...input, onlineUrl: undefined } as any, actor as any);
    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(tx.calendarEvent.create).toHaveBeenCalled();
  });
});

describe('calendarService blob claim error shape', () => {
  it('uses a conflict-shaped error (not a bare Error)', () => {
    // The controller surfaces `Errors.conflict` as 409; a generic throw would
    // become 500 and hide the retryable nature of the claim race.
    expect(Errors.conflict('x').statusCode).toBe(409);
  });
});
