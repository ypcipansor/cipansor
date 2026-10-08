import { describe, it, expect } from 'vitest';
import { resolveJwtSecret, resolveEnvironmentName } from './index';

const STRONG = 'a-sufficiently-long-random-secret-value-1234';

describe('resolveJwtSecret', () => {
  it('throws in production when JWT_SECRET is missing', () => {
    expect(() => resolveJwtSecret(undefined, 'production')).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is the shipped placeholder', () => {
    expect(() => resolveJwtSecret('change-this-secret-in-production', 'production')).toThrow(
      /JWT_SECRET/
    );
  });

  it('throws in production when JWT_SECRET is shorter than 32 characters', () => {
    expect(() => resolveJwtSecret('short-secret', 'production')).toThrow(/32 characters/);
  });

  it('returns the secret in production when it is strong enough', () => {
    expect(resolveJwtSecret(STRONG, 'production')).toBe(STRONG);
  });

  it('falls back to the dev default outside production', () => {
    expect(resolveJwtSecret(undefined, 'development')).toBe('change-this-secret-in-production');
    expect(resolveJwtSecret(undefined, 'test')).toBe('change-this-secret-in-production');
    expect(resolveJwtSecret(undefined, undefined)).toBe('change-this-secret-in-production');
  });

  it('prefers an explicit secret outside production', () => {
    expect(resolveJwtSecret('my-dev-secret', 'development')).toBe('my-dev-secret');
  });
});

describe('resolveEnvironmentName', () => {
  it('reports `staging` for a staging copy', () => {
    expect(resolveEnvironmentName('staging')).toBe('staging');
    expect(resolveEnvironmentName('  STAGING  ')).toBe('staging');
  });

  it('reports the other known names as themselves', () => {
    expect(resolveEnvironmentName('development')).toBe('development');
    expect(resolveEnvironmentName('test')).toBe('test');
  });

  it('reports `production` when unset or empty — the safe default', () => {
    expect(resolveEnvironmentName(undefined)).toBe('production');
    expect(resolveEnvironmentName('')).toBe('production');
    expect(resolveEnvironmentName('   ')).toBe('production');
  });

  it('never invents a name for an unknown value — a typo degrades to production', () => {
    expect(resolveEnvironmentName('prod')).toBe('production');
    expect(resolveEnvironmentName('stagin')).toBe('production');
    expect(resolveEnvironmentName('anything')).toBe('production');
  });
});
