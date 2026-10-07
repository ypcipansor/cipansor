import fs from 'fs';
import path from 'path';

/**
 * The API's own version, read from `apps/api/package.json` at runtime.
 *
 * Deliberately not `process.env.npm_package_version`: npm/pnpm export that only
 * while a package script is running, and the container starts with
 * `exec node dist/main.js` (`docker-entrypoint.sh`), so it is empty in every
 * deployed environment and the value would silently be a hard-coded fallback.
 * `apps/api/package.json` is copied into the image next to `dist/`
 * (`apps/api/Dockerfile`), so reading it is what makes the reported version the
 * real one.
 */
export function getAppVersion(): string {
  // From `src/lib/` (tsx, vitest) and from `dist/lib/` (node) this resolves to
  // `apps/api/package.json`; `process.cwd()` covers a start from the api root.
  const candidates = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // Not this one; try the next candidate.
    }
  }

  return 'unknown';
}
