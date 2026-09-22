import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Behavioral companion to the source-based guard in
 * `src/app.uploads-limiter.test.ts`: the guard proves the MOUNT is visible and
 * unconditional; this proves the limiter actually blocks in production and
 * actually stays out of the way in development, so the exemption cannot be
 * silently inverted.
 *
 * `config.env` is captured at module load, so each case resets the module
 * registry and stubs `process.env.NODE_ENV` before importing the limiter.
 */
async function loadLimiter(env: string, name: 'defaultLimiter' | 'uploadLimiter' = 'defaultLimiter') {
  vi.resetModules();
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  try {
    const mod = await import('@/middleware/rate-limit');
    return mod[name];
  } finally {
    process.env.NODE_ENV = saved;
  }
}

/** Minimal express-ish req/res/next triple for one limiter pass. */
function makeReq(path = '/api/students') {
  const headers: Record<string, string> = {};
  return {
    ip: '127.0.0.1',
    path,
    method: 'GET',
    headers,
    get: (h: string) => headers[h.toLowerCase()],
    set: (h: string, v: string) => {
      headers[h.toLowerCase()] = v;
    },
    header: (h: string, v: string) => {
      headers[h.toLowerCase()] = v;
    },
    app: { get: () => undefined },
  } as any;
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: (k: string, v: string) => {
      res.headers[k] = v;
    },
    getHeader: (k: string) => res.headers[k],
    removeHeader: (k: string) => {
      delete res.headers[k];
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    send() {
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

/**
 * Run `n` requests through the limiter; returns the count that were blocked.
 * express-rate-limit invokes `next`/the handler asynchronously, so each pass is
 * awaited before the result is read.
 */
async function run(limiter: any, n: number, path = '/api/students') {
  let blocked = 0;
  for (let i = 0; i < n; i++) {
    const req = makeReq(path);
    const res = makeRes();
    let nexted = false;
    limiter(req, res, () => {
      nexted = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    if (!nexted) blocked++;
  }
  return blocked;
}

describe('defaultLimiter environment policy (behavioral)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('blocks past the configured max in production', async () => {
    const limiter = await loadLimiter('production');
    // Config default is 100/min; 130 requests must leave some blocked.
    const blocked = await run(limiter, 130);
    expect(blocked).toBeGreaterThan(0);
  });

  it('never blocks in development', async () => {
    const limiter = await loadLimiter('development');
    expect(await run(limiter, 500)).toBe(0);
  });

  it('never blocks in test', async () => {
    const limiter = await loadLimiter('test');
    expect(await run(limiter, 500)).toBe(0);
  });

  it('never limits /health, even in production', async () => {
    const limiter = await loadLimiter('production');
    expect(await run(limiter, 500, '/health')).toBe(0);
  });

  it('skips /uploads in production so the route mount owns the single count', async () => {
    // The global limiter must stand down for `/uploads/*`: the uploads mount
    // already counted the request, and counting it here again is the bug (a
    // missing-path read would spend two hits). `req.path` is whole here.
    const limiter = await loadLimiter('production');
    expect(await run(limiter, 500, '/uploads/a.png')).toBe(0);
    expect(await run(limiter, 500, '/uploads')).toBe(0);
  });
});

describe('uploadLimiter environment policy (behavioral)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('blocks past the configured max in production', async () => {
    // The write endpoint had no ceiling at all (the limiter was mounted on
    // nothing). Config default is 10/min, so 20 uploads must leave some blocked.
    const limiter = await loadLimiter('production', 'uploadLimiter');
    const blocked = await run(limiter, 20, '/');
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThanOrEqual(10);
  });

  it('never blocks in development or test', async () => {
    const dev = await loadLimiter('development', 'uploadLimiter');
    expect(await run(dev, 50, '/')).toBe(0);
    const test = await loadLimiter('test', 'uploadLimiter');
    expect(await run(test, 50, '/')).toBe(0);
  });
});
