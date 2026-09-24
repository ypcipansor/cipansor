import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Wiring guards for the `/uploads` limiter, readable without booting Express.
 *
 * The read route has TWO budgets: `uploadsServeLimiter` owns `/uploads` (sized
 * for image-heavy pages), and `defaultLimiter` owns the rest of the API. Two
 * bugs motivated these guards:
 *
 *  - The limiter was mounted only inside a conditional spread
 *    (`...(rateLimitEnabled(env) ? [uploadsServeLimiter] : [])`), which hides
 *    the protection from a reader and from CodeQL's js/missing-rate-limiting.
 *    The mount is now a literal, and the dev/test exemption lives inside the
 *    limiter's own `skip`.
 *  - The SAME instance was mounted on `/uploads` AND globally, so a read that
 *    `express.static` missed fell through and spent two slots. The global pass
 *    now stands down for `/uploads` (see `buildGlobalLimiter`).
 *
 * The runtime accounting those guards protect is asserted in
 * `middleware/rate-limit.test.ts`; this file pins the shape of the wiring.
 */
const APP_SOURCE = fs.readFileSync(path.join(__dirname, 'app.ts'), 'utf8');
const LIMITER_SOURCE = fs.readFileSync(path.join(__dirname, 'middleware', 'rate-limit.ts'), 'utf8');
const UPLOAD_ROUTES_SOURCE = fs.readFileSync(
  path.join(__dirname, 'modules', 'upload', 'upload.routes.ts'),
  'utf8'
);

/** The `buildUploadsMiddleware` factory body, up to its closing `}`. */
function uploadsMiddlewareFactory(): string {
  const start = APP_SOURCE.indexOf('export function buildUploadsMiddleware');
  expect(start, 'buildUploadsMiddleware not found in app.ts').toBeGreaterThan(-1);
  const end = APP_SOURCE.indexOf('\n}', start);
  return APP_SOURCE.slice(start, end);
}

/** The `defaultLimiter` definition block, up to `authLimiter`. */
function defaultLimiterBlock(): string {
  return LIMITER_SOURCE.slice(
    LIMITER_SOURCE.indexOf('export const defaultLimiter'),
    LIMITER_SOURCE.indexOf('export const authLimiter')
  );
}

describe('/uploads read limiter wiring', () => {
  it('mounts the uploads limiter literally, not behind a conditional spread', () => {
    const factory = uploadsMiddlewareFactory();
    // A direct array element is visible to a reader and to static analysis.
    expect(factory).toMatch(/return \[\s*uploadsServeLimiter,/);
    // The old conditional spread must not come back.
    expect(factory).not.toMatch(/\.\.\.\(rateLimitEnabled/);
    expect(APP_SOURCE).not.toMatch(/const readLimiter/);
  });

  it('mounts the chain on /uploads', () => {
    expect(APP_SOURCE).toMatch(/app\.use\('\/uploads', \.\.\.buildUploadsMiddleware\(\)\)/);
  });

  it('gates the global limiter with an unconditional mount too', () => {
    // Both mounts must be statically visible and agree: the environment policy
    // lives entirely inside the limiters' own `skip`, never behind a mount-time
    // `if (config.env !== 'test')` that a reader or CodeQL cannot see through.
    expect(APP_SOURCE).toMatch(/app\.use\(buildGlobalLimiter\(config\.env\)\)/);
    expect(APP_SOURCE).not.toMatch(
      /if \(config\.env !== 'test'[\s\S]{0,80}app\.use\(defaultLimiter\)/
    );
  });

  it('puts the dev/test exemption inside the uploads limiter, not the mount', () => {
    const block = LIMITER_SOURCE.slice(
      LIMITER_SOURCE.indexOf('export const uploadsServeLimiter'),
      LIMITER_SOURCE.indexOf('export const authLimiter')
    );
    expect(block).toContain('skip:');
    expect(block).toMatch(/config\.env === 'test'/);
    expect(block).toMatch(/config\.env === 'development'/);
  });

  it('makes the global limiter skip /uploads so a read is counted exactly once', () => {
    // Both mounts must not count the same request. The route mount owns
    // `/uploads`; the global mount must stand down for it.
    expect(defaultLimiterBlock()).toMatch(/req\.path === '\/uploads'/);
    expect(defaultLimiterBlock()).toMatch(/startsWith\('\/uploads\/'\)/);
  });

  it('puts the default limiter dev/test exemption inside its own skip', () => {
    const block = defaultLimiterBlock();
    expect(block).toContain('skip:');
    expect(block).toMatch(/config\.env === 'test' \|\| config\.env === 'development'/);
  });

  it('still authorizes every upload read (the limiter is not the only guard)', () => {
    // Removing the limiter in dev/test must not remove the authorization gate.
    expect(uploadsMiddlewareFactory()).toContain('uploadsAuth');
  });
});

describe('upload write limiter is mounted on exactly the write route', () => {
  // Locate `router.post(<path>` without pinning the exact source text: prettier
  // may wrap the path onto its own line, and this guard is about which route the
  // limiter is mounted on, not how the call is formatted. Plain substring search
  // (no RegExp built from input) keeps the route path out of regex escaping.
  const routeStart = (route: string): number => {
    const marker = `router.post('${route}'`;
    const at = UPLOAD_ROUTES_SOURCE.indexOf(marker);
    if (at !== -1) return at;
    // Reflowed form: `router.post(\n  '<route>',`
    return UPLOAD_ROUTES_SOURCE.indexOf(`'${route}',`);
  };

  it('applies uploadLimiter to POST / and to no other upload route', () => {
    // The limiter existed but was mounted on NOTHING, so a write endpoint had no
    // ceiling. It must guard the multipart POST `/`...
    const writeStart = routeStart('/');
    expect(writeStart).toBeGreaterThan(-1);
    const writeBlock = UPLOAD_ROUTES_SOURCE.slice(
      writeStart,
      UPLOAD_ROUTES_SOURCE.indexOf(');', writeStart)
    );
    expect(writeBlock).toContain('uploadLimiter');

    // ...and must NOT throttle the read (SAS mint) or cleanup (discard), which a
    // gallery rendering many images would otherwise exhaust.
    for (const route of ['/sas', '/discard']) {
      const start = routeStart(route);
      expect(start, `router.post('${route}') not found`).toBeGreaterThan(-1);
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
