import { describe, it, expect } from 'vitest';
import {
  assertSameSiteDeployment,
  hostnameOf,
  isLoopbackHostname,
  registrableSite,
} from '@/config/same-site';

/**
 * The deployment topology this product supports is same-site: the session
 * cookies are `SameSite=Lax`, so a web app on one registrable site cannot keep
 * a session opened by an API on another. These tests pin the boot guard that
 * turns that misconfiguration into a clear failure instead of a login that
 * silently drops its cookie.
 */

describe('registrableSite', () => {
  it('collapses subdomains to the registrable site', () => {
    expect(registrableSite('portal.cipansor.or.id')).toBe('cipansor.or.id');
    expect(registrableSite('cipansor.or.id')).toBe('cipansor.or.id');
    expect(registrableSite('cipansor.example.com')).toBe('example.com');
    expect(registrableSite('a.b.c.example.com')).toBe('example.com');
  });

  it('handles multi-label country suffixes (co.id, or.id, co.uk)', () => {
    expect(registrableSite('portal.cipansor.co.id')).toBe('cipansor.co.id');
    expect(registrableSite('shop.example.co.uk')).toBe('example.co.uk');
    expect(registrableSite('example.com.au')).toBe('example.com.au');
  });

  it('leaves loopback and single-label hosts as-is', () => {
    expect(registrableSite('localhost')).toBe('localhost');
    expect(registrableSite('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('same-site helpers', () => {
  it('extracts a hostname from an origin or returns null', () => {
    expect(hostnameOf('https://Portal.Cipansor.or.id')).toBe('portal.cipansor.or.id');
    expect(hostnameOf('not a url')).toBeNull();
  });

  it('recognises loopback hosts so a dev entry cannot fail a boot', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.0.0.5')).toBe(true);
    expect(isLoopbackHostname('example.com')).toBe(false);
  });
});

describe('assertSameSiteDeployment', () => {
  it('accepts a same-site multi-host allowlist in production', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        origins: [
          'https://cipansor.or.id',
          'https://www.cipansor.or.id',
          'https://portal.cipansor.or.id',
        ],
      })
    ).not.toThrow();
  });

  it('rejects origins on different registrable sites in production', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        origins: ['https://cipansor.or.id', 'https://cipansor-api.vercel.app'],
      })
    ).toThrow(/different sites/);
  });

  it('ignores loopback entries in a production allowlist', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        origins: ['https://cipansor.or.id', 'http://localhost:3000'],
      })
    ).not.toThrow();
  });

  it('does not enforce the constraint outside production', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'development',
        origins: ['http://localhost:3000', 'https://cipansor-api.vercel.app'],
      })
    ).not.toThrow();
  });

  it('uses NODE_ENV when no env is supplied', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        assertSameSiteDeployment({
          origins: ['https://a.example.com', 'https://b.example.net'],
        })
      ).toThrow(/different sites/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
