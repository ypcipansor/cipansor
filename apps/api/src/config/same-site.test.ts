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

const API = ['https://cipansor.or.id', 'https://portal.cipansor.or.id'];

describe('assertSameSiteDeployment', () => {
  it('accepts a same-site multi-host allowlist in production', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        apiOrigins: API,
        origins: [
          'https://cipansor.or.id',
          'https://www.cipansor.or.id',
          'https://portal.cipansor.or.id',
        ],
      })
    ).not.toThrow();
  });

  it('rejects a SINGLE browser origin that is cross-site from the API', () => {
    // The regression this finding is about: one entry on a different site used
    // to pass because the old check only counted distinct sites in the list.
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        apiOrigins: API,
        origins: ['https://cipansor-app.vercel.app'],
      })
    ).toThrow(/different site from the API/);
  });

  it('rejects origins on several sites, naming the offenders', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        apiOrigins: API,
        origins: ['https://cipansor.or.id', 'https://cipansor-api.vercel.app'],
      })
    ).toThrow(/cipansor-api\.vercel\.app/);
  });

  it('accepts distinct origins that are all same-site with the API', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        apiOrigins: API,
        origins: ['https://api.cipansor.or.id', 'https://admin.cipansor.or.id'],
      })
    ).not.toThrow();
  });

  it('ignores loopback entries in a production allowlist', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        apiOrigins: API,
        origins: ['https://cipansor.or.id', 'http://localhost:3000'],
      })
    ).not.toThrow();
  });

  it('fails closed when browser origins exist but the API site is undeterminable', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        origins: ['https://cipansor.or.id'],
        apiOrigins: ['http://localhost:3000', 'not a url'],
      })
    ).toThrow(/could not be determined/);
  });

  it('fails closed when the API itself spans more than one site', () => {
    expect(() =>
      assertSameSiteDeployment({
        env: 'production',
        origins: ['https://cipansor.or.id'],
        apiOrigins: ['https://cipansor.or.id', 'https://cipansor.example.com'],
      })
    ).toThrow(/more than one registrable site/);
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
          apiOrigins: ['https://a.example.com'],
          origins: ['https://b.example.net'],
        })
      ).toThrow(/different site from the API/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
