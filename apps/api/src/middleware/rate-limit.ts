/**
 * Rate Limiting Middleware
 * Protects API from abuse and DoS attacks
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '@/config';
import { logger } from '@/lib/logger';

/**
 * Whether rate limiting applies in this environment.
 *
 * Policy: active everywhere except development and test (see app.ts). Kept as a
 * named predicate so the decision is asserted in one place instead of being
 * duplicated by two `if (env !== 'test' && env !== 'development')` branches that
 * can drift apart.
 */
export function rateLimitEnabled(env: string): boolean {
  return env !== 'test' && env !== 'development';
}

/**
 * Default rate limiter for general API endpoints
 */
export const defaultLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.windowMs, // 1 minute default
  max: config.rateLimit.maxRequests, // 100 requests per minute default
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  handler: (req, res, _next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => {
    // Health checks are never limited.
    if (req.path === '/health') return true;
    // `/uploads` is counted by `uploadsServeLimiter` on the uploads route in
    // app.ts, which owns its own budget. This global pass must stand down for
    // the prefix or a read that `express.static` misses would spend an API slot
    // as well — one request, two budgets. `/uploads` itself arrives as
    // `/uploads` here (and `/uploads/<file>` for a file), so both spellings.
    if (req.path === '/uploads' || req.path.startsWith('/uploads/')) return true;
    // Development and test are deliberately unlimited: a dashboard full of
    // student photos is normal there, and a 429 on the 101st image is a false
    // failure that teaches nothing. The exemption lives HERE rather than in the
    // mount condition so every route can be mounted with `defaultLimiter`
    // statically — a conditional spread hid the protection from readers and
    // static analysis alike. Production always limits.
    return config.env === 'test' || config.env === 'development';
  },
});

/**
 * Limiter for SERVING stored uploads (`GET /uploads/...`).
 *
 * Deliberately not `defaultLimiter`. Before #522 a served file never reached a
 * limiter at all (`express.static` answered before the global pass), so a page
 * showing a class roster of photos cost the API budget nothing. Mounting
 * `defaultLimiter` on the route made every photo spend one of the same 100
 * per-minute slots the page's API calls need — a roster of 40 photos plus its
 * queries could 429 the whole screen. Its own store keeps file serving bounded
 * (CodeQL js/missing-rate-limiting) without starving the API, and the ceiling
 * is sized for image-heavy pages, not for JSON calls.
 */
export const UPLOADS_SERVE_MAX_PER_MINUTE = 600;

export const uploadsServeLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: UPLOADS_SERVE_MAX_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many file requests, please try again later.',
    },
  },
  // Development and test are deliberately unlimited, for the same reason as
  // `defaultLimiter`: a dashboard full of student photos is normal there. The
  // exemption lives HERE rather than in a conditional mount so the limiter is
  // always mounted and visible to a reader and to static analysis (CodeQL's
  // js/missing-rate-limiting). Production always limits.
  skip: () => config.env === 'test' || config.env === 'development',
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  // Env-configurable so CI/e2e can raise the ceiling without touching code,
  // but the DEFAULT stays at 5/min — do not relax the production default.
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later.',
    },
  },
  handler: (req, res, _next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Strict rate limiter for password reset
 */
export const passwordResetLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Only 3 password reset requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset attempts, please try again later.',
    },
  },
});

/**
 * Rate limiter for file uploads — the multipart write endpoint only.
 *
 * This limiter existed but was mounted on nothing (flag: "upload limiter
 * appears unused"), while a write endpoint consumed bandwidth and billed Azure
 * storage with no ceiling of its own. It is now applied to `POST /upload`
 * (see `modules/upload/upload.routes.ts`) and NOWHERE ELSE on purpose:
 * `/upload/sas` is a read (mint a short-lived link) and `/upload/discard` is a
 * cleanup, and a gallery that legitimately renders hundreds of images must not
 * hit a *write* cap on either.
 *
 * Development and test are exempt for the same reason as `defaultLimiter`: a
 * dashboard full of uploads is normal there and a 429 on a legitimate write is
 * a false failure. The exemption lives inside `skip`, so the mount stays
 * visible to a reader and to static analysis. Production always limits.
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.upload.windowMs,
  max: config.rateLimit.upload.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many file uploads, please try again later.',
    },
  },
  handler: (req, res, _next, options) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(options.statusCode).json(options.message);
  },
  skip: () => config.env === 'test' || config.env === 'development',
});

/**
 * Very strict limiter for API key generation/sensitive operations
 */
export const sensitiveOperationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests for sensitive operations, please try again later.',
    },
  },
});
