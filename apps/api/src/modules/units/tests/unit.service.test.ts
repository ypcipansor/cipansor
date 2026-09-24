import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit logo writes take the claim protocol (BUG 4 / flag 9): the logo URL is a
// client upload, so the row must not reference it until the blob is claimed.
// Real race behaviour lives in `blob-claim.integration`.
const claimBlobForRecord = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' })
);
const releaseBlobClaimById = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const CLAIM = { id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' };

vi.mock('@/utils/blob-claim', () => ({ claimBlobForRecord, releaseBlobClaimById }));

const mockPrisma = vi.hoisted(() => ({
  unit: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { unitService } from '../unit.service';

const createInput = { name: 'SD IT', type: 'SD_IT' } as any;

describe('UnitService logo claim (BUG 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimBlobForRecord.mockResolvedValue({
      id: 'claim-1',
      operationToken: 'tok-1',
      kind: 'RECORD',
    });
    releaseBlobClaimById.mockResolvedValue(undefined);
  });

  it('create claims the logo before insert and releases after', async () => {
    mockPrisma.unit.create.mockResolvedValue({ id: 'u-1' });

    await unitService.create({ ...createInput, logoUrl: 'https://store/l.png' }, 'actor-1');

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/l.png', 'actor-1');
    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
    expect(claimBlobForRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.unit.create.mock.invocationCallOrder[0]
    );
  });

  it('create refuses when a discard holds the logo', async () => {
    claimBlobForRecord.mockResolvedValue(null);

    await expect(
      unitService.create({ ...createInput, logoUrl: 'https://store/l.png' }, 'actor-1')
    ).rejects.toThrow(/sedang diproses/);

    expect(mockPrisma.unit.create).not.toHaveBeenCalled();
  });

  it('create without a logo skips the claim', async () => {
    mockPrisma.unit.create.mockResolvedValue({ id: 'u-1' });

    await unitService.create(createInput, 'actor-1');

    expect(claimBlobForRecord).not.toHaveBeenCalled();
  });

  it('update claims a new logo and releases even when the update throws', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1' });
    mockPrisma.unit.update.mockRejectedValue(new Error('db down'));

    await expect(
      unitService.update('u-1', { logoUrl: 'https://store/new.png' } as any, 'actor-1')
    ).rejects.toThrow('db down');

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/new.png', 'actor-1');
    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
  });

  it('update without a logo does not claim', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1' });
    mockPrisma.unit.update.mockResolvedValue({ id: 'u-1' });

    await unitService.update('u-1', { name: 'x' } as any, 'actor-1');

    expect(claimBlobForRecord).not.toHaveBeenCalled();
  });
});
