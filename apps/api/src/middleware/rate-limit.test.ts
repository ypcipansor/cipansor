import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

// These tests measure limiter SLOT ACCOUNTING, not authorization. `uploadsAuth`
// is real and still runs (the point is that it is mounted in every
// environment), but its object-level ownership lookup needs a database. Stub
// only the owner resolution so an authenticated read reaches `express.static`
// and the limiter headers can be read.
vi.mock('@/utils/blob-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/blob-owner')>();
  return {
    ...actual,
    findBlobOwnerByRefs: vi.fn(async () => ({
      container: 'cipansor-documents',
      blobPath: 'x.png',
      ownerId: 'u1',
      ownerKind: 'user',
    })),
  };
});
vi.mock('@/modules/upload/upload.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/upload/upload.service')>();
  return { ...actual, actorMayReadBlob: vi.fn(async () => true) };
});

import {
  rateLimitEnabled,
  defaultLimiter,
  uploadsServeLimiter,
  UPLOADS_SERVE_MAX_PER_MINUTE,
} from './rate-limit';
import { buildUploadsMiddleware, buildGlobalLimiter } from '../app';
import { uploadsAuth } from './upload';
import { generateAccessToken } from '@/lib/jwt';
import { config } from '@/config';

/**
 * The `/uploads` route used to mount `defaultLimiter` in every environment
 * because its two `config.env` branches were byte-for-byte identical, so
 * development and test inherited the production ceiling even though the global
 * policy disables rate limiting there.
 *
 * It was then fixed to mount the limiter only where rate limiting applies, but
 * the same limiter instance was *also* still mounted globally. A `/uploads`
 * request that `express.static` missed fell through to the global pass, so a
 * missing/stale upload consumed two slots instead of one.
 *
 * Even one slot of `defaultLimiter` was too many: before #522 a served file
 * never reached a limiter, so photo-heavy pages cost the API budget nothing.
 * `/uploads` now has its own budget (`uploadsServeLimiter`). These tests pin
 * the predicate, the chain, and — through real requests — the slot accounting
 * of both budgets.
 */
describe('rateLimitEnabled', () => {
  it('is off in test and development', () => {
    expect(rateLimitEnabled('test')).toBe(false);
    expect(rateLimitEnabled('development')).toBe(false);
  });

  it('is on in production and any other environment', () => {
    expect(rateLimitEnabled('production')).toBe(true);
    expect(rateLimitEnabled('staging')).toBe(true);
  });
});

describe('buildUploadsMiddleware', () => {
  it('always mounts its own limiter ahead of auth, in every environment', () => {
    // The limiter is a literal element, not a conditional spread: the dev/test
    // exemption lives inside `uploadsServeLimiter.skip`, so the protection is
    // visible to a reader and to static analysis (CodeQL). Auth is
    // unconditional — stored uploads are private everywhere.
    const chain = buildUploadsMiddleware();
    expect(chain[0]).toBe(uploadsServeLimiter);
    expect(chain[1]).toBe(uploadsAuth);
    expect(chain).not.toContain(defaultLimiter);
  });
});

describe('request-level rate-limit accounting', () => {
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  const max = config.rateLimit.maxRequests;
  const uploadsMax = UPLOADS_SERVE_MAX_PER_MINUTE;

  // The limiters' `skip` reads `config.env` per request, but this suite runs
  // under `test`, where they deliberately stand down. Flip it to `production`
  // for the accounting assertions so the real limiters are exercised, then
  // restore it.
  const originalEnv = config.env;
  const mutableConfig = config as { env: string };
  beforeAll(() => {
    mutableConfig.env = 'production';
  });
  afterAll(() => {
    mutableConfig.env = originalEnv;
  });

  const token = generateAccessToken({
    id: 'u1',
    sub: 'u1',
    email: 'u1@example.com',
    roleId: 'r1',
    roleCode: 'SUPER_ADMIN',
    unitId: null,
    permissions: [],
    role: 'SUPER_ADMIN',
  } as never);

  /**
   * The real middleware order of app.ts, minus the DB-backed routers: the
   * `/uploads` chain, then the global limiter, then a terminal 404.
   *
   * Both mounts read `config.env` per request (the global factory at build
   * time, the limiter `skip`s at request time), so the caller sets
   * `mutableConfig.env` before building.
   */
  function app() {
    const a = express();
    a.set('trust proxy', 1);
    a.use('/uploads', ...buildUploadsMiddleware());
    a.use(buildGlobalLimiter(mutableConfig.env));
    a.use((_req, res) => res.status(404).json({ ok: false }));
    return a;
  }

  /** Run `fn` with `config.env` temporarily set to `env`. */
  async function withEnv(env: string, fn: () => Promise<void>): Promise<void> {
    const previous = mutableConfig.env;
    mutableConfig.env = env;
    try {
      await fn();
    } finally {
      mutableConfig.env = previous;
    }
  }

  // A fresh client IP per request keeps the shared MemoryStore from carrying a
  // count across tests, so `remaining` is read from a clean counter.
  let ipCounter = 0;
  function nextIp(): string {
    ipCounter += 1;
    return `10.9.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  }

  function remainingOf(res: request.Response): number {
    return Number(res.headers['ratelimit-remaining']);
  }

  it('counts a missing /uploads request exactly once', async () => {
    const res = await request(app())
      .get('/uploads/does-not-exist.png')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${token}`);

    // Fall-through to the terminal handler, and a single uploads slot consumed.
    expect(res.status).toBe(404);
    expect(remainingOf(res)).toBe(uploadsMax - 1);
  });

  it('counts a served /uploads request exactly once', async () => {
    const file = path.join(uploadDir, `rate-limit-test-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex'));
    try {
      const res = await request(app())
        .get(`/uploads/${path.basename(file)}`)
        .set('X-Forwarded-For', nextIp())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(remainingOf(res)).toBe(uploadsMax - 1);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('does not spend the API budget on /uploads requests', async () => {
    // Same client: five photo requests (one missing), then an API call. The API
    // call must see a full API budget — photos are counted elsewhere.
    const ip = nextIp();
    const a = app();
    for (let n = 0; n < 5; n++) {
      await request(a)
        .get(`/uploads/missing-${n}.png`)
        .set('X-Forwarded-For', ip)
        .set('Authorization', `Bearer ${token}`);
    }
    const photo = await request(a)
      .get('/uploads/missing-last.png')
      .set('X-Forwarded-For', ip)
      .set('Authorization', `Bearer ${token}`);
    expect(remainingOf(photo)).toBe(uploadsMax - 6);

    const api = await request(a).get('/api/something').set('X-Forwarded-For', ip);
    expect(remainingOf(api)).toBe(max - 1);
  });

  it('counts a non-upload request exactly once', async () => {
    const res = await request(app()).get('/api/something').set('X-Forwarded-For', nextIp());

    expect(res.status).toBe(404);
    expect(remainingOf(res)).toBe(max - 1);
  });

  it('does not exempt a look-alike prefix from the global limiter', async () => {
    // Only `/uploads` and `/uploads/...` are skipped. A route such as
    // `/uploads-archive` must still be rate-limited once by the global pass.
    const res = await request(app()).get('/uploads-archive/x.png').set('X-Forwarded-For', nextIp());

    expect(res.status).toBe(404);
    expect(remainingOf(res)).toBe(max - 1);
  });

  it('does not rate-limit /uploads in development or test', async () => {
    for (const env of ['development', 'test']) {
      await withEnv(env, async () => {
        const res = await request(app())
          .get('/uploads/does-not-exist.png')
          .set('X-Forwarded-For', nextIp())
          .set('Authorization', `Bearer ${token}`);

        // Reaches the terminal handler with no limiter headers at all.
        expect(res.status).toBe(404);
        expect(res.headers['ratelimit-remaining']).toBeUndefined();
      });
    }
  });

  it('does not rate-limit ordinary routes in development or test', async () => {
    await withEnv('test', async () => {
      const res = await request(app()).get('/api/something').set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(404);
      expect(res.headers['ratelimit-remaining']).toBeUndefined();
    });
  });

  it('still requires auth on /uploads in production', async () => {
    const res = await request(app()).get('/uploads/anything.png').set('X-Forwarded-For', nextIp());

    expect(res.status).toBe(401);
    // The route limiter runs before auth, so even the rejected request is one
    // uploads slot — not two.
    expect(remainingOf(res)).toBe(uploadsMax - 1);
  });

  it('still requires auth on /uploads in development and test', async () => {
    for (const env of ['development', 'test']) {
      await withEnv(env, async () => {
        const res = await request(app())
          .get('/uploads/anything.png')
          .set('X-Forwarded-For', nextIp());

        expect(res.status).toBe(401);
      });
    }
  });
});
