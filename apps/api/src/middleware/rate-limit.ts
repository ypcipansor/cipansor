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
