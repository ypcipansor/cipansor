import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { app } from './app';

/**
 * The Azure release workflows wait until GET /health reports the commit they
 * released (deploy/azure/wait-for-release.sh). If `commit` stopped reflecting
 * GIT_COMMIT_SHA, every release would time out; if it reported something else,
 * a release could pass while the old code was still answering.
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
  });

  it('reports null when the image was built without one', async () => {
    delete process.env.GIT_COMMIT_SHA;
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.commit).toBeNull();
  });
});
