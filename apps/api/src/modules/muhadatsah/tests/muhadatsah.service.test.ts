import { describe, it, expect, vi, beforeEach } from 'vitest';

// The evaluate path claims a new recording blob before writing the reference
// (BUG 4 / flag 9). The claim protocol has its own unit + real-Postgres
// integration tests; here we drive the service's own control flow around it.
const claimBlobForRecord = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' })
);
const releaseBlobClaimById = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const CLAIM = { id: 'claim-1', operationToken: 'tok-1', kind: 'RECORD' };

vi.mock('@/utils/blob-claim', () => ({ claimBlobForRecord, releaseBlobClaimById }));

const mockPrisma = vi.hoisted(() => ({
  muhadatsah: { findUnique: vi.fn(), update: vi.fn() },
  teacher: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/utils/resolve-unit-id', () => ({ seesAllUnits: vi.fn(() => false) }));

import { muhadatsahService } from '../muhadatsah.service';

const user = { sub: 'user-1', role: 'TEACHER', roleCode: 'GURU', unitId: 'unit-1' };

function scheduledRecord(extra: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    unitId: 'unit-1',
    status: 'SCHEDULED',
    student: { id: 's-1', nis: 'N-1', user: { name: 'Santri', email: 's@x' }, enrollments: [] },
    partner: null,
    evaluator: null,
    ...extra,
  };
}

const validScores = {
  fluencyScore: 90,
  grammarScore: 80,
  vocabularyScore: 70,
  pronunciationScore: 100,
};

describe('MuhadatsahService.evaluate — recording blob claim (BUG 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimBlobForRecord.mockResolvedValue({
      id: 'claim-1',
      operationToken: 'tok-1',
      kind: 'RECORD',
    });
    releaseBlobClaimById.mockResolvedValue(undefined);
    mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
  });

  it('claims the recording before writing the reference and releases after commit', async () => {
    mockPrisma.muhadatsah.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadatsah.update.mockResolvedValue({ id: 'm-1', status: 'COMPLETED' });

    await muhadatsahService.evaluate(
      'm-1',
      { ...validScores, recordingUrl: 'https://store/m.mp3' },
      user
    );

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/m.mp3', 'user-1');
    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
    // Claim order: taken before the row that references it is written.
    expect(claimBlobForRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.muhadatsah.update.mock.invocationCallOrder[0]
    );
  });

  it('rejects when a discard already holds the recording, and does not write the record', async () => {
    mockPrisma.muhadatsah.findUnique.mockResolvedValue(scheduledRecord());
    claimBlobForRecord.mockResolvedValue(null);

    await expect(
      muhadatsahService.evaluate(
        'm-1',
        { ...validScores, recordingUrl: 'https://store/m.mp3' },
        user
      )
    ).rejects.toThrow(/sedang diproses/);

    expect(mockPrisma.muhadatsah.update).not.toHaveBeenCalled();
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });

  it('does not claim when no recording is supplied', async () => {
    mockPrisma.muhadatsah.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadatsah.update.mockResolvedValue({ id: 'm-1', status: 'COMPLETED' });

    await muhadatsahService.evaluate('m-1', { ...validScores }, user);

    expect(claimBlobForRecord).not.toHaveBeenCalled();
    expect(releaseBlobClaimById).not.toHaveBeenCalled();
  });

  it('releases the claim even when the update throws', async () => {
    mockPrisma.muhadatsah.findUnique.mockResolvedValue(scheduledRecord());
    mockPrisma.muhadatsah.update.mockRejectedValue(new Error('db down'));

    await expect(
      muhadatsahService.evaluate(
        'm-1',
        { ...validScores, recordingUrl: 'https://store/m.mp3' },
        user
      )
    ).rejects.toThrow('db down');

    expect(releaseBlobClaimById).toHaveBeenCalledWith(CLAIM);
  });

  it('refuses to evaluate a record from another unit', async () => {
    mockPrisma.muhadatsah.findUnique.mockResolvedValue(scheduledRecord({ unitId: 'unit-2' }));

    await expect(muhadatsahService.evaluate('m-1', { ...validScores }, user)).rejects.toThrow(
      /Access denied/
    );

    expect(mockPrisma.muhadatsah.update).not.toHaveBeenCalled();
  });
});
