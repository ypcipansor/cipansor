/**
 * Rate Limiting Middleware
 * Protects API from abuse and DoS attacks
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '@/config';
import { logger } from '@/lib/logger';

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
    // `/uploads` is counted once by the mount of this same limiter on the
    // uploads route in app.ts. `express.static` answers a served file and
    // falls through for a missing one, and this global mount runs after it, so
    // without this skip a missing-path read was counted twice — halving the
    // effective read quota in production. Express strips the mount prefix from
    // `req.path` INSIDE the mount (so the route mount sees `/a.png` and is not
    // skipped) and leaves it whole OUTSIDE (so the global mount sees
    // `/uploads/a.png` and stands down). `/uploads` itself arrives as `/`
    // inside the mount and `/uploads` here, hence both spellings.
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
