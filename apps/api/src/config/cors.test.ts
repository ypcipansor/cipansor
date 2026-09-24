import { describe, it, expect, vi } from 'vitest';
import cors from 'cors';
import { parseCorsOrigins, buildCorsOptions } from './cors';

/**
 * These tests are about the header that actually reaches the browser, not about
 * the parser in isolation — the bug being fixed was that a perfectly reasonable
 * looking `CORS_ORIGIN` produced a header no browser accepts. So most of what
 * follows drives the real `cors` middleware and inspects what it wrote.
 */

/** The value production has been running. */
const PRODUCTION_LIST = 'https://cipansor.or.id,https://www.cipansor.or.id,http://localhost:3000';

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string | number | string[]>;
  ended: boolean;
  setHeader(name: string, value: string | number | string[]): void;
  getHeader(name: string): string | number | string[] | undefined;
  end(): void;
}

function fakeRes(): FakeResponse {
  const headers: Record<string, string | number | string[]> = {};
  return {
    statusCode: 200,
    headers,
    ended: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    end() {
      this.ended = true;
    },
  };
}

/** Run the real middleware for one request and return what it wrote. */
function request(
  origins: readonly string[],
  { origin, method = 'GET' }: { origin?: string; method?: string }
) {
  const middleware = cors(buildCorsOptions(origins));
  const req = {
    method,
    headers: origin ? { origin } : {},
  };
  const res = fakeRes();
  const next = vi.fn();
  middleware(req as never, res as never, next);
  return { res, next, allowOrigin: res.headers['access-control-allow-origin'] };
}

describe('parseCorsOrigins', () => {
  it('splits the comma-separated list operators actually write', () => {
    expect(parseCorsOrigins(PRODUCTION_LIST)).toEqual([
      'https://cipansor.or.id',
      'https://www.cipansor.or.id',
      'http://localhost:3000',
    ]);
  });

  it('tolerates spaces, empty entries and duplicates', () => {
    expect(parseCorsOrigins(' https://a.test , ,https://b.test, https://a.test ')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('strips a trailing slash, which an Origin header never carries', () => {
    expect(parseCorsOrigins('https://cipansor.or.id/')).toEqual(['https://cipansor.or.id']);
  });

  it('returns an empty list for an unset or blank value', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });
});

describe('buildCorsOptions', () => {
  it('refuses a wildcard, which cannot be combined with credentials', () => {
    expect(() => buildCorsOptions(['*'])).toThrow(/cannot be "\*"/);
    expect(() => buildCorsOptions(['https://a.test', '*'])).toThrow(/cannot be "\*"/);
  });

  it('refuses an empty allowlist rather than denying every request silently', () => {
    expect(() => buildCorsOptions([])).toThrow(/empty allowlist/);
  });
});

describe('the header sent to the browser', () => {
  const allowlist = parseCorsOrigins(PRODUCTION_LIST);

  it('reflects exactly one origin — never the whole list', () => {
    const { allowOrigin } = request(allowlist, { origin: 'https://cipansor.or.id' });
    expect(allowOrigin).toBe('https://cipansor.or.id');
    // The regression itself: three origins in one header, which the Fetch
    // standard forbids and every browser rejects.
    expect(String(allowOrigin)).not.toContain(',');
  });

  it('reflects whichever listed origin asked, not just the first', () => {
    expect(request(allowlist, { origin: 'https://www.cipansor.or.id' }).allowOrigin).toBe(
      'https://www.cipansor.or.id'
    );
    expect(request(allowlist, { origin: 'http://localhost:3000' }).allowOrigin).toBe(
      'http://localhost:3000'
    );
  });

  it('marks the response as varying by Origin so caches cannot cross-serve it', () => {
    const { res } = request(allowlist, { origin: 'https://cipansor.or.id' });
    expect(String(res.headers['vary'])).toContain('Origin');
  });

  it('grants credentials to a listed origin', () => {
    const { res } = request(allowlist, { origin: 'https://cipansor.or.id' });
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('grants nothing to an origin that is not listed', () => {
    const { res, next } = request(allowlist, { origin: 'https://evil.test' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    // The request still reaches the app; it is the browser that withholds the
    // response from the page. Failing here would break non-browser callers.
    expect(next).toHaveBeenCalled();
  });

  it('leaves same-origin and server-to-server calls (no Origin header) alone', () => {
    const { res, next } = request(allowlist, {});
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('answers a preflight from a listed origin with a single origin', () => {
    const { res } = request(allowlist, {
      origin: 'https://www.cipansor.or.id',
      method: 'OPTIONS',
    });
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBe('https://www.cipansor.or.id');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('matches an origin even when the operator wrote a trailing slash', () => {
    const forgiving = parseCorsOrigins('https://cipansor.or.id/');
    expect(request(forgiving, { origin: 'https://cipansor.or.id' }).allowOrigin).toBe(
      'https://cipansor.or.id'
    );
  });

  it('does not treat a listed origin as a prefix of a lookalike domain', () => {
    const { res } = request(allowlist, { origin: 'https://cipansor.or.id.evil.test' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
