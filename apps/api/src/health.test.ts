import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { app } from './app';

/**
 * The Azure release workflows wait until GET /health reports the commit they
 * released (deploy/azure/wait-for-release.sh). If `commit` stopped reflecting
 * GIT_COMMIT_SHA, every release would time out; if it reported something else,
 * a release could pass while the old code was still answering.
 *
 * /health is also the readiness signal (#665): it must probe the database and
 * answer 503 when Postgres is unreachable. The regression assertion is
 * `$queryRaw` having been called — on the old static handler it was never
 * touched, so this file failed before the fix.
 */
describe('GET /health', () => {
  const original = process.env.GIT_COMMIT_SHA;
  afterEach(() => {
    if (original === undefined) delete process.env.GIT_COMMIT_SHA;
    else process.env.GIT_COMMIT_SHA = original;
  });

  it('reports the commit the image was built from', async () => {
    process.env.GIT_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.commit).toBe('0123456789abcdef0123456789abcdef01234567');
    // The readiness signal: the database was actually probed.
    expect(queryRaw).toHaveBeenCalled();
  });

  it('reports null when the image was built without one', async () => {
    delete process.env.GIT_COMMIT_SHA;
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.commit).toBeNull();
  });

  // The bug in #665: the body was static, so a DB-less instance answered 200
  // and a load balancer or the release workflow kept routing traffic to it.
  it('answers 503 (not-ready) when the database is unreachable', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
  });
});
