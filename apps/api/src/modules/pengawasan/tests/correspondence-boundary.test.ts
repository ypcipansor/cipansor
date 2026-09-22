import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architecture guard: the Pengawasan module must not write the correspondence
 * tables itself.
 *
 * The oversight report is filed as an E-Office DRAFT through exactly one
 * primitive, `CorrespondenceService.createGeneratedDraftLetter`, which lives in
 * the correspondence module because that is where the letter invariants are
 * (nature/type validity, recipient eligibility, and the `CREATED` flow event in
 * the same transaction). An oversight module that writes `Letter` /
 * `LetterFlowEvent` directly would carry a second, drifting copy of those rules
 * — and the previous PR revision did exactly that (`status: 'SENT'` written
 * straight into the row, skipping the lifecycle).
 *
 * Direct service-to-service calls are the repository's sanctioned pattern for
 * synchronous, value-returning work (AGENTS.md and docs/ARCHITECTURE.md reserve
 * the typed event bus for *side effects*, and they say so explicitly: "Cross-module
 * side effects — emit typed events on `eventBus`; don't reach into other modules'
 * services"). Real precedents in this tree: `analytics/alerts.service.ts` imports
 * `notifications.service`, `users/user.service.ts` imports `auth.service`, and
 * `lib/event-bus.ts` imports the notification services that consume its events.
 * The bus is explicitly not usable here: `createGeneratedDraftLetter` returns a
 * `letterId` the caller must return to its own client, and the bus is
 * fire-and-forget — there is no reply channel to carry it back. What this test
 * pins is the narrower rule that survived the review: no direct table access,
 * and the primitive stays the only entry.
 */

const PENGAWASAN_DIR = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'tests' ? [] : sourceFiles(full);
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [full];
  });
}

describe('pengawasan → correspondence boundary', () => {
  it('never writes the correspondence letter tables directly', () => {
    // Reads of reference data (a filing classification) are fine; *writes* to
    // the letter tables are not — those belong to the correspondence module.
    const forbidden =
      /\bprisma\.(letter|letterFlowEvent|letterRecipient)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const offenders = sourceFiles(PENGAWASAN_DIR)
      .filter((file) => forbidden.test(readFileSync(file, 'utf8')))
      .map((file) => relative(PENGAWASAN_DIR, file));

    expect(
      offenders,
      'file correspondence through CorrespondenceService.createGeneratedDraftLetter, not by writing its tables'
    ).toEqual([]);
  });

  it('files the oversight report through the sanctioned draft primitive', () => {
    const service = readFileSync(join(PENGAWASAN_DIR, 'pengawasan.service.ts'), 'utf8');
    expect(service).toContain('createGeneratedDraftLetter');
    // A letter must never be born already dispatched from oversight: that skips
    // the reviewer rung, the flow history and dispatch. Comments are stripped so
    // the guard tests code, not the prose that documents the old bug.
    const code = service
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/status:\s*'SENT'/);
  });
});
