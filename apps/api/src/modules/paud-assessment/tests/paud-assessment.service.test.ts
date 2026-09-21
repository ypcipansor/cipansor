import { describe, it, expect, vi, beforeEach } from 'vitest';

// PAUD assessment evidence takes the claim protocol (BUG 4 / flag 9): the
// evidence file is a client upload, so the row must not reference it until the
// blob is claimed. Real race behaviour lives in `blob-claim.integration`.
const claimBlobForRecord = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const releaseBlobClaim = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/blob-claim', () => ({ claimBlobForRecord, releaseBlobClaim }));

const mockPrisma = vi.hoisted(() => ({
  pAUDDevelopmentAssessment: { findUnique: vi.fn() },
  pAUDAssessmentEvidence: { create: vi.fn(), findUnique: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { paudAssessmentService } from '../paud-assessment.service';

const input = {
  assessmentId: 'a-1',
  fileUrl: 'https://store/e.png',
  fileType: 'image',
  fileName: 'e.png',
  caption: '',
} as any;

describe('paudAssessmentService.createEvidence — blob claim (BUG 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimBlobForRecord.mockResolvedValue(true);
    releaseBlobClaim.mockResolvedValue(undefined);
    mockPrisma.pAUDDevelopmentAssessment.findUnique.mockResolvedValue({ id: 'a-1' });
  });

  it('claims the evidence before insert and releases after', async () => {
    mockPrisma.pAUDAssessmentEvidence.create.mockResolvedValue({ id: 'e-1' });

    await paudAssessmentService.createEvidence(input, 'actor-1');

    expect(claimBlobForRecord).toHaveBeenCalledWith('https://store/e.png', 'actor-1');
    expect(releaseBlobClaim).toHaveBeenCalledWith('https://store/e.png', 'actor-1');
    expect(claimBlobForRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.pAUDAssessmentEvidence.create.mock.invocationCallOrder[0]
    );
  });

  it('refuses when a discard holds the evidence file', async () => {
    claimBlobForRecord.mockResolvedValue(false);

    await expect(paudAssessmentService.createEvidence(input, 'actor-1')).rejects.toThrow(
      /sedang diproses/
    );

    expect(mockPrisma.pAUDAssessmentEvidence.create).not.toHaveBeenCalled();
    expect(releaseBlobClaim).not.toHaveBeenCalled();
  });

  it('releases the claim even when the insert throws', async () => {
    mockPrisma.pAUDAssessmentEvidence.create.mockRejectedValue(new Error('db down'));

    await expect(paudAssessmentService.createEvidence(input, 'actor-1')).rejects.toThrow('db down');

    expect(releaseBlobClaim).toHaveBeenCalledWith('https://store/e.png', 'actor-1');
  });

  it('does not create evidence for a missing assessment', async () => {
    mockPrisma.pAUDDevelopmentAssessment.findUnique.mockResolvedValue(null);

    await expect(paudAssessmentService.createEvidence(input, 'actor-1')).rejects.toThrow(
      /Assessment not found/
    );

    expect(claimBlobForRecord).not.toHaveBeenCalled();
  });
});