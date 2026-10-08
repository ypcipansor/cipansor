import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

// `environment` is what /health must report; `env` (NODE_ENV) stays
// `production` for every deployed image, so the pair proves the label is read
// from APP_ENVIRONMENT and not from NODE_ENV.
const { envOverride } = vi.hoisted(() => ({
  envOverride: { environment: 'staging', env: 'production' },
}));
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
  return { ...actual, config: { ...actual.config, ...envOverride } };
});

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

  /**
   * nginx exposes this at /healthz, and the ops watch reads `environment` to
   * tell a staging reading from a live one. Every image bakes NODE_ENV
   * `production`, so before 2026-10-08 staging answered `production` here — a
   * health signal that read healthy while mislabelled. The label now comes
   * from APP_ENVIRONMENT (`config.environment`), so this reports `staging`
   * even though `config.env` is `production`.
   */
  it('reports the environment name from APP_ENVIRONMENT, not NODE_ENV', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.environment).toBe('staging');
    expect(envOverride.env).toBe('production');
  });
});
