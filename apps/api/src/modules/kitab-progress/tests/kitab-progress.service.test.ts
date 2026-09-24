import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kitab cover writes take the claim protocol (BUG 4 / flag 9): the cover URL
// is a client upload, so the row must not reference it until the blob is
// claimed. Real race behaviour lives in `blob-claim.integration`; this drives
// the service branches.
const claimBlobForRecord = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' })
);
const releaseBlobClaimById = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const CLAIM = { id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' };

vi.mock('@/utils/blob-claim', () => ({ claimBlobForRecord, releaseBlobClaimById }));

const mockPrisma = vi.hoisted(() => ({
  kitabKuning: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  kitabProgress: { count: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { kitabProgressService } from '../kitab-progress.service';

const baseKitab = { title: 'Kitab', author: 'A', category: 'NAHWU', level: 'AWALIYAH' };

describe('KitabProgressService kitab cover claim (BUG 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimBlobForRecord.mockResolvedValue({
      id: 'claim-1',
      operationToken: 'tok-1',
      kind: 'RECORD',
    });
    releaseBlobClaimById.mockResolvedValue(undefined);
  });

  it('createKitab claims the cover before insert and releases after', async () => {
    mockPrisma.kitabKuning.create.mockResolvedValue({ id: 'k-1' });

    await kitabProgressService.createKitab(
      { ...baseKitab, coverUrl: 'https://store/c.png' } as any,
      'actor-1'
    );

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/c.png', 'actor-1');
    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
    expect(claimBlobForRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.kitabKuning.create.mock.invocationCallOrder[0]
    );
  });

  it('createKitab refuses when a discard holds the cover', async () => {
    claimBlobForRecord.mockResolvedValue(null);

    await expect(
      kitabProgressService.createKitab(
        { ...baseKitab, coverUrl: 'https://store/c.png' } as any,
        'actor-1'
      )
    ).rejects.toThrow(/sedang diproses/);

    expect(mockPrisma.kitabKuning.create).not.toHaveBeenCalled();
  });

  it('createKitab without a cover skips the claim entirely', async () => {
    mockPrisma.kitabKuning.create.mockResolvedValue({ id: 'k-1' });

    await kitabProgressService.createKitab({ ...baseKitab } as any, 'actor-1');

    expect(claimBlobForRecord).not.toHaveBeenCalled();
  });

  it('updateKitab claims a new cover and releases even when the update throws', async () => {
    mockPrisma.kitabKuning.findUnique.mockResolvedValue({ id: 'k-1' });
    mockPrisma.kitabKuning.update.mockRejectedValue(new Error('db down'));

    await expect(
      kitabProgressService.updateKitab(
        'k-1',
        { coverUrl: 'https://store/new.png' } as any,
        'actor-1'
      )
    ).rejects.toThrow('db down');

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/new.png', 'actor-1');
    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
  });

  it('updateKitab without a cover does not claim', async () => {
    mockPrisma.kitabKuning.findUnique.mockResolvedValue({ id: 'k-1' });
    mockPrisma.kitabKuning.update.mockResolvedValue({ id: 'k-1' });

    await kitabProgressService.updateKitab('k-1', { title: 'x' } as any, 'actor-1');

    expect(claimBlobForRecord).not.toHaveBeenCalled();
  });
});
