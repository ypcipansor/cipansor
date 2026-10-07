import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { app } from './app';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

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

  it('reports the API package version, not an env-dependent fallback', async () => {
    delete process.env.npm_package_version;
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(pkg.version);
  });
});

/**
 * `GET /health/version` is a minimal probe for release tooling: it must answer
 * with the package version and nothing else, so a caller can compare it without
 * parsing the full health payload.
 */
describe('GET /health/version', () => {
  it('returns the API package version', async () => {
    delete process.env.npm_package_version;
    const res = await request(app).get('/health/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: pkg.version });
  });
});
