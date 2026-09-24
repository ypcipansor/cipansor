import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * A route that runs `validateQuery` must actually read the result.
 *
 * Express 5 makes `req.query` a read-only getter that re-parses the URL on
 * every access, so `validateQuery` cannot write back to it — it parks the
 * parsed value in `res.locals.validatedQuery` instead. A controller that then
 * reads `req.query` gets the raw strings and, worse, none of the schema's
 * defaults. That is not a cosmetic difference: `listSanadQuerySchema` defaults
 * `page` to 1, so `GET /api/sanad?limit=50` left `page` undefined, the service
 * computed `skip = (undefined - 1) * 50 = NaN`, and Prisma answered
 * "Argument `skip` is missing" — a 500 on a plain list call.
 *
 * The failure is silent: the middleware runs, validation passes, and the route
 * looks correctly guarded. Only the response is wrong. So assert the pairing
 * statically instead of hoping it is noticed in review.
 */

const MODULES_DIR = path.join(__dirname, '..', 'modules');

/** Modules whose controllers parse the schema themselves rather than reading
 *  `res.locals` — equally correct, since the defaults still get applied. */
const PARSES_ITS_OWN_QUERY = new Set(['library']);

/** Modules that only read plain string filters, with no schema defaults to lose. */
const NO_DEFAULTS_TO_LOSE = new Set(['roles']);

function moduleDirs(): string[] {
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/**
 * Comments are stripped before searching. Without this the check passes on the
 * explanatory comment that sits right above the very code it is meant to
 * verify — which is exactly what happened the first time this test was run
 * against a deliberately reverted controller.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function readModuleSources(dir: string): { routes: string; rest: string } {
  const full = path.join(MODULES_DIR, dir);
  let routes = '';
  let rest = '';
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    const source = stripComments(fs.readFileSync(path.join(full, entry.name), 'utf8'));
    if (entry.name.endsWith('.routes.ts')) routes += source;
    else rest += source;
  }
  return { routes, rest };
}

describe('validateQuery / res.locals.validatedQuery pairing', () => {
  const dirs = moduleDirs();

  it('finds the API modules', () => {
    expect(dirs.length).toBeGreaterThan(20);
  });

  it('every module that validates its query also reads the validated result', () => {
    const offenders: string[] = [];

    for (const dir of dirs) {
      const { routes, rest } = readModuleSources(dir);
      if (!routes.includes('validateQuery(')) continue;
      if (PARSES_ITS_OWN_QUERY.has(dir) || NO_DEFAULTS_TO_LOSE.has(dir)) continue;

      const all = routes + rest;
      if (!all.includes('validatedQuery')) {
        offenders.push(
          `${dir}: routes call validateQuery() but no file reads res.locals.validatedQuery`
        );
      }
    }

    expect(offenders.sort()).toEqual([]);
  });

  it('keeps no exemption for a module that no longer needs one', () => {
    const stale: string[] = [];
    for (const dir of [...PARSES_ITS_OWN_QUERY, ...NO_DEFAULTS_TO_LOSE]) {
      if (!dirs.includes(dir)) stale.push(`${dir}: module no longer exists`);
      else if (!readModuleSources(dir).routes.includes('validateQuery(')) {
        stale.push(`${dir}: no longer calls validateQuery()`);
      }
    }
    expect(stale.sort()).toEqual([]);
  });
});
