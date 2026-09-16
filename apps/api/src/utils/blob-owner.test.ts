import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The models `findBlobOwner` probes with `findFirst`, and the reference index
 * `isBlobStillReferenced` counts. Kept explicit so a new probe added to one
 * side without the other surfaces as a drift failure (flag 9: audit every
 * stored blob-URL field).
 */
const OWNER_MODELS = [
  'studentDocument',
  'letter',
  'letterAttachment',
  'employeeDocument',
  'portfolioFile',
  'dailyReportPhoto',
  'pAUDReportPhoto',
  'pAUDAssessmentEvidence',
  'registrantDocument',
  'courseCertificate',
  'qualityEvidence',
  'studentPackage',
  'extracurricularAchievement',
  'book',
  'asset',
  'payment',
  'donation',
  'tahfidzRecord',
  'muhadatsah',
  'announcement',
  'letterRevocationRequest',
  'student',
  'boardMember',
  'foundationDocument',
] as const;

vi.mock('@/lib/prisma', () => {
  const models: Record<string, { findFirst: unknown; count: unknown }> = {};
  for (const model of [
    'studentDocument',
    'letter',
    'letterAttachment',
    'employeeDocument',
    'portfolioFile',
    'dailyReportPhoto',
    'pAUDReportPhoto',
    'pAUDAssessmentEvidence',
    'registrantDocument',
    'courseCertificate',
    'qualityEvidence',
    'studentPackage',
    'extracurricularAchievement',
    'book',
    'asset',
    'payment',
    'donation',
    'tahfidzRecord',
    'muhadatsah',
    'announcement',
    'letterRevocationRequest',
    'student',
    'boardMember',
    'foundationDocument',
  ]) {
    models[model] = { findFirst: vi.fn(), count: vi.fn() };
  }
  return { prisma: models };
});

import { prisma } from '@/lib/prisma';
import { isBlobStillReferenced } from './blob-owner';

describe('isBlobStillReferenced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].count.mockResolvedValue(0);
    }
  });

  it('returns false when no record references the URL', async () => {
    await expect(isBlobStillReferenced('https://store/container/orphan.pdf')).resolves.toBe(false);
  });

  it('returns true as soon as a second record still points at the same blob', async () => {
    // The first record was deleted; this one was cloned from it and still
    // needs the file. Deleting the blob would destroy it.
    (prisma as any).letterAttachment.count.mockResolvedValue(1);

    await expect(isBlobStillReferenced('https://store/container/shared.pdf')).resolves.toBe(true);
  });

  it('queries the URL as a stored blob reference on every probed model', async () => {
    await isBlobStillReferenced('https://store/container/shared.pdf');

    for (const model of OWNER_MODELS) {
      expect((prisma as any)[model].count, model).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    }
  });

  it('keeps the delete guard in sync with every findBlobOwner probe (drift guard)', () => {
    // The source of truth is the module itself: extract the models each side
    // touches and require the reference index to cover the owner probes. A new
    // `findBlobOwner` probe without a matching counter is a blob that could be
    // deleted while still live (flag 9).
    const source = readFileSync(join(process.cwd(), 'src', 'utils', 'blob-owner.ts'), 'utf8');
    const ownerModels = new Set([...source.matchAll(/prisma\.(\w+)\.findFirst/g)].map((m) => m[1]));
    const counterModels = new Set([...source.matchAll(/prisma\.(\w+)\.count/g)].map((m) => m[1]));

    expect([...ownerModels].sort()).toEqual([...counterModels].sort());
    expect([...ownerModels].sort()).toEqual([...OWNER_MODELS].sort());
  });
});
