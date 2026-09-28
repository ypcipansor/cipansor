#!/usr/bin/env node
/**
 * E2E coverage audit: cross-references App Router pages (page.tsx files under
 * src/app) with Playwright specs (*.spec.ts under e2e) and prints a fresh
 * audit to stdout: the routes no spec visits, and the specs still on mocks.
 * It is the only record of coverage — a hand-kept table went stale and was
 * removed on 2026-09-25.
 *
 *   node scripts/e2e-coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = new URL("..", import.meta.url).pathname;

function walk(dir, pred, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

const routes = walk(join(webRoot, "src/app"), (p) => p.endsWith("/page.tsx"))
  .map((p) => relative(join(webRoot, "src/app"), p).replace(/\/?page\.tsx$/, ""))
  .map((r) => "/" + r)
  .sort();

const specFiles = walk(join(webRoot, "e2e"), (p) => p.endsWith(".spec.ts"));
const specs = specFiles.map((f) => {
  const s = readFileSync(f, "utf8");
  const gotos = [...new Set([...s.matchAll(/goto\(\s*[`'"](\/[^`'"?]*)/g)].map((m) => m[1]))];
  return {
    file: relative(webRoot, f),
    gotos,
    mock: s.includes("page.route("),
    loginAs: s.includes("loginAs"),
    skipped: /test\.describe\.skip|test\.skip\(/.test(s),
  };
});

const normalize = (p) => p.replace(/\$\{[^}]*\}/g, "[id]").replace(/\[[^\]]+\]/g, "[id]").replace(/\/$/, "") || "/";
const visited = new Set();
for (const spec of specs) {
  for (const g of spec.gotos) {
    const gn = normalize(g);
    for (const r of routes) {
      if (normalize(r) === gn) visited.add(r);
    }
  }
}

const real = specs.filter((s) => s.loginAs && !s.skipped);
const mock = specs.filter((s) => s.mock && !s.loginAs && !s.skipped);

console.log(`Routes: ${routes.length}`);
console.log(`Routes visited by >=1 spec: ${visited.size} (${Math.floor((visited.size * 100) / routes.length)}%)`);
console.log(`Specs: ${specs.length} — real-backend (loginAs): ${real.length}, mock-intercept (to migrate): ${mock.length}`);
console.log("\nMock-based specs still to migrate to loginAs + real backend:");
for (const s of mock) console.log(`  - ${s.file}`);
console.log("\nRoutes with no spec coverage:");
for (const r of routes) if (!visited.has(r)) console.log(`  - ${r}`);
