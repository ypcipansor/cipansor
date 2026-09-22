import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '@/config';
import { defaultLimiter } from '@/middleware/rate-limit';

/**
 * BUG: reads from `/uploads` were rate-limited unconditionally while the global
 * limiter is deliberately OFF in development and test. A dashboard full of
 * student photos therefore 429'd on the 101st image in exactly the environment
 * where nothing else is limited — a false failure that teaches nothing and
 * cannot be reproduced in production.
 *
 * A second bug then landed on top: the limiter was mounted BOTH on the uploads
 * route and globally, and it was the SAME instance. `express.static` answers a
 * served file and *falls through* for a path it does not serve, so a
 * missing-path read hit the uploads mount once and the global mount again — TWO
 * hits in one window. Measured with the wiring as it shipped, a served read
 * returned `ratelimit-remaining: max-1` and a missing read `max-2`, so the
 * effective read quota was half the configured value (and the shared store made
 * express-rate-limit raise its own `ERR_ERL_DOUBLE_COUNT`, seen as a 500). The
 * fix keeps the single visible `defaultLimiter` on the route and makes
 * `defaultLimiter.skip` ignore `/uploads` at the global mount, which is what
 * the runtime test below pins.
 *
 * `config.env` is read at module load for the limiters' `windowMs`/`max`, but
 * each `skip` reads it per request, so a test can flip it to `production` and
 * observe the real limiters. The source assertions protect the mount wiring
 * against an edit that no runtime request would reach in this test env.
 */
const APP_SOURCE = fs.readFileSync(path.join(__dirname, 'app.ts'), 'utf8');
const LIMITER_SOURCE = fs.readFileSync(path.join(__dirname, 'middleware', 'rate-limit.ts'), 'utf8');
const UPLOAD_ROUTES_SOURCE = fs.readFileSync(
  path.join(__dirname, 'modules', 'upload', 'upload.routes.ts'),
  'utf8'
);

/** The `app.use('/uploads', ...)` statement, up to its closing `);`. */
function uploadsMount(): string {
  const start = APP_SOURCE.indexOf("app.use(\n  '/uploads'");
  expect(start, "app.use('/uploads', ...) not found in app.ts").toBeGreaterThan(-1);
  const end = APP_SOURCE.indexOf(');', start);
  return APP_SOURCE.slice(start, end);
}

const originalEnv = config.env;
const mutableConfig = config as { env: string };

afterEach(() => {
  mutableConfig.env = originalEnv;
});

/**
 * Build the uploads + global wiring used by app.ts, over a temp static dir.
 *
 * Mirrors app.ts exactly: the SAME `defaultLimiter` instance mounted on the
 * route AND globally — which is the production shape, and the reason the global
 * mount needs its `/uploads` skip (the same limiter counting one request twice
 * trips express-rate-limit's own `ERR_ERL_DOUBLE_COUNT`, seen as a 500).
 */
function buildRateApp(): {
  app: express.Express;
  dir: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-rl-'));
  fs.writeFileSync(path.join(dir, 'exists.pdf'), 'pdf');
  const app = express();
  // Authorization collapsed to `next` comments elsewhere; it would need a DB.
  app.use('/uploads', defaultLimiter, express.static(dir));
  app.use(defaultLimiter);
  app.get('/other', (_req, res) => res.json({ ok: true }));
  return { app, dir };
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

  it('makes the global limiter skip /uploads so a read is counted exactly once', () => {
    // Both mounts must not count the same request. The route mount owns
    // `/uploads`; the global mount must stand down for it.
    const defaultLimiterBlock = LIMITER_SOURCE.slice(
      LIMITER_SOURCE.indexOf('export const defaultLimiter'),
      LIMITER_SOURCE.indexOf('export const authLimiter')
    );
    expect(defaultLimiterBlock).toMatch(/req\.path === '\/uploads'/);
    expect(defaultLimiterBlock).toMatch(/startsWith\('\/uploads\/'\)/);
  });

  it('gates the global limiter with an unconditional mount too', () => {
    // The two mounts must not disagree: both are statically limited, and the
    // environment policy is entirely inside the limiter.
    expect(APP_SOURCE).toMatch(/\/\/ Rate limiting[\s\S]{0,260}app\.use\(defaultLimiter\);/);
    expect(APP_SOURCE).not.toMatch(
      /if \(config\.env !== 'test'[\s\S]{0,80}app\.use\(defaultLimiter\)/
    );
  });

  it('still authorizes every upload read (the limiter is not the only guard)', () => {
    // Removing the limiter in dev/test must not remove the authorization gate.
    expect(uploadsMount()).toContain('uploadsAuth');
  });
});

/**
 * The regression the source assertions cannot see: how many hits one read
 * consumes. In `test` both limiters skip, so the env is flipped to production
 * for this block and restored afterwards.
 */
describe('/uploads reads are counted exactly once (runtime)', () => {
  it('charges one hit per served read and one per missing read', async () => {
    mutableConfig.env = 'production';
    const { app, dir } = buildRateApp();
    try {
      const served = await request(app).get('/uploads/exists.pdf');
      const missing = await request(app).get('/uploads/does-not-exist.pdf');

      expect(served.status).toBe(200);
      // `express.static` falls through on a miss; the route-level
      // `uploadsAuth`-less wiring lets it reach the global 404 handler.
      expect(missing.status).toBe(404);

      const servedRemaining = Number(served.headers['ratelimit-remaining']);
      const missingRemaining = Number(missing.headers['ratelimit-remaining']);
      // Exactly one hit for the missing read. With the old double mount this
      // difference was 2 (the fall-through hit the global limiter again).
      expect(servedRemaining - missingRemaining).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still limits non-uploads routes through the global limiter', async () => {
    mutableConfig.env = 'production';
    const { app, dir } = buildRateApp();
    try {
      const first = await request(app).get('/other');
      const second = await request(app).get('/other');
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const a = Number(first.headers['ratelimit-remaining']);
      const b = Number(second.headers['ratelimit-remaining']);
      expect(a - b).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('upload write limiter is mounted on exactly the write route', () => {
  it('applies uploadLimiter to POST / and to no other upload route', () => {
    // The limiter existed but was mounted on NOTHING, so a write endpoint had no
    // ceiling. It must guard the multipart POST `/`...
    const writeStart = UPLOAD_ROUTES_SOURCE.indexOf("router.post('/'");
    expect(writeStart).toBeGreaterThan(-1);
    const writeBlock = UPLOAD_ROUTES_SOURCE.slice(writeStart, UPLOAD_ROUTES_SOURCE.indexOf(');', writeStart));
    expect(writeBlock).toContain('uploadLimiter');

    // ...and must NOT throttle the read (SAS mint) or cleanup (discard), which a
    // gallery rendering many images would otherwise exhaust.
    for (const path of ["'/sas'", "'/discard'"]) {
      const start = UPLOAD_ROUTES_SOURCE.indexOf(`router.post(${path}`);
      expect(start, `router.post(${path}) not found`).toBeGreaterThan(-1);
      const block = UPLOAD_ROUTES_SOURCE.slice(start, UPLOAD_ROUTES_SOURCE.indexOf(');', start));
      expect(block).not.toContain('uploadLimiter');
    }
  });

  it('keeps the dev/test exemption inside the upload limiter, not the mount', () => {
    const uploadBlock = LIMITER_SOURCE.slice(LIMITER_SOURCE.indexOf('export const uploadLimiter'));
    expect(uploadBlock).toContain('skip:');
    expect(uploadBlock).toMatch(/config\.env === 'test'/);
  });
});
