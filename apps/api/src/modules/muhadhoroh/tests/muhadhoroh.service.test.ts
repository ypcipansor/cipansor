import { describe, it, expect, vi, beforeEach } from 'vitest';

// evaluate() claims a new video blob before writing the reference (BUG 4 /
// flag 9). The claim protocol itself is covered by `blob-claim.integration`
// (real Postgres); this drives the service's control flow around it.
const claimBlobForRecord = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const releaseBlobClaim = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/blob-claim', () => ({ claimBlobForRecord, releaseBlobClaim }));

const mockPrisma = vi.hoisted(() => ({
  muhadhoroh: { findUnique: vi.fn(), update: vi.fn() },
  teacher: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/utils/resolve-unit-id', () => ({ seesAllUnits: vi.fn(() => false) }));

import { muhadhorohService } from '../muhadhoroh.service';

const user = { sub: 'user-1', role: 'TEACHER', roleCode: 'GURU', unitId: 'unit-1' };

function scheduledRecord(extra: Record<string, unknown> = {}) {
  return {
    id: 'mh-1',
    unitId: 'unit-1',
    status: 'SCHEDULED',
    student: { id: 's-1', nis: 'N-1', user: { name: 'Santri', email: 's@x' }, enrollments: [] },
    evaluator: null,
    ...extra,
  };
}

const scores = { contentScore: 90, deliveryScore: 80, languageScore: 70 };

describe('MuhadhorohService.evaluate — video blob claim (BUG 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimBlobForRecord.mockResolvedValue(true);
    releaseBlobClaim.mockResolvedValue(undefined);
    mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
  });

  it('claims the video before writing the reference and releases after commit', async () => {
    mockPrisma.muhadhoroh.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadhoroh.update.mockResolvedValue({ id: 'mh-1', status: 'COMPLETED' });

    await muhadhorohService.evaluate('mh-1', { ...scores, videoUrl: 'https://store/v.mp4' }, user);

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/v.mp4', 'user-1');
    expect(releaseBlobClaim).toHaveBeenCalledWith('https://store/v.mp4', 'user-1');
    expect(claimBlobForRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.muhadhoroh.update.mock.invocationCallOrder[0]
    );
  });

  it('rejects when a discard holds the video, without writing the record', async () => {
    mockPrisma.muhadhoroh.findUnique.mockResolvedValue(scheduledRecord());
    claimBlobForRecord.mockResolvedValue(false);

    await expect(
      muhadhorohService.evaluate('mh-1', { ...scores, videoUrl: 'https://store/v.mp4' }, user)
    ).rejects.toThrow(/sedang diproses/);

    expect(mockPrisma.muhadhoroh.update).not.toHaveBeenCalled();
    expect(releaseBlobClaim).not.toHaveBeenCalled();
  });

  it('does not claim when no video is supplied', async () => {
    mockPrisma.muhadhoroh.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadhoroh.update.mockResolvedValue({ id: 'mh-1', status: 'COMPLETED' });

    await muhadhorohService.evaluate('mh-1', { ...scores }, user);

    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(releaseBlobClaim).not.toHaveBeenCalled();
  });

  it('releases the claim even when the update throws', async () => {
    mockPrisma.muhadhoroh.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadhoroh.update.mockRejectedValue(new Error('db down'));

    await expect(
      muhadhorohService.evaluate('mh-1', { ...scores, videoUrl: 'https://store/v.mp4' }, user)
    ).rejects.toThrow('db down');

    expect(releaseBlobClaim).toHaveBeenCalledWith('https://store/v.mp4', 'user-1');
  });

  it('refuses to evaluate a record from another unit', async () => {
    mockPrisma.muhadhoroh.findUnique.mockResolvedValue(scheduledRecord({ unitId: 'unit-2' }));

    await expect(muhadhorohService.evaluate('mh-1', { ...scores }, user)).rejects.toThrow(
      /Access denied/
    );

    expect(mockPrisma.muhadhoroh.update).not.toHaveBeenCalled();
  });
});