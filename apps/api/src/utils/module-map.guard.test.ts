import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * `docs/MODULE-MAP.md` is a map of what the repository holds, so it rots the
 * moment a module is added, renamed or re-mounted. Nothing read it, and a map
 * that names a module which no longer exists sends the next reader to the wrong
 * place — worse than no map.
 *
 * This test re-derives every claim in the doc from the code and fails on a
 * drift: each module row must be a real directory, each route cell must match
 * `src/app.ts`, the layout column must match the files on disk, and each web
 * segment must be a real directory under `src/app` with its real page count.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const DOC = join(REPO_ROOT, 'docs', 'MODULE-MAP.md');
const MODULES_DIR = join(REPO_ROOT, 'apps', 'api', 'src', 'modules');
const APP_TS = join(REPO_ROOT, 'apps', 'api', 'src', 'app.ts');
const WEB_APP = join(REPO_ROOT, 'apps', 'web', 'src', 'app');

const doc = readFileSync(DOC, 'utf8');

const moduleDirs = readdirSync(MODULES_DIR).filter((n) =>
  statSync(join(MODULES_DIR, n)).isDirectory()
);

/** var name -> module directory, from the imports in app.ts. */
function importedRouters(): Record<string, string> {
  const source = readFileSync(APP_TS, 'utf8');
  const map: Record<string, string> = {};
  const re = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'@\/modules\/([^']+)'/g;
  for (const m of source.matchAll(re)) {
    const mod = m[3].split('/')[0];
    if (m[2]) map[m[2]] = mod;
    if (m[1]) for (const n of m[1].split(',')) map[n.trim().split(' as ').pop()!.trim()] = mod;
  }
  return map;
}

/** module -> sorted route paths mounted in app.ts. */
function mountsByModule(): Record<string, string[]> {
  const source = readFileSync(APP_TS, 'utf8');
  const byVar = importedRouters();
  const out: Record<string, string[]> = {};
  for (const m of source.matchAll(/apiRouter\.use\('([^']+)',\s*([A-Za-z0-9_]+)\)/g)) {
    const mod = byVar[m[2]];
    if (!mod) continue;
    (out[mod] ??= []).push(m[1]);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

function layoutOf(name: string): 'lengkap' | 'parsial' {
  const dir = join(MODULES_DIR, name);
  const has = (f: string) => existsSync(join(dir, f));
  const standard =
    has(`${name}.routes.ts`) &&
    has(`${name}.controller.ts`) &&
    has(`${name}.service.ts`) &&
    has(`${name}.schema.ts`) &&
    has('index.ts');
  return standard ? 'lengkap' : 'parsial';
}

const apiRows = [...doc.matchAll(/^\| `([a-z0-9-]+)` \| (.+?) \| (lengkap|parsial) \|$/gm)].map(
  (m) => ({ name: m[1], mountsCell: m[2], layout: m[3] })
);
const webRows = [...doc.matchAll(/^\| `(\/[a-z-]+)` \| (\d+) \| (ya)?\s*\|$/gm)].map((m) => ({
  seg: m[1],
  pages: Number(m[2]),
  layout: Boolean(m[3]),
}));

describe('docs/MODULE-MAP.md', () => {
  it('lists every API module directory and nothing else', () => {
    expect(apiRows.map((r) => r.name).sort()).toEqual([...moduleDirs].sort());
  });

  it('names only real module directories', () => {
    for (const { name } of apiRows) {
      expect(moduleDirs, `${name} is not in apps/api/src/modules`).toContain(name);
    }
  });

  it('reports the route each module is mounted at, per app.ts', () => {
    const mounts = mountsByModule();
    for (const { name, mountsCell } of apiRows) {
      const real = mounts[name] ?? [];
      const cell =
        mountsCell === '—' ? [] : [...mountsCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      expect(cell, `mount mismatch for ${name}`).toEqual(real);
    }
  });

  it('reports each module layout as the files on disk say', () => {
    for (const { name, layout } of apiRows) {
      expect(layout, `layout mismatch for ${name}`).toBe(layoutOf(name));
    }
  });

  it('lists every top-level web segment with its real page count', () => {
    const segments = readdirSync(WEB_APP).filter((n) => statSync(join(WEB_APP, n)).isDirectory());
    expect(webRows.map((r) => r.seg).sort()).toEqual(segments.map((s) => `/${s}`).sort());
    for (const { seg, pages, layout } of webRows) {
      let count = 0;
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === 'page.tsx') count++;
        }
      };
      walk(join(WEB_APP, seg));
      expect(count, `page count for ${seg}`).toBe(pages);
      expect(layout, `layout.tsx for ${seg}`).toBe(existsSync(join(WEB_APP, seg, 'layout.tsx')));
    }
  });
});
