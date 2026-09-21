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
 * `config.env` is read at module load, so flipping `NODE_ENV` inside a test
 * cannot re-evaluate it. The guard is therefore source-based, the same way
 * `public-routes-gated.test.ts` audits route wiring: it reads the mount and
 * pins that the uploads limiter is gated on the SAME environment condition as
 * the global mount below it.
 */
const APP_SOURCE = fs.readFileSync(path.join(__dirname, 'app.ts'), 'utf8');

/** The `app.use('/uploads', ...)` statement, up to its closing `);`. */
function uploadsMount(): string {
  const start = APP_SOURCE.indexOf("app.use(\n  '/uploads'");
  expect(start, "app.use('/uploads', ...) not found in app.ts").toBeGreaterThan(-1);
  const end = APP_SOURCE.indexOf(');', start);
  return APP_SOURCE.slice(start, end);
}

describe('/uploads read limiter follows the global environment policy', () => {
  it('gates the uploads limiter on config.env, not an unconditional mount', () => {
    const mount = uploadsMount();
    // The limiter must be selected by the environment, so it can be absent.
    expect(APP_SOURCE).toMatch(
      /const readLimiter = config\.env !== 'test' && config\.env !== 'development' \? \[defaultLimiter\] : \[\]/
    );
    expect(mount).toContain('...readLimiter');
    // A bare `defaultLimiter,` in the mount is the regression: unconditional.
    expect(mount).not.toMatch(/^\s*defaultLimiter,\s*$/m);
  });

  it('gates the global limiter with the same condition', () => {
    // The two mounts must not disagree: dev/test gets neither, production both.
    expect(APP_SOURCE).toMatch(
      /if \(config\.env !== 'test' && config\.env !== 'development'\) \{\s*app\.use\(defaultLimiter\)/
    );
  });

  it('still authorizes every upload read (the limiter is not the only guard)', () => {
    // Removing the limiter in dev/test must not remove the authorization gate.
    expect(uploadsMount()).toContain('uploadsAuth');
  });
});
