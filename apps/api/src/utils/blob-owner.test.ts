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
  'employmentContract',
  'alumni',
  'course',
  'extracurricular',
  'canteenItem',
  'muhadhoroh',
  'assetMaintenance',
  'letterDispatch',
  'calendarEvent',
  'donationCampaign',
  'kitabKuning',
  'unit',
  'foundation',
  'digitalCertificate',
  'studentNote',
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
    'employmentContract',
    'alumni',
    'course',
    'extracurricular',
    'canteenItem',
    'muhadhoroh',
    'assetMaintenance',
    'letterDispatch',
    'calendarEvent',
    'donationCampaign',
    'kitabKuning',
    'unit',
    'foundation',
    'digitalCertificate',
    'studentNote',
  ]) {
    models[model] = { findFirst: vi.fn(), count: vi.fn() };
  }
  return { prisma: models };
});

import { prisma } from '@/lib/prisma';
import { isBlobStillReferenced, findBlobOwner } from './blob-owner';

describe('findBlobOwner probe coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].findFirst.mockResolvedValue(null);
    }
  });

  it('names the record that references the URL', async () => {
    (prisma as any).book.findFirst.mockResolvedValue({ unitId: 'unit-2' });
    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/x.pdf')
    ).resolves.toEqual({ kind: 'unit', unitId: 'unit-2' });
  });

  it('returns null when no record references the URL', async () => {
    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/x.pdf')
    ).resolves.toBeNull();
  });
});

describe('findBlobOwner parallel probe batches (flag 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].findFirst.mockResolvedValue(null);
    }
  });

  it('stops probing later batches once an earlier batch matches', async () => {
    // `letter` is in the first batch; `portfolioFile` is in the second. A match
    // in batch 1 must short-circuit batch 2 entirely, or a lower-priority
    // record could never be reached — and the authorization rule would change.
    (prisma as any).letter.findFirst.mockResolvedValue({ id: 'letter-1' });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/x.pdf')
    ).resolves.toEqual({ kind: 'letter', letterId: 'letter-1' });

    expect((prisma as any).portfolioFile.findFirst).not.toHaveBeenCalled();
  });

  it('issues every probe of a batch together, even when the first one matches', async () => {
    // A serial implementation would stop at `portfolioFile` and never reach
    // `qualityEvidence`. Both being called is what proves the batch ran in
    // parallel rather than one call at a time.
    (prisma as any).portfolioFile.findFirst.mockResolvedValue({
      portfolio: { student: { userId: 'student-user', unitId: 'unit-1' }, isShowcase: false },
    });

    await findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/x.pdf');

    expect((prisma as any).portfolioFile.findFirst).toHaveBeenCalled();
    expect((prisma as any).qualityEvidence.findFirst).toHaveBeenCalled();
  });

  it('keeps the exact probe priority order the serial implementation had', () => {
    // The batch refactor must not reorder the owner probes: whichever record
    // wins decides the authorization rule, and a reshuffle silently weakens or
    // strengthens read access. This pins the order left-to-right, top to bottom.
    const source = readFileSync(join(process.cwd(), 'src', 'utils', 'blob-owner.ts'), 'utf8');
    const body = source.slice(
      source.indexOf('const batches:'),
      source.indexOf('for (const batch of batches)')
    );
    const order = [...body.matchAll(/^\s*const (\w+) = await /gm)].map((m) => m[1]);

    expect(order).toEqual([
      'letter',
      'employeeDoc',
      'studentDoc',
      'portfolioFile',
      'reportPhoto',
      'paudPhoto',
      'paudEvidence',
      'registrantDoc',
      'courseCert',
      'qualityEvidence',
      'studentPackage',
      'achievement',
      'book',
      'asset',
      'payment',
      'donation',
      'tahfidzRecord',
      'muhadatsah',
      'announcement',
      'revocationRequest',
      'student',
      'boardMember',
      'foundationDocument',
      'employmentContract',
      'alumni',
      'course',
      'extracurricular',
      'canteenItem',
      'muhadhoroh',
      'assetMaintenance',
      'letterDispatch',
      'calendarEvent',
      'donationCampaign',
      'kitab',
      'unit',
      'foundation',
      'digitalCertificate',
      'certificateVerification',
      'studentNote',
    ]);
  });
});

describe('assignment unit vs home unit (BUG 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].findFirst.mockResolvedValue(null);
    }
  });

  it('scopes an employee document by the primary active role assignment, not the home unit', async () => {
    // The user's profile unit (unit-home) differs from the unit their primary
    // active role assignment is scoped to (unit-assignment). The assignment is
    // what a token carries, and what employee-documents.service.ts authorizes
    // on; findBlobOwner must agree or the two halves of the decision diverge.
    (prisma as any).employeeDocument.findFirst.mockResolvedValue({
      userId: 'target',
      user: {
        unitId: 'unit-home',
        userRoles: [{ unitId: 'unit-assignment' }],
      },
    });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/ktp.pdf')
    ).resolves.toEqual({
      kind: 'user-document',
      userId: 'target',
      unitId: 'unit-assignment',
    });
  });

  it('scopes an employment-contract scan by the primary assignment too', async () => {
    (prisma as any).employmentContract.findFirst.mockResolvedValue({
      userId: 'target',
      user: {
        unitId: 'unit-home',
        userRoles: [{ unitId: 'unit-assignment' }],
      },
    });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/kontrak.pdf')
    ).resolves.toEqual({
      kind: 'user-document',
      userId: 'target',
      unitId: 'unit-assignment',
    });
  });

  it('falls back to the home unit when the owner has no active role assignment', async () => {
    (prisma as any).employeeDocument.findFirst.mockResolvedValue({
      userId: 'target',
      user: { unitId: 'unit-home', userRoles: [] },
    });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/ktp.pdf')
    ).resolves.toEqual({
      kind: 'user-document',
      userId: 'target',
      unitId: 'unit-home',
    });
  });
});

describe('global announcement attachment (FLAG)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].findFirst.mockResolvedValue(null);
    }
  });

  it('treats an all-units announcement (unitId = null) as readable by any authenticated user', async () => {
    (prisma as any).announcement.findFirst.mockResolvedValue({ unitId: null });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/p.pdf')
    ).resolves.toEqual({ kind: 'authenticated' });
  });

  it('keeps a unit-specific announcement unit-scoped', async () => {
    (prisma as any).announcement.findFirst.mockResolvedValue({ unitId: 'unit-2' });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/p.pdf')
    ).resolves.toEqual({ kind: 'unit', unitId: 'unit-2' });
  });
});

describe('homeroom note attachments (flag 9 audit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of OWNER_MODELS) {
      (prisma as any)[model].findFirst.mockResolvedValue(null);
    }
  });

  it('scopes a String[] attachment by the student it belongs to', async () => {
    // The audit parses `String[]` fields too; `StudentNote.attachments` is a
    // list of URLs about one student, so it takes the personal-document rule.
    (prisma as any).studentNote.findFirst.mockResolvedValue({
      student: { userId: 'student-user', unitId: 'unit-3' },
    });

    await expect(
      findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/n.pdf')
    ).resolves.toEqual({
      kind: 'user-document',
      userId: 'student-user',
      unitId: 'unit-3',
    });
  });

  it('queries the attachment list with a `has` filter, not a scalar equality', async () => {
    (prisma as any).studentNote.findFirst.mockResolvedValue(null);
    await findBlobOwner('cipansor-documents', 'https://store/cipansor-documents/n.pdf');
    expect((prisma as any).studentNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attachments: { has: 'https://store/cipansor-documents/n.pdf' } },
      })
    );
  });
});


/** Capture the `where` a count mock received for one call. */
async function captureWhere(
  model: { count: unknown },
  fn: () => Promise<unknown>
): Promise<any> {
  const count = model.count as {
    mockClear?: () => void;
    mock: { calls: unknown[][] };
  };
  count.mockClear?.();
  await fn();
  return (count.mock.calls[0][0] as any).where;
}

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

  it('matches the other equivalent spelling of an Azure blob (raw vs SAS)', async () => {
    // Severe finding: a raw Azure URL and its SAS form name ONE blob. A record
    // that stored the raw URL must be counted when the SAS form is probed, or
    // cleanup deletes a live blob.
    const sas = 'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf?sig=abc&se=2026';
    const raw = 'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf';
    (prisma as any).studentDocument.count.mockResolvedValue(1);

    await expect(isBlobStillReferenced(sas)).resolves.toBe(true);

    const where = (prisma as any).studentDocument.count.mock.calls[0][0].where;
    expect(where.fileUrl).toEqual({ in: expect.arrayContaining([sas, raw]) });
  });

  it('matches a local upload stored under a host the app no longer runs on', async () => {
    // The stored URL names an old origin; the request names the current one.
    // Both are the same file on disk, so the reference must be found.
    (prisma as any).letter.count.mockResolvedValue(1);
    const where = await captureWhere((prisma as any).letter, () =>
      isBlobStillReferenced('http://newhost:3001/uploads/abc.pdf')
    );
    // The suffix match is anchored at /uploads/ so it cannot widen to a foreign
    // path, and it never matches a path outside /uploads/.
    expect(JSON.stringify(where)).toContain('endsWith');
    expect(JSON.stringify(where)).toContain('/uploads/abc.pdf');
  });

  it('matches a stored URL whose host/port/protocol all differ (origin is incidental)', async () => {
    // A row written before a host move holds `http://oldhost:3000/uploads/x`
    // while the request names the current origin. The suffix match on the
    // canonical `/uploads/<file>` path is what bridges them.
    (prisma as any).studentDocument.count.mockResolvedValue(1);
    const where = await captureWhere((prisma as any).studentDocument, () =>
      isBlobStillReferenced('https://portal.cipansor.or.id/uploads/xyz.png')
    );
    expect(JSON.stringify(where)).toContain('/uploads/xyz.png');
    expect(JSON.stringify(where)).toContain('endsWith');
  });

  it('keeps a relative /uploads reference an exact scalar match (indexed fast path)', async () => {
    (prisma as any).letter.count.mockResolvedValue(0);
    const where = await captureWhere((prisma as any).letter, () =>
      isBlobStillReferenced('/uploads/rel.png')
    );
    // A relative path is still widened to the origin form, but the exact path
    // remains in the OR so the indexed equality can be used.
    expect(JSON.stringify(where)).toContain('/uploads/rel.png');
  });

  it('does NOT widen a malformed URL (returns it unchanged, exact)', async () => {
    (prisma as any).letter.count.mockResolvedValue(0);
    const where = await captureWhere((prisma as any).letter, () =>
      isBlobStillReferenced('http://[not-a-url')
    );
    expect(JSON.stringify(where)).not.toContain('endsWith');
  });

  it('does NOT widen a traversal string (normalizes outside /uploads/)', async () => {
    (prisma as any).letter.count.mockResolvedValue(0);
    const where = await captureWhere((prisma as any).letter, () =>
      isBlobStillReferenced('../../etc/passwd')
    );
    expect(JSON.stringify(where)).not.toContain('endsWith');
    expect(JSON.stringify(where)).not.toContain('/uploads/');
  });

  it('does NOT suffix-match a non-upload path (traversal cannot widen the probe)', async () => {
    (prisma as any).letter.count.mockResolvedValue(0);
    const where = await captureWhere((prisma as any).letter, () =>
      isBlobStillReferenced('/etc/passwd')
    );
    // A bare non-upload string is matched exactly, never by suffix.
    expect(JSON.stringify(where)).not.toContain('endsWith');
    expect(where.fileUrl).toBe('/etc/passwd');
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

/**
 * Stored `String`/`String?` fields whose name looks like a blob reference but
 * that are deliberately NOT blob-URL fields. Kept explicit, with a reason, so
 * the audit below can tell "not a blob" apart from "a blob nobody probed".
 */
const NON_BLOB_FIELDS: Record<string, string> = {
  'AlumniDonation.receiptNo': 'kwitansi number, not a file',
  'BlobClaim.blobUrl':
    'coordination key for the upload/discard handshake, not a stored blob reference (no owner to resolve and no record points at it)',
  'Book.fileType': 'MIME type string, not a URL',
  'Donation.receiptNumber': 'receipt number, not a file',
  'LetterRevocationRequest.signatureId': 'FK to a LetterSignature row',
  'LetterSignedDocument.signatureId': 'FK to a LetterSignature row',
  'LetterSignature.pdfSignature': 'inline signature payload, not a blob',
  'LetterSignature.revocationSignature': 'inline signature payload, not a blob',
  'LetterSignature.signature': 'inline signature payload, not a blob',
  'PAUDAssessmentEvidence.fileName': 'display name, not a URL',
  'PAUDAssessmentEvidence.fileType': 'MIME type string, not a URL',
  'PAUDNarrativeReport.principalSignature': 'inline signature text, not a blob',
  'PAUDNarrativeReport.teacherSignature': 'inline signature text, not a blob',
  'PortfolioFile.fileName': 'display name, not a URL',
  'PortfolioFile.fileType': 'MIME type string, not a URL',
  'User.twoFactorRecoveryCodes': 'encrypted codes, not a blob',
  'UserIdentity.ktpFileName': 'display name, not a URL',
};

describe('stored blob-URL field audit (flag 9)', () => {
  /**
   * Split `findBlobOwner`'s source into one segment per `prisma.<model>.findFirst`
   * probe, keyed by model name. A segment runs from its own probe call to the
   * next probe, so the fields it references are the ones *that* model queries.
   */
  function probeSegments(source: string): Map<string, string[]> {
    const probeRe = /prisma\.(\w+)\.findFirst/g;
    const starts: Array<{ model: string; index: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = probeRe.exec(source)) !== null) {
      starts.push({ model: match[1], index: match.index });
    }
    const segments = new Map<string, string[]>();
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
      const segment = source.slice(start.index, end);
      const existing = segments.get(start.model) ?? [];
      existing.push(segment);
      segments.set(start.model, existing);
    });
    return segments;
  }

  it('probes every blob-like String field in the Prisma schema', () => {
    // `findBlobOwner` is a hand-maintained index; a new model field that stores
    // an uploaded URL is invisible to it until someone remembers to add a probe,
    // and the failure mode is a file that uploaded cleanly but 403s forever.
    // This reads the schema directly so a field added by a future migration is
    // caught here rather than in production.
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const source = readFileSync(join(process.cwd(), 'src', 'utils', 'blob-owner.ts'), 'utf8');
    const segments = probeSegments(source);

    const blobLike =
      /(url|photo|image|file|logo|banner|attach|cover|signature|receipt|audio|video|scan|proof)/i;
    const found: string[] = [];
    let model: string | null = null;
    for (const line of schema.split('\n')) {
      const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);
      if (modelMatch) {
        model = modelMatch[1];
        continue;
      }
      if (line.startsWith('}')) {
        model = null;
        continue;
      }
      if (!model) continue;
      const fieldMatch = /^\s*(\w+)\s+String\??\b/.exec(line);
      if (fieldMatch && blobLike.test(fieldMatch[1])) {
        found.push(`${model}.${fieldMatch[1]}`);
      }
    }

    expect(found.length).toBeGreaterThan(0);
    // The probe is matched against the field's OWN model segment, not the file
    // at large. `source.includes('fileUrl')` passed for any model because some
    // other model's probe mentions the name; a field belonging to a model with
    // no probe (or a probe that omits it) must fail here.
    const unaccounted = found.filter((field) => {
      if (NON_BLOB_FIELDS[field]) return false;
      const [modelName, fieldName] = field.split('.');
      // Prisma model names are camelCase in the client (the DB is snake_case).
      const clientModel = modelName[0].toLowerCase() + modelName.slice(1);
      const ownSegments = segments.get(clientModel);
      return !ownSegments || !ownSegments.some((segment) => segment.includes(fieldName));
    });

    expect(unaccounted).toEqual([]);
  });

  it('every probed model is a real Prisma model (no stale probe)', () => {
    // The reverse drift: a probe left behind after its model was renamed or
    // removed would silently never match, and the guard above would not notice.
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const source = readFileSync(join(process.cwd(), 'src', 'utils', 'blob-owner.ts'), 'utf8');

    const schemaModels = new Set(
      [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
        (m) => m[1][0].toLowerCase() + m[1].slice(1)
      )
    );
    const probedModels = [...source.matchAll(/prisma\.(\w+)\.findFirst/g)].map((m) => m[1]);

    const stale = [...new Set(probedModels)].filter((model) => !schemaModels.has(model));
    expect(stale).toEqual([]);
  });
});
