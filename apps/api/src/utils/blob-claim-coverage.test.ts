/**
 * Writer/claim coverage drift guard (flag 9).
 *
 * `blob-owner.test.ts` proves the *reference index* (`findBlobOwner` /
 * `isBlobStillReferenced`) knows about every stored blob-URL field. That is only
 * half the story: the index decides who may read a blob, but it is the *writers*
 * — the create/update paths that persist a client-supplied URL — who must
 * participate in the claim protocol, because a writer that skips it can commit a
 * reference while a discard is mid-delete (BUG 4).
 *
 * This guard is deliberately blunt: it finds every service that persists a
 * client-supplied blob URL into a Prisma write and asserts the same file imports
 * a claim helper. A new writer added without the protocol fails here rather than
 * in a production race. It cannot see *whether* the claim is taken correctly —
 * the per-module tests and the real-Postgres integration suite do that — but it
 * makes "forgot the protocol entirely" impossible to merge.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Client-supplied blob-URL field names, matched only against the *write* shape —
 * never a read mapping or a DTO passthrough.
 */
const BLOB_URL_FIELDS = [
  'fileUrl',
  'photoUrl',
  'imageUrl',
  'attachmentUrl',
  'logoUrl',
  'coverUrl',
  'audioUrl',
  'videoUrl',
  'proofUrl',
  'documentUrl',
  'pdfUrl',
  'signatureUrl',
  'thumbnailUrl',
  'receiptUrl',
  'invoiceUrl',
  'paymentProof',
  'recordingUrl',
  'certificateUrl',
];

const FIELD = BLOB_URL_FIELDS.join('|');

/** `fieldUrl: data.fieldUrl` / `input.fieldUrl` / … — the canonical write shape. */
const CANONICAL_WRITE_RE = new RegExp(
  `\\b(${FIELD})\\s*:\\s*(input|data|payload|body|dto)\\.\\1\\b`
);

/**
 * `fieldUrl: <identifier>` — a writer that copies the URL out of a differently
 * named variable (`photoUrl: url`, `fileUrl: docUrl`). Rejects a literal boolean
 * (`select: { photoUrl: true }`) so a relation read never registers as a write.
 */
function isAliasWrite(line: string): boolean {
  const m = line.match(new RegExp(`\\b(${FIELD})\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*,?\\s*$`));
  if (!m) return false;
  return m[2] !== 'true' && m[2] !== 'false';
}

/**
 * Writers that genuinely do not need the claim protocol, with the reason. A
 * blob-URL field written by the *server itself* (not a client object-store
 * upload) cannot race a discard, because a discard only ever targets a
 * client-uploaded blob. Keyed by filename so an exemption cannot silently cover
 * an unrelated writer.
 */
const CLAIM_EXEMPT: Record<string, string> = {
  'admissions.service.ts':
    'Registrant documents are stored inline as a data: URI or an external https URL — ' +
    'never an object-store blob — so there is no blob to discard and nothing to claim.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'dist') continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.service.ts')) {
      out.push(full);
    }
  }
  return out;
}

function persistsClientBlobUrl(source: string): boolean {
  return source.split('\n').some((line) => {
    if (line.includes('select:') || line.includes('include:')) return false;
    return CANONICAL_WRITE_RE.test(line) || isAliasWrite(line);
  });
}

function hasClaimProtocol(source: string): boolean {
  return source.includes('claimBlobForRecord') || source.includes('claimBlobsForRecord');
}

const byName = (file: string) => file.split('/').pop() as string;

describe('blob writer claim coverage (flag 9)', () => {
  const files = walk(join(process.cwd(), 'src', 'modules'));
  const writers = files.filter((file) => persistsClientBlobUrl(readFileSync(file, 'utf8')));

  it('finds the expected writers (the scanner itself has not gone blind)', () => {
    // An empty writer list would make the assertion below vacuously true.
    expect(writers.length).toBeGreaterThanOrEqual(15);
  });

  it('every service that persists a client-supplied blob URL takes the claim protocol', () => {
    const unguarded = writers.filter((file) => {
      if (CLAIM_EXEMPT[byName(file)]) return false;
      return !hasClaimProtocol(readFileSync(file, 'utf8'));
    });

    // If a writer genuinely cannot race a discard, add it to CLAIM_EXEMPT with
    // the reason rather than dropping this assertion.
    expect(unguarded).toEqual([]);
  });

  it('the exemption list only names files that actually exist as writers', () => {
    // Keeps a stale exemption from masking a future writer that reused a name.
    const writerNames = new Set(writers.map(byName));
    for (const name of Object.keys(CLAIM_EXEMPT)) {
      expect(writerNames.has(name)).toBe(true);
    }
  });

  it('recognises alias-style writers (`photoUrl: url`, `fileUrl: docUrl`)', () => {
    // Guards the alias half of the scanner: if the regex silently stops matching,
    // these writers would slip past the coverage assertion above.
    const names = new Set(writers.map(byName));
    expect(names.has('daily-report.service.ts')).toBe(true);
    expect(names.has('admissions.service.ts')).toBe(true);
  });
});
