import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Reproducer for https://github.com/ypcipansor/cipansor/issues/665
//
// The report: `GET /health` answers 200 even while the Prisma connection is
// down, so a load balancer or the Azure release workflow keeps sending traffic
// to an instance that cannot serve a single query.
//
// `GET /health` (apps/api/src/app.ts) is a pure liveness check — it returns a
// static `{ status: 'ok' }` and never touches the database. Nothing in the
// app probes Prisma, so there is no readiness signal at all. This test drives
// the real app with a Prisma client whose every query rejects, the way the
// connection behaves while Postgres is down, and asserts the readiness
// contract the report asks for: 503, not 200.
//
// It FAILS on current main (the observed bug) and is the target a fix must
// turn green.

const dbDown = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

// A Prisma client whose queries never resolve — `$queryRaw`/`$connect` reject,
// and every model method (`findMany`, `count`, …) rejects too. This is what
// `@/lib/prisma`'s client exposes to the app while the database is unreachable.
vi.mock('@/lib/prisma', () => {
  const fail = () => dbDown();
  const model = new Proxy({}, { get: () => vi.fn(fail) });
  const prisma = new Proxy(
    {
      $queryRaw: vi.fn(fail),
      $queryRawUnsafe: vi.fn(fail),
      $connect: vi.fn(fail),
    },
    {
      get: (target: Record<string, unknown>, key: string) => (key in target ? target[key] : model),
    }
  );
  return { prisma };
});
vi.mock('@/lib/redis', () => ({ redis: { ping: vi.fn(async () => 'PONG') } }));

import { app } from './app';

describe('GET /health with the Prisma connection down (issue #665)', () => {
  it('reports not-ready (503) instead of a healthy 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});
