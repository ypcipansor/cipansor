import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * BUG: reads from `/uploads` were rate-limited unconditionally while the global
 * limiter is deliberately OFF in development and test. A dashboard full of
 * student photos therefore 429'd on the 101st image in exactly the environment
 * where nothing else is limited — a false failure that teaches nothing and
 * cannot be reproduced in production.
 *
 * The exemption used to live in the MOUNT (`...readLimiter`, an array that was
 * empty outside production). That hid the protection from both a reader and
 * static analysis: CodeQL flagged the route as un-rate-limited because the
 * limiter was not a literal argument. The exemption now lives INSIDE
 * `defaultLimiter.skip`, so the mount is unconditional and visibly limited in
 * every environment while dev/test stay unlimited.
 *
 * `config.env` is read at module load, so flipping `NODE_ENV` inside a test
 * cannot re-evaluate it. The guard is therefore source-based, the same way
 * `public-routes-gated.test.ts` audits route wiring: it reads both files and
 * pins that the uploads route mounts `defaultLimiter` directly, and that the
 * dev/test exemption is in the limiter's `skip`.
 */
const APP_SOURCE = fs.readFileSync(path.join(__dirname, 'app.ts'), 'utf8');
const LIMITER_SOURCE = fs.readFileSync(path.join(__dirname, 'middleware', 'rate-limit.ts'), 'utf8');

/** The `app.use('/uploads', ...)` statement, up to its closing `);`. */
function uploadsMount(): string {
  const start = APP_SOURCE.indexOf("app.use(\n  '/uploads'");
  expect(start, "app.use('/uploads', ...) not found in app.ts").toBeGreaterThan(-1);
  const end = APP_SOURCE.indexOf(');', start);
  return APP_SOURCE.slice(start, end);
}

describe('/uploads read limiter follows the global environment policy', () => {
  it('mounts the limiter statically so the route is visibly rate-limited', () => {
    const mount = uploadsMount();
    // The limiter is a direct argument, not an array spread that can be empty:
    // CodeQL (and a reader) can see the protection.
    expect(mount).toMatch(/^\s*defaultLimiter,\s*$/m);
    expect(APP_SOURCE).not.toMatch(/const readLimiter/);
  });

  it('puts the dev/test exemption inside defaultLimiter.skip, not the mount', () => {
    // The exemption must exist, and must be keyed on the environment.
    expect(LIMITER_SOURCE).toMatch(/config\.env === 'test' \|\| config\.env === 'development'/);
    const defaultLimiterBlock = LIMITER_SOURCE.slice(
      LIMITER_SOURCE.indexOf('export const defaultLimiter'),
      LIMITER_SOURCE.indexOf('export const authLimiter')
    );
    expect(defaultLimiterBlock).toContain('skip:');
    expect(defaultLimiterBlock).toMatch(/config\.env === 'test'/);
  });

  it('gates the global limiter with an unconditional mount too', () => {
    // The two mounts must not disagree: both are statically limited, and the
    // environment policy is entirely inside the limiter.
    expect(APP_SOURCE).toMatch(/\/\/ Rate limiting[\s\S]{0,200}app\.use\(defaultLimiter\);/);
    expect(APP_SOURCE).not.toMatch(
      /if \(config\.env !== 'test'[\s\S]{0,80}app\.use\(defaultLimiter\)/
    );
  });

  it('still authorizes every upload read (the limiter is not the only guard)', () => {
    // Removing the limiter in dev/test must not remove the authorization gate.
    expect(uploadsMount()).toContain('uploadsAuth');
  });
});
