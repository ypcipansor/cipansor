import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { app } from '../app';

/**
 * Every API call the web makes must reach a route the API serves.
 *
 * Nothing checked this, and on 2026-09-25 213 call sites in apps/web/src
 * pointed at paths the router does not have — among them the Setujui/Tolak
 * buttons of Perizinan (`POST /permits/:id/approve`; the API has
 * `PUT /permits/:id/status`), the Kurikulum list, HR employees and every
 * Sertifikat page. Each side was written by hand against an imagined other.
 *
 * The test reads the web source, finds each call and its path, and asks the
 * real router — the tree `app` mounts, walked the way Express dispatches:
 * layers in order, `layer.match()`, into mounted routers with the matched
 * prefix removed — whether some route answers that method and path.
 *
 * It is a ratchet. The calls that were already broken are listed in
 * `web-api-contract.baseline.json`; the test fails on any broken call not in
 * that list (a new one), and on any listed call that now works or no longer
 * exists (take it off the list — the list only shrinks).
 *
 * Refresh the list after fixing calls:
 *   WRITE_CONTRACT_BASELINE=1 pnpm --filter api exec vitest run src/utils/web-api-contract.guard.test.ts
 * and review the diff: it must only remove lines.
 *
 * Limits, stated so nobody over-reads a green run:
 * - A `${…}` segment is tried as an id and as each static segment the router
 *   serves at that point, so `/reports/${type}` passes if any `/reports/<x>`
 *   exists. It cannot know which values the variable really takes.
 * - `fetch()` is read only for "/api/…" literals and `${API_BASE|API_URL}/…`.
 * - Request and response bodies are not compared — only method and path.
 */

type RouteLayer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle: { stack?: RouteLayer[] };
  match(path: string): boolean;
  path?: string;
  params?: Record<string, unknown>;
};

const API_ROOT = resolve(__dirname, '..', '..');
const WEB_SRC = resolve(API_ROOT, '..', 'web', 'src');
const REPO_ROOT = resolve(API_ROOT, '..', '..');
const BASELINE_FILE = join(__dirname, 'web-api-contract.baseline.json');
const ID = '00000000-0000-4000-8000-000000000000';

const rootStack = (app as unknown as { router: { stack: RouteLayer[] } }).router.stack;

// ---------------------------------------------------------------- the router

/**
 * Walk the tree the way Express dispatches. Returns the parameter values the
 * matching route consumed along the way, or null when nothing answers.
 */
function dispatch(stack: RouteLayer[], method: string, path: string): string[] | null {
  for (const layer of stack) {
    if (!layer.match(path)) continue;
    const params = Object.values(layer.params ?? {}).map(String);
    if (layer.route) {
      if (layer.route.methods[method] || layer.route.methods._all) return params;
      continue;
    }
    if (layer.handle?.stack) {
      const rest = path.slice((layer.path ?? '').length) || '/';
      const inner = dispatch(layer.handle.stack, method, rest);
      if (inner) return [...params, ...inner];
    }
  }
  return null;
}

/** Static path segments served anywhere in the tree — candidates for a `${…}`. */
function staticSegments(stack: RouteLayer[], out = new Set<string>()): Set<string> {
  for (const layer of stack) {
    if (layer.route) {
      for (const p of ([] as string[]).concat(layer.route.path)) {
        for (const seg of p.split('/')) if (seg && !/[:*{(]/.test(seg)) out.add(seg);
      }
    } else if (layer.handle?.stack) {
      staticSegments(layer.handle.stack, out);
    }
  }
  return out;
}
const SEGMENTS = [...staticSegments(rootStack)];

function served(method: string, apiPath: string): boolean {
  // Express answers HEAD with the GET route.
  const m = method.toLowerCase() === 'head' ? 'get' : method.toLowerCase();
  const full = `/api${apiPath}`;
  if (dispatch(rootStack, m, full)) return true;
  // A `${…}` may stand for a static segment (`/reports/${type}`) — but only if
  // the route then consumes nothing but ids as parameters. Otherwise the
  // substitute pushed a segment the web wrote into a parameter, which proves
  // nothing: `/dormitories/${id}/rooms` must not pass as
  // `/dormitories/assignments/:id` with id = "rooms".
  const parts = full.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== ID) continue;
    for (const seg of SEGMENTS) {
      const alt = [...parts];
      alt[i] = seg;
      const params = dispatch(rootStack, m, alt.join('/'));
      if (params && params.every((v) => v === ID)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the web

function webFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === '__render__') continue;
      webFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** The text of the first argument: up to the first top-level `,` or `)`. */
function firstArgument(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return src.slice(from, i);
      depth--;
    } else if (c === ',' && depth === 0) return src.slice(from, i);
  }
  return src.slice(from);
}

const LITERAL = /`([^`]*)`|"([^"\n]*)"|'([^'\n]*)'/g;
const literalsIn = (text: string) =>
  [...text.matchAll(LITERAL)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');

/** A literal as an API path: query dropped, `/${x}` → an id, other `${x}` dropped. */
function normalise(raw: string): string | null {
  let p = raw.replace(/^\$\{(?:API_BASE|API_URL)\}/, '');
  if (!p.startsWith('/')) return null;
  p = p.split('?')[0];
  p = p.replace(/\/\$\{[^}]*\}/g, `/${ID}`).replace(/\$\{[^}]*\}/g, '');
  p = p.replace(/\/+$/, '');
  return p || '/';
}

type Call = { method: string; path: string; file: string };

/** Literals a variable is given in the same file (`const url = … ? "/a" : "/b"`). */
function literalsAssignedTo(src: string, name: string): string[] {
  const out: string[] = [];
  const bare = name.split('.').pop() as string;
  const assign = new RegExp(`\\b(?:const|let|var)?\\s*${bare}\\s*[:=]\\s*`, 'g');
  for (const m of src.matchAll(assign)) {
    out.push(...literalsIn(firstArgument(src, (m.index ?? 0) + m[0].length)));
  }
  return out;
}

function collectCalls(): { calls: Call[]; unresolved: string[] } {
  const calls: Call[] = [];
  const unresolved: string[] = [];
  const apiCall = /\b(?:api|apiClient)\.(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*/g;
  const fetchCall = /\bfetch\(\s*/g;
  for (const file of webFiles(WEB_SRC)) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    for (const m of src.matchAll(apiCall)) {
      const arg = firstArgument(src, (m.index ?? 0) + m[0].length);
      let paths = literalsIn(arg)
        .map(normalise)
        .filter((p): p is string => p !== null);
      if (paths.length === 0) {
        // `api.get(url)`, `api.get(type?.endpoint || "")`: follow the variable.
        const ident = arg
          .trim()
          .match(/^[A-Za-z_$][\w$.?]*/)?.[0]
          ?.replace(/\?/g, '');
        paths = (ident ? literalsAssignedTo(src, ident) : [])
          .map(normalise)
          .filter((p): p is string => p !== null);
        if (paths.length === 0) {
          unresolved.push(`${m[1].toUpperCase()} ${arg.trim().slice(0, 60)}  ${rel}`);
          continue;
        }
      }
      for (const path of new Set(paths))
        calls.push({ method: m[1].toUpperCase(), path, file: rel });
    }
    for (const m of src.matchAll(fetchCall)) {
      const start = (m.index ?? 0) + m[0].length;
      const arg = firstArgument(src, start);
      const lit = literalsIn(arg)[0];
      if (!lit) continue;
      let path: string | null = null;
      if (lit.startsWith('/api/')) path = normalise(lit.slice(4));
      else if (/^\$\{(?:API_BASE|API_URL)\}\//.test(lit)) path = normalise(lit);
      if (!path) continue;
      const opts = src.slice(start, start + 400).match(/method:\s*["'`](\w+)["'`]/i);
      calls.push({ method: opts ? opts[1].toUpperCase() : 'GET', path, file: rel });
    }
  }
  return { calls, unresolved };
}

// ---------------------------------------------------------------- the check

const keyOf = (c: Call) => `${c.method} ${c.path.split(ID).join('{id}')}  ${c.file}`;

const { calls, unresolved } = collectCalls();
const broken = [...new Set(calls.filter((c) => !served(c.method, c.path)).map(keyOf))].sort();

type Baseline = { broken: string[]; unresolved: string[] };
if (process.env.WRITE_CONTRACT_BASELINE === '1') {
  const next: Baseline = { broken, unresolved: [...new Set(unresolved)].sort() };
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n');
}
const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;

describe('web ↔ API contract', () => {
  it('reads the web source and the router (the walk is not vacuous)', () => {
    expect(calls.length).toBeGreaterThan(1200);
    expect(served('POST', '/auth/login')).toBe(true);
    expect(served('GET', `/students/${ID}`)).toBe(true);
    expect(served('POST', `/permits/${ID}/approve`)).toBe(true);
    // The web's old name for "mark returned"; the API never had it.
    expect(served('POST', `/permits/${ID}/returned`)).toBe(false);
    // The web client already prefixes /api; a call that writes it again goes to /api/api.
    expect(served('GET', '/api/risks')).toBe(false);
  });

  it('no web call hits a path the API does not serve, beyond the recorded baseline', () => {
    const fresh = broken.filter((k) => !baseline.broken.includes(k));
    expect(
      fresh,
      'New web calls to routes the API does not serve. Point them at a real route, or add the route (golden rule 8).'
    ).toEqual([]);
  });

  it('the baseline only lists calls that are still broken (fixed ones must come off it)', () => {
    const stale = baseline.broken.filter((k) => !broken.includes(k));
    expect(
      stale,
      'These baseline entries now work or no longer exist — remove them from web-api-contract.baseline.json.'
    ).toEqual([]);
  });

  it('every call whose path the test cannot read has been reviewed', () => {
    expect([...new Set(unresolved)].sort()).toEqual(baseline.unresolved);
  });
});
