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
    // Skip rate limiting for health checks
    return req.path === '/health';
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
 * Rate limiter for file uploads
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many file uploads, please try again later.',
    },
  },
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

/**
 * Limiter passphrase tanda tangan elektronik — dipakai BERSAMA oleh modul
 * esign (suntingan surat/kunci) dan foundation-decisions (suara anggota).
 *
 * Keduanya menjalankan operasi yang sama mahalnya: membuka kunci privat
 * tersegel dengan scrypt. Sebelum ini hanya esign yang membatasinya, sehingga
 * rute suara menjadi jalur termurah untuk menebak passphrase dan menghabiskan
 * CPU lintas akun/sesi — lockout per kunci hanya membatasi satu kunci, bukan
 * percobaan paralel dari banyak akun. Satu definisi di sini membuat kedua
 * konsumen tidak dapat menyimpang, dan ceiling-nya tetap dapat dinaikkan
 * lewat env saat CI/e2e (default produksi tetap ketat).
 */
export const passphraseLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ESIGN_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Terlalu banyak percobaan tanda tangan elektronik. Coba lagi beberapa saat lagi.',
    },
  },
});

/**
 * Limiter publik verifikasi dokumen — dipakai bersama esign dan
 * foundation-decisions. Keduanya melayani pemindaian/unggahan anonim yang
 * menempuh operasi mahal (lookup baris, baca arsip PDF, hashing, verifikasi
 * tanda tangan e-seal), jadi keduanya perlu pembatas yang sama persis.
 */
export const publicVerifyLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_VERIFY_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Terlalu banyak permintaan verifikasi dokumen. Coba lagi beberapa saat lagi.',
    },
  },
});
