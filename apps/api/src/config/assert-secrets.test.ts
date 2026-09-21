import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  assertProductionSecrets,
  assertProductionMicrosoftTenant,
  findSecretIssues,
  microsoftMultiTenantAllowed,
  warnOnLooseMicrosoftTenant,
} from './assert-secrets';

/** A key of the shape `openssl rand -hex 48` produces. */
const GOOD = 'a'.repeat(96);

/** The value cipansor.or.id was actually running with. */
const SHIPPED = 'your-super-secret-key-change-this-in-production-min-32-chars';

/**
 * The old SystemSecret subsystem's fallback key: a sequential byte pattern
 * (00 01 02 … 1f) hardcoded in this public repository. 64 hex chars and
 * deliberate-looking, which is why the length and placeholder checks alone
 * would let it through.
 */
const LEAKED_SEQUENTIAL_HEX =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

describe('production secret guard', () => {
  it('refuses the exact value that was live in production', () => {
    expect(() => assertProductionSecrets({ env: 'production', jwtSecret: SHIPPED })).toThrow(
      /JWT_SECRET/
    );
  });

  // It is long enough and looks deliberate, which is why it survived review.
  // Length alone was never the test.
  it('rejects it despite being over the length minimum', () => {
    expect(SHIPPED.length).toBeGreaterThan(32);
    const issues = findSecretIssues({ jwtSecret: SHIPPED });
    expect(issues[0].reason).toMatch(/example value/);
  });

  // Exercised through the environment rather than the argument: passing
  // `jwtSecret: undefined` falls back to process.env by design, so it proves
  // nothing about a genuinely unset key.
  it('refuses a missing key', () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => assertProductionSecrets({ env: 'production' })).toThrow(/is not set/);
    } finally {
      if (saved === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = saved;
    }
  });

  it('refuses a short key', () => {
    expect(() =>
      assertProductionSecrets({ env: 'production', jwtSecret: 'terlalupendek' })
    ).toThrow(/too short/);
  });

  it("refuses config/index.ts's own dev fallback", () => {
    expect(() =>
      assertProductionSecrets({
        env: 'production',
        jwtSecret: 'change-this-secret-in-production',
      })
    ).toThrow(/JWT_SECRET/);
  });

  // Both passed explicitly: leaving one to fall through to process.env makes
  // the test depend on whatever .env happens to hold.
  it('accepts generated keys', () => {
    expect(() =>
      assertProductionSecrets({
        env: 'production',
        jwtSecret: GOOD,
        studentCardHmacSecret: GOOD,
      })
    ).not.toThrow();
  });

  it('rejects the leaked sequential key as a JWT signer', () => {
    expect(LEAKED_SEQUENTIAL_HEX.length).toBeGreaterThanOrEqual(32);
    const issues = findSecretIssues({ jwtSecret: LEAKED_SEQUENTIAL_HEX });
    const jwt = issues.find((i) => i.variable === 'JWT_SECRET');
    expect(jwt?.reason).toMatch(/public/);
  });

  it('rejects the leaked sequential key as the student-card HMAC signer', () => {
    const issues = findSecretIssues({
      jwtSecret: GOOD,
      studentCardHmacSecret: LEAKED_SEQUENTIAL_HEX,
    });
    const card = issues.find((i) => i.variable === 'STUDENT_CARD_HMAC_SECRET');
    expect(card?.reason).toMatch(/public/);
  });

  it('reports every problem at once, not just the first', () => {
    const issues = findSecretIssues({ jwtSecret: 'short' });
    expect(issues.map((i) => i.variable)).toEqual([
      'JWT_SECRET',
      'STUDENT_CARD_HMAC_SECRET',
    ]);
  });

  // The card signer must be its OWN secret, required in production. A missing
  // STUDENT_CARD_HMAC_SECRET is not a soft fallback to the JWT secret — that was
  // the bug: rotating session credentials invalidated every printed card.
  it('refuses production without a dedicated STUDENT_CARD_HMAC_SECRET', () => {
    expect(() =>
      assertProductionSecrets({
        env: 'production',
        jwtSecret: GOOD,
      })
    ).toThrow(/STUDENT_CARD_HMAC_SECRET/);
  });

  it('uses the dev-only card secret outside production, never the JWT secret', async () => {
    const { resolveStudentCardHmacSecret } = await import('./index');
    expect(resolveStudentCardHmacSecret(undefined, 'development')).toBe(
      'dev-student-card-hmac-secret-not-for-production'
    );
  });

  it('throws in production when the card secret is still an example value', () => {
    const issues = findSecretIssues({
      jwtSecret: GOOD,
      studentCardHmacSecret: 'change-me-this-is-an-example-value-for-cards',
    });
    expect(issues.map((i) => i.variable)).toContain('STUDENT_CARD_HMAC_SECRET');
    expect(issues.find((i) => i.variable === 'STUDENT_CARD_HMAC_SECRET')?.reason).toMatch(
      /example value/
    );
  });

  // The gap this closes. #341 added resolveJwtSecret, which refused a secret
  // that was missing, shorter than 32 characters, or *exactly equal* to the
  // code's own DEFAULT_JWT_SECRET. The value production was actually running
  // is 60 characters and is not the code default — it came from .env.example —
  // so it passed all three checks while being published on GitHub.
  it('catches the live value that an exact-match check let through', async () => {
    const { resolveJwtSecret } = await import('./index');

    expect(SHIPPED.length).toBeGreaterThanOrEqual(32);
    expect(SHIPPED).not.toBe('change-this-secret-in-production');

    expect(() => resolveJwtSecret(SHIPPED, 'production')).toThrow(/example value/);
  });

  it('leaves development and test alone', () => {
    for (const env of ['development', 'test', undefined]) {
      expect(() => assertProductionSecrets({ env, jwtSecret: SHIPPED })).not.toThrow();
    }
  });

  it('never puts the secret itself in the message', () => {
    try {
      assertProductionSecrets({ env: 'production', jwtSecret: SHIPPED });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain(SHIPPED);
    }
  });
});

describe('loose Microsoft tenant warning', () => {
  it('warns in production when the tenant is left at common', () => {
    const warning = warnOnLooseMicrosoftTenant('production', 'common');
    expect(warning).toContain('MICROSOFT_TENANT_ID');
    expect(warning).toContain('ANY Entra tenant');
  });

  it('warns when the tenant is unset in production (defaults to common)', () => {
    expect(warnOnLooseMicrosoftTenant('production', undefined)).not.toBeNull();
  });

  it('is case-insensitive about the common default', () => {
    expect(warnOnLooseMicrosoftTenant('production', 'COMMON')).not.toBeNull();
  });

  it('stays quiet once a real tenant GUID or domain is configured', () => {
    expect(
      warnOnLooseMicrosoftTenant('production', '99999999-9999-9999-9999-999999999999')
    ).toBeNull();
    expect(warnOnLooseMicrosoftTenant('production', 'cipansor.or.id')).toBeNull();
  });

  it('stays quiet outside production', () => {
    for (const env of ['development', 'test', undefined]) {
      expect(warnOnLooseMicrosoftTenant(env, 'common')).toBeNull();
    }
  });
});

describe('production Microsoft tenant fail-fast (BUG 10)', () => {
  const clientId = 'microsoft-client-id';

  it('refuses to start in production when Microsoft SSO is configured and the tenant is common', () => {
    expect(() =>
      assertProductionMicrosoftTenant({
        env: 'production',
        clientId,
        tenantId: 'common',
        allowMultiTenant: false,
      })
    ).toThrow(/Refusing to start the API in production/);
  });

  it('refuses when the tenant is unset in production (defaults to common)', () => {
    expect(() =>
      assertProductionMicrosoftTenant({
        env: 'production',
        clientId,
        tenantId: undefined,
        allowMultiTenant: false,
      })
    ).toThrow(/MICROSOFT_TENANT_ID/);
  });

  it('refuses for organizations/consumers too, not only common', () => {
    for (const tenantId of ['organizations', 'consumers', 'COMMON']) {
      expect(() =>
        assertProductionMicrosoftTenant({
          env: 'production',
          clientId,
          tenantId,
          allowMultiTenant: false,
        })
      ).toThrow(/Refusing to start/);
    }
  });

  it('starts when a concrete tenant GUID or domain is configured', () => {
    for (const tenantId of [
      '99999999-9999-9999-9999-999999999999',
      'cipansor.or.id',
    ]) {
      expect(() =>
        assertProductionMicrosoftTenant({
          env: 'production',
          clientId,
          tenantId,
          allowMultiTenant: false,
        })
      ).not.toThrow();
    }
  });

  it('allows the explicit multi-tenant opt-in', () => {
    expect(() =>
      assertProductionMicrosoftTenant({
        env: 'production',
        clientId,
        tenantId: 'common',
        allowMultiTenant: true,
      })
    ).not.toThrow();
  });

  it('leaves development and test alone', () => {
    for (const env of ['development', 'test', undefined]) {
      expect(() =>
        assertProductionMicrosoftTenant({
          env,
          clientId,
          tenantId: 'common',
          allowMultiTenant: false,
        })
      ).not.toThrow();
    }
  });

  it('does not block a deployment that never configured Microsoft SSO', () => {
    // Microsoft login is off; the unused tenant default is not a hole.
    expect(() =>
      assertProductionMicrosoftTenant({
        env: 'production',
        clientId: undefined,
        tenantId: 'common',
        allowMultiTenant: false,
      })
    ).not.toThrow();
  });

  it('names the escape hatch in the failure message', () => {
    try {
      assertProductionMicrosoftTenant({
        env: 'production',
        clientId,
        tenantId: 'common',
        allowMultiTenant: false,
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('MICROSOFT_ALLOW_MULTI_TENANT');
    }
  });

  it('reads the opt-in flag from the environment, case-insensitively', () => {
    const previous = process.env.MICROSOFT_ALLOW_MULTI_TENANT;
    try {
      process.env.MICROSOFT_ALLOW_MULTI_TENANT = 'TRUE';
      expect(microsoftMultiTenantAllowed()).toBe(true);
      expect(() =>
        assertProductionMicrosoftTenant({ env: 'production', clientId, tenantId: 'common' })
      ).not.toThrow();

      process.env.MICROSOFT_ALLOW_MULTI_TENANT = 'no';
      expect(microsoftMultiTenantAllowed()).toBe(false);
      expect(() =>
        assertProductionMicrosoftTenant({ env: 'production', clientId, tenantId: 'common' })
      ).toThrow();
    } finally {
      if (previous === undefined) delete process.env.MICROSOFT_ALLOW_MULTI_TENANT;
      else process.env.MICROSOFT_ALLOW_MULTI_TENANT = previous;
    }
  });
});

/**
 * The opt-in flag has to actually reach the container. Compose enumerates the
 * environment by name — a variable only in `.env` and missing from
 * `docker-compose.yml` is silently dropped, and `MICROSOFT_ALLOW_MULTI_TENANT`
 * would then look ignored: production would keep refusing to boot with
 * `common` even though an operator set the flag. Pin the forwarding, and the
 * safe default for deployments that never set it.
 */
describe('MICROSOFT_ALLOW_MULTI_TENANT reaches the API container (BUG: not forwarded)', () => {
  const compose = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', '..', 'docker-compose.yml'),
    'utf8'
  );

  it('is enumerated in the api service environment', () => {
    expect(compose).toMatch(
      /MICROSOFT_ALLOW_MULTI_TENANT:\s*\$\{MICROSOFT_ALLOW_MULTI_TENANT:-/
    );
  });

  it('defaults to a non-multi-tenant value when unset', () => {
    // The default must not read as "multi-tenant allowed": an unset flag is the
    // fail-closed single-tenant path, so `true` as a default would invert it.
    const match = compose.match(
      /MICROSOFT_ALLOW_MULTI_TENANT:\s*\$\{MICROSOFT_ALLOW_MULTI_TENANT:-([^}]*)\}/
    );
    expect(match, 'MICROSOFT_ALLOW_MULTI_TENANT not found in docker-compose.yml').not.toBeNull();
    expect(match![1].trim().toLowerCase()).not.toBe('true');
  });
});
