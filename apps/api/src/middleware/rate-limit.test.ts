import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { rateLimitEnabled, defaultLimiter } from './rate-limit';
import { buildUploadsMiddleware } from '../app';
import { uploadsAuth } from './upload';

/**
 * The `/uploads` route used to mount `defaultLimiter` in every environment
 * because its two `config.env` branches were byte-for-byte identical, so
 * development and test inherited the production ceiling even though the global
 * policy disables rate limiting there. These tests pin the single predicate the
 * route and the global limiter now share, and the chain actually built from it.
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
  it('omits the production limiter in development and test, keeping auth', () => {
    for (const env of ['development', 'test']) {
      const chain = buildUploadsMiddleware(env);
      expect(chain).not.toContain(defaultLimiter);
      expect(chain).toContain(uploadsAuth); // private in every environment
    }
  });

  it('runs the limiter first, then auth, in production', () => {
    const chain = buildUploadsMiddleware('production');
    expect(chain[0]).toBe(defaultLimiter);
    expect(chain[1]).toBe(uploadsAuth);
  });
});
