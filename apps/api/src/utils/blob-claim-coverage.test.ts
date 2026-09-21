/**
 * Writer/claim coverage drift guard (flag 9).
 *
 * `blob-owner.test.ts` proves the *reference index* (`findBlobOwner` /
 * `isBlobStillReferenced`) knows about every stored blob-URL field. That is only
 * half the story: the index decides who may read a blob, but it is the *writers*
 * — the create/update paths that persist a client-supplied URL — who must
 * participate in the claim protocol, because a writer that skips it can commit
 * a reference while a discard is mid-delete (BUG 4).
 *
 * ## Why this is per-WRITE-SITE, not per-file (flag 9)
 *
 * The first version of this guard asked only whether a service file contained a
 * claim call *anywhere*. A file with one protected write and one unprotected
 * write passed, which is exactly the mixed case a real regression looks like:
 * add a second write path to a service and forget the protocol. The scanner
 * here parses each service with the TypeScript compiler API, finds every write
 * that assigns a blob-URL field, and requires a claim call inside the
 * *function-like node that owns that write* (the nearest enclosing
 * function/method/arrow). A claim in a sibling method, or at module scope,
 * cannot cover it.
 *
 * It cannot see *whether* the claim is taken with the right identity — the
 * per-module tests and the real-Postgres integration suite do that. It makes
 * "forgot the protocol at one write site" impossible to merge.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Client-supplied blob-URL field names, matched only against the *write* shape —
 * never a read mapping or a DTO passthrough.
 */
export const BLOB_URL_FIELDS = [
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
] as const;

const BLOB_FIELD_SET = new Set<string>(BLOB_URL_FIELDS);

/** A value that came from the caller (`input.fileUrl`, `data.photoUrl`, …). */
const CLIENT_VALUE_RE = /\b(input|data|payload|body|dto)\b/;

/**
 * Root identifiers whose `.<blobField>` access is a client-supplied URL — the
 * uploader or a list item being persisted. A read projection accesses the same
 * field through an entity variable (`student.photoUrl`, `campaign.imageUrl`),
 * which must NOT register as a write; listing the client roots is what tells the
 * two apart.
 */
const CLIENT_ROOTS = new Set([
  'input',
  'data',
  'payload',
  'body',
  'dto',
  'att',
  'attachment',
  'attachments',
  'file',
  'files',
  'url',
  'urls',
]);

/** Leftmost identifier of a property-access chain (`a.b.c` -> `a`). */
function rootIdentifier(node: ts.Expression): string | null {
  let current: ts.Expression = node;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
}

/**
 * A bare identifier we should treat as a client URL even without a prefix
 * (`photoUrl: url`, `fileUrl: docUrl`) — the `.map((url) => …)` shape.
 */
function looksLikeUrlIdentifier(node: ts.Expression): boolean {
  if (!ts.isIdentifier(node)) return false;
  return /url|photo|file|image|attachment|document|proof|invoice/i.test(node.text);
}

/** Does the value derive from a client-supplied URL? */
function isClientDerivedValue(node: ts.Expression): boolean {
  if (CLIENT_VALUE_RE.test(node.getText())) return true;
  if (ts.isPropertyAccessExpression(node)) {
    const root = rootIdentifier(node);
    return root !== null && CLIENT_ROOTS.has(root);
  }
  return looksLikeUrlIdentifier(node);
}

/** Is this object-literal property a write of a blob URL into a DB record? */
function isBlobWrite(node: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(node)) return null;
  const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
  if (!name || !BLOB_FIELD_SET.has(name)) return null;

  const value = node.initializer;
  // `select: { photoUrl: true }` / `include: { photoUrl: true }` are reads.
  if (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword) {
    return null;
  }
  if (!isClientDerivedValue(value)) return null;

  // A payload builder (`data: { ...(x ? { imageUrl } : {}) }`) names a blob
  // field without persisting it; a real write is not inside a spread.
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isSpreadAssignment(current) || ts.isSpreadElement(current)) return null;
    current = current.parent;
  }
  return name;
}

/** Every function-like ancestor of a node, nearest first. */
function ancestorFunctions(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      found.push(current);
    }
    current = current.parent;
  }
  return found;
}

function functionName(node: ts.Node | undefined, sf: ts.SourceFile): string {
  if (!node) return '<module>';
  const name = (node as ts.NamedDeclaration).name;
  if (name) return String(name.getText(sf));
  return '<anonymous>';
}

const CLAIM_CALL_RE = /\bclaimBlobForRecord\b|\bclaimBlobsForRecord\b/;

export interface WriteSite {
  /** 1-based line number. */
  line: number;
  field: string;
  /** Name of the owning function-like node, for a readable failure. */
  owner: string;
  /** Whether that owning function contains a claim call. */
  hasClaim: boolean;
}

/** Every blob-URL write in a service source, with its owning function. */
export function findWriteSites(source: string, fileName = 'service.ts'): WriteSite[] {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const sites: WriteSite[] = [];

  const record = (node: ts.Node, field: string): void => {
    const owners = ancestorFunctions(node);
    // A write inside a `.map((url) => ({ photoUrl: url }))` builder is covered
    // by the method that owns the closure, so the whole chain is searched — but
    // a module-scope call cannot cover a nested method.
    const hasClaim = owners.some((owner) => CLAIM_CALL_RE.test(owner.getText(sf)));
    sites.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      field,
      owner: functionName(owners[0], sf),
      hasClaim,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        const field = isBlobWrite(property);
        if (field) record(property, field);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      BLOB_FIELD_SET.has(node.left.name.text) &&
      (CLIENT_VALUE_RE.test(node.right.getText()) || looksLikeUrlIdentifier(node.right))
    ) {
      // A mutable builder object (`updateData.invoiceUrl = data.invoiceUrl`).
      record(node, node.left.name.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return sites;
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

/**
 * Filenames that must be detected as writers, so the scanner cannot go quiet on
 * the write shapes it was written to catch (`photoUrl: url` in a `.map` builder,
 * `data.invoiceUrl = …` on a mutable payload). A scanner that silently stops
 * matching would make the coverage assertion vacuously true.
 */
const ALIAS_WRITER_EXPECTATIONS = [
  'daily-report.service.ts',
  'canteen.service.ts',
  'inventory.service.ts',
];

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

const byName = (file: string) => file.split('/').pop() as string;

describe('blob writer claim coverage (flag 9)', () => {
  const files = walk(join(process.cwd(), 'src', 'modules'));
  const sitesByFile = new Map(
    files.map((file) => [file, findWriteSites(readFileSync(file, 'utf8'), file)])
  );
  const writers = files.filter((file) => (sitesByFile.get(file) as WriteSite[]).length > 0);

  it('finds the expected writers (the scanner itself has not gone blind)', () => {
    // An empty writer list would make the assertion below vacuously true.
    expect(
      writers.length,
      `writers=${writers.map(byName).join(',')} | expects=${ALIAS_WRITER_EXPECTATIONS.join(',')}`
    ).toBeGreaterThanOrEqual(15);
  });

  it('every write SITE — not merely every file — is inside a claiming function', () => {
    const unguarded: string[] = [];
    for (const file of writers) {
      if (CLAIM_EXEMPT[byName(file)]) continue;
      for (const site of sitesByFile.get(file) as WriteSite[]) {
        if (!site.hasClaim) {
          unguarded.push(
            `${byName(file)}:${site.line} writes ${site.field} in ${site.owner}() without a claim`
          );
        }
      }
    }

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

  it('recognises alias-style writers (`photoUrl: url`, `data.invoiceUrl = …`)', () => {
    // Guards the alias half of the scanner: if the value heuristic silently
    // stops matching, these writers would slip past the coverage assertion.
    const names = new Set(writers.map(byName));
    for (const name of ALIAS_WRITER_EXPECTATIONS) {
      expect(names.has(name)).toBe(true);
    }
  });

  // ── Negative fixtures: prove the scanner catches the mixed case ────────────

  it('FLAGS a service with one protected write and one unprotected write', () => {
    const mixed = [
      'export class ExampleService {',
      '  async protectedCreate(input: any) {',
      '    const claim = await claimBlobForRecord(input.fileUrl, "u1");',
      '    await prisma.example.create({ data: { fileUrl: input.fileUrl } });',
      '    if (claim) await releaseBlobClaimById(claim);',
      '  }',
      '',
      '  async unprotectedCreate(input: any) {',
      '    await prisma.example.create({ data: { fileUrl: input.fileUrl } });',
      '  }',
      '}',
    ].join('\n');

    const unguarded = findWriteSites(mixed).filter((s) => !s.hasClaim);

    expect(unguarded).toHaveLength(1);
    expect(unguarded[0]).toMatchObject({ line: 9, field: 'fileUrl', owner: 'unprotectedCreate' });
  });

  it('does NOT flag a service where every write is covered', () => {
    const protectedSource = [
      'export class BothService {',
      '  async create(input: any) {',
      '    const claim = await claimBlobForRecord(input.fileUrl, "u1");',
      '    await prisma.example.create({ data: { fileUrl: input.fileUrl } });',
      '    if (claim) await releaseBlobClaimById(claim);',
      '  }',
      '',
      '  async update(input: any) {',
      '    const claim = await claimBlobsForRecord([input.photoUrl], "u1");',
      '    await prisma.example.update({ data: { photoUrl: input.photoUrl } });',
      '    if (claim) await releaseBlobClaims(claim);',
      '  }',
      '}',
    ].join('\n');

    expect(findWriteSites(protectedSource).every((s) => s.hasClaim)).toBe(true);
  });

  it('does NOT let a file-scope claim cover a nested method (the old blind spot)', () => {
    // `claimBlobForRecord` is called at module scope, but the write is in a
    // method that never takes the protocol. Per-file substring matching passed
    // this; the AST-scoped scanner must not.
    const moduleScopeOnly = [
      'const eager = await claimBlobForRecord("x", "u1");',
      'export class TrickService {',
      '  async create(input: any) {',
      '    await prisma.example.create({ data: { fileUrl: input.fileUrl } });',
      '  }',
      '}',
    ].join('\n');

    expect(findWriteSites(moduleScopeOnly).every((s) => !s.hasClaim)).toBe(true);
  });

  it('does NOT treat `select`/`include` reads as writes', () => {
    const readsOnly = [
      'export async function list() {',
      '  return prisma.example.findMany({ select: { photoUrl: true, fileUrl: true } });',
      '}',
    ].join('\n');

    expect(findWriteSites(readsOnly)).toEqual([]);
  });
});
