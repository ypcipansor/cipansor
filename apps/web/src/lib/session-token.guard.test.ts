import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * The migration's acceptance evidence, checked without a browser.
 *
 * Issue #523 asks for "evidence that accessToken/refreshToken are absent from
 * document.cookie and localStorage". The Playwright specs assert that at
 * runtime, but they need the whole stack up. This guard reads the ships-to-the-
 * browser source instead: if any page, store or helper ever writes a bearer
 * token into `localStorage` or `document.cookie` again — the exact regression
 * the migration removes — it fails in the ordinary unit run.
 *
 * Only real code is scanned: test/spec files and comment lines are skipped, so
 * the explanatory prose in stores/auth.ts does not trip it.
 */
const ROOT = process.cwd();
const TOKEN_NAMES = "(?:accessToken|refreshToken|tempToken)";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

/** Strip `//` and `/** … *\/` comment lines so prose never counts as code. */
function codeLines(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("*"));
}

const files = [
  ...sourceFiles(path.join(ROOT, "src")),
  path.join(ROOT, "middleware.ts"),
];

describe("no bearer token is written where JavaScript can read it", () => {
  it("never writes a token into localStorage", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const line of codeLines(file)) {
        if (
          /localStorage\.(setItem|getItem)\s*\(\s*["'`]/.test(line) &&
          new RegExp(TOKEN_NAMES).test(line)
        ) {
          offenders.push(`${path.relative(ROOT, file)}: ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never writes a token into document.cookie", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const line of codeLines(file)) {
        if (
          /document\.cookie\s*=/.test(line) &&
          new RegExp(TOKEN_NAMES).test(line)
        ) {
          offenders.push(`${path.relative(ROOT, file)}: ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not keep a client-readable middleware auth cookie", () => {
    // The old `auth-cookie.ts` let the client write the cookie middleware.ts
    // trusted. That file is gone; nothing else may reintroduce the shape.
    expect(fs.existsSync(path.join(ROOT, "src/lib/auth-cookie.ts"))).toBe(
      false,
    );
  });
});
