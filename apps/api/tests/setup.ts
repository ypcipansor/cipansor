/**
 * Test setup file for Vitest
 * This file runs before all tests
 */

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-min-32-chars';
process.env.JWT_EXPIRES_IN = '1h';
// Unit tests mock Prisma, so a stub URL is fine. The opt-in DB integration
// suite (RUN_DB_TESTS=1) needs a real connection, so leave the environment's
// DATABASE_URL untouched in that mode.
if (!process.env.RUN_DB_TESTS && !process.env.RUN_DEPLOY_TESTS) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/cipansor_test';
}

// Mock console.log in tests to reduce noise
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Global test utilities
export const testHelpers = {
  /**
   * Generate a valid JWT token for testing
   */
  generateTestToken: (payload: Record<string, unknown> = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'SUPER_ADMIN',
        ...payload,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  /**
   * Create mock request object
   */
  createMockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: {
      userId: 'test-user-id',
      email: 'test@example.com',
      role: 'SUPER_ADMIN',
    },
    ...overrides,
  }),

  /**
   * Create mock response object
   */
  createMockResponse: () => {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    return res;
  },

  /**
   * Create mock next function
   */
  createMockNext: () => vi.fn(),
};

// Export for use in tests
export default testHelpers;
