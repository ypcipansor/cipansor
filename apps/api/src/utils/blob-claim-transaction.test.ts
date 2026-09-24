/**
 * Claim/record transaction invariant guard (finding E).
 *
 * The claim protocol only closes the discard race if the claim, the record
 * write and the release/re-assert all use the SAME transaction client. When a
 * service opens `prisma.$transaction(async (tx) => …)` to write the record but
 * the claim helpers fall back to the global `prisma` client, the claim commits
 * on a different connection: a rollback of the record leaves the claim behind,
 * and — worse — the claim row can be committed before the record, so the
 * discard's "no live RECORD claim" probe and this create disagree about what is
 * durable.
 *
 * ## Why this is an AST guard, not a unit test
 *
 * The per-service tests mock the claim helpers, so they cannot see which client
 * an implementation passes. This scanner parses each service with the
 * TypeScript compiler API and, for every claim/release call syntactically
 * inside a `$transaction` callback, requires the callback's transaction
 * identifier to be passed as an argument.
 *
 * Claims taken OUTSIDE any transaction (the common single-write case) are
 * intentionally not flagged: they rely on the TTL + conditional-takeover
 * protocol, not on a rollback.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Claim helpers that take an optional trailing `ClaimClient`. */
const CLAIM_HELPERS = new Set([
  'claimBlobForRecord',
  'claimBlobsForRecord',
  'releaseBlobClaimById',
  'releaseBlobClaims',
]);

export interface TxClaimViolation {
  line: number;
  helper: string;
  txVar: string;
}

/**
 * Return every claim/release call that sits inside a `$transaction(async (tx) =>
 * …)` callback but does NOT receive `tx`.
 */
export function findTxClaimViolations(source: string, fileName = 'service.ts'): TxClaimViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: TxClaimViolation[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === '$transaction' &&
      node.arguments.length > 0 &&
      (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
    ) {
      const callback = node.arguments[0];
      const txVar = callback.parameters[0]?.name;
      if (txVar && ts.isIdentifier(txVar)) {
        const txName = txVar.text;
        const walkTx = (inner: ts.Node): void => {
          if (
            ts.isCallExpression(inner) &&
            ts.isIdentifier(inner.expression) &&
            CLAIM_HELPERS.has(inner.expression.text)
          ) {
            const passesTx = inner.arguments.some(
              (arg) => ts.isIdentifier(arg) && arg.text === txName
            );
            if (!passesTx) {
              violations.push({
                line: lineOf(inner),
                helper: inner.expression.text,
                txVar: txName,
              });
            }
          }
          ts.forEachChild(inner, walkTx);
        };
        ts.forEachChild(callback.body, walkTx);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);
  return violations;
}

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

describe('claim helpers inside a transaction pass the transaction client (finding E)', () => {
  it('every claim/release call inside $transaction receives the tx client', () => {
    const files = walk(join(process.cwd(), 'src', 'modules'));
    const offenders: string[] = [];
    for (const file of files) {
      for (const v of findTxClaimViolations(readFileSync(file, 'utf8'), file)) {
        offenders.push(
          `${byName(file)}:${v.line} ${v.helper}() inside $transaction(${v.txVar}) does not pass ${v.txVar}`
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  // ── Negative fixtures: prove the scanner catches the mixed case ────────────

  it('FLAGS a claim inside a transaction that omits the tx client', () => {
    const source = [
      'export async function create(input: any) {',
      '  return prisma.$transaction(async (tx) => {',
      '    const claim = await claimBlobForRecord(input.fileUrl, "u1");',
      '    await tx.example.create({ data: { fileUrl: input.fileUrl } });',
      '    await releaseBlobClaimById(claim);',
      '  });',
      '}',
    ].join('\n');

    const found = findTxClaimViolations(source);
    expect(found.map((v) => v.helper)).toEqual(['claimBlobForRecord', 'releaseBlobClaimById']);
  });

  it('does NOT flag the same claim when it passes tx', () => {
    const source = [
      'export async function create(input: any) {',
      '  return prisma.$transaction(async (tx) => {',
      '    const claim = await claimBlobForRecord(input.fileUrl, "u1", tx);',
      '    await tx.example.create({ data: { fileUrl: input.fileUrl } });',
      '    await releaseBlobClaimById(claim, tx);',
      '  });',
      '}',
    ].join('\n');

    expect(findTxClaimViolations(source)).toEqual([]);
  });

  it('does NOT flag a claim taken outside any transaction (TTL protocol)', () => {
    const source = [
      'export async function create(input: any) {',
      '  const claim = await claimBlobForRecord(input.fileUrl, "u1");',
      '  await prisma.example.create({ data: { fileUrl: input.fileUrl } });',
      '  await releaseBlobClaimById(claim);',
      '}',
    ].join('\n');

    expect(findTxClaimViolations(source)).toEqual([]);
  });
});
