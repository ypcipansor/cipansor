import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authService,
  resolveTenantGuidFromDomain,
  __resetMicrosoftTenantGuidCache,
  TENANT_FAILURE_TTL_MS,
} from '../auth.service';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const { mockGetSigningKey, mockJwksClient } = vi.hoisted(() => {
  const mockGetSigningKey = vi.fn().mockResolvedValue({
    getPublicKey: () => 'mock-public-key',
  });
  const mockJwksClient = vi.fn().mockImplementation(function (this: any) {
    this.getSigningKey = mockGetSigningKey;
    return this;
  });
  return { mockGetSigningKey, mockJwksClient };
});

vi.mock('jwks-rsa', () => {
  return {
    JwksClient: mockJwksClient,
  };
});

// The contract test below drives the real `login()` too, so the password
// comparison is stubbed to a constant truth instead of running bcrypt against a
// fixture hash. `ssoLogin` never touches this module.
vi.mock('@/lib/password', () => ({
  comparePassword: vi.fn(async () => true),
  hashPassword: vi.fn(async () => 'hashed'),
}));

describe('SSO Authentication Security Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    // Identity linking runs on every successful SSO login. Default it to
    // "no existing link, create succeeds" so tests that are about verification
    // do not each have to stub it; the linking-specific tests override.
    vi.spyOn(prisma.identityProvider, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.identityProvider, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.identityProvider, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    // Link repair reads the link owner's soft-delete state through
    // `user.findUnique`; default to a live owner so verification-only tests
    // don't reach a real database.
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ deletedAt: null } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should reject ssoLogin when idToken is missing', async () => {
    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: '',
      })
    ).rejects.toThrow();
  });

  it('should reject Google SSO when GOOGLE_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'some_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should reject Google SSO when token audience (aud) mismatches', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'wrong-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'token_with_wrong_aud',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should reject Google SSO when token is expired', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) - 100, // Expired
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'expired_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should reject Google SSO when email is not verified', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: false,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'unverified_email_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should reject Google SSO when the issuer is not Google', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      iss: 'https://accounts.evil.example',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'wrong_issuer_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  // The issuer is REQUIRED (CRITICAL: an issuer-less token was accepted). Each
  // of these would have signed in before the fix; the signature check alone
  // decided trust whenever `iss` was absent or non-string.
  it('rejects a Google token whose issuer (iss) is missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'google', idToken: 'issuer_less_google_token' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('rejects a Google token whose issuer (iss) is not a string', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      iss: ['https://accounts.google.com'] as any,
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'google', idToken: 'non_string_issuer_token' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('accepts a Google token carrying the official issuer', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    const mockUser = {
      id: 'usr_google_ok',
      email: 'user@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-1',
      aud: 'expected-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'google',
      idToken: 'valid_google_token',
    });

    expect(result).toHaveProperty('accessToken');
  });

  it('rejects a Microsoft token whose issuer (iss) is missing', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-issuerless',
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'issuer_less_ms_token' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('rejects a Microsoft token whose issuer (iss) is not an Entra issuer', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      // A look-alike host that merely *ends with* the real one must not pass.
      iss: 'https://login.microsoftonline.com.attacker.example/11111111-1111-1111-1111-111111111111/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-bad-issuer',
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'bad_issuer_ms_token' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('rejects a Microsoft token whose issuer (iss) is not a string', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: { toString: () => 'https://login.microsoftonline.com/x/' } as any,
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-nonstring',
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'non_string_ms_issuer' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('accepts a Microsoft v1.0 (sts.windows.net) token with a valid tenant issuer', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    process.env.MICROSOFT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

    const mockUser = {
      id: 'usr_ms_v1',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tid: '11111111-1111-1111-1111-111111111111',
      iss: 'https://sts.windows.net/11111111-1111-1111-1111-111111111111/',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-v1',
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'ms_v1_token',
    });

    expect(result).toHaveProperty('accessToken');
  });

  it('should reject Google SSO when the token has no subject (sub)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'user@cipansor.or.id',
      email_verified: true,
      aud: 'expected-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'no_subject_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should reject Google SSO when user is not found in database', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'google_key_1' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      email: 'unregistered@cipansor.or.id',
      email_verified: true,
      sub: 'google-sub-unregistered',
      aud: 'expected-google-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'valid_token_unregistered_user',
      })
    ).rejects.toThrow('belum terdaftar di Sistem Cipansor');
  });

  it('should reject Microsoft SSO when MICROSOFT_CLIENT_ID is not configured', async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    await expect(
      authService.ssoLogin({
        provider: 'microsoft',
        idToken: 'some_ms_token',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should verify Microsoft token signature and claims successfully', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    const mockUser = {
      id: 'usr_ms_123',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: {
            code: 'SDIT_GURU',
            permissions: ['STUDENT_READ'],
          },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: { aud: 'expected-ms-client-id' },
    } as any);

    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'https://login.microsoftonline.com/55555555-5555-5555-5555-555555555555/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-1',
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'valid_ms_id_token',
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect((result as any).user.email).toBe('guru@cipansor.or.id');
  });

  it('should reject Microsoft token from a different tenant when MICROSOFT_TENANT_ID is set', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    process.env.MICROSOFT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      // A token minted for a different tenant: same email domain, foreign tid.
      tid: '99999999-9999-9999-9999-999999999999',
      iss: 'https://login.microsoftonline.com/99999999-9999-9999-9999-999999999999/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-1',
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'microsoft',
        idToken: 'ms_token_wrong_tenant',
      })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('should accept Microsoft token whose tenant matches MICROSOFT_TENANT_ID', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    process.env.MICROSOFT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

    const mockUser = {
      id: 'usr_ms_tenant',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tid: '11111111-1111-1111-1111-111111111111',
      iss: 'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-1',
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'ms_token_correct_tenant',
    });

    expect(result).toHaveProperty('accessToken');
  });

  it('resolves a domain-valued MICROSOFT_TENANT_ID to the directory GUID and accepts a matching token (BUG 7)', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    // A domain-valued tenant: Entra always reports the directory GUID in `tid`
    // and the issuer, so the domain must first be resolved through OIDC
    // discovery. A token carrying that GUID is from the yayasan's directory.
    process.env.MICROSOFT_TENANT_ID = 'tenant-resolvable.example';
    const RESOLVED_GUID = '33333333-3333-3333-3333-333333333333';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        issuer: `https://login.microsoftonline.com/${RESOLVED_GUID}/v2.0`,
      }),
    } as any);

    const mockUser = {
      id: 'usr_ms_domain',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tid: RESOLVED_GUID,
      iss: `https://login.microsoftonline.com/${RESOLVED_GUID}/v2.0`,
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-domain',
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'ms_token_domain_tenant',
    });

    expect(result).toHaveProperty('accessToken');
  });

  it('rejects a foreign-directory token whose email domain matches the configured tenant (domain is not tenant evidence)', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    // The severe bug: with a domain-valued tenant, a token whose mailbox
    // happened to sit on the configured domain was accepted even though its
    // `tid`/issuer named a different directory. The verified e-mail domain must
    // NOT stand in for the directory — resolve the domain, then compare GUIDs.
    process.env.MICROSOFT_TENANT_ID = 'tenant-foreign-target.example';
    const RESOLVED_GUID = '33333333-3333-3333-3333-333333333333';
    const FOREIGN_GUID = '99999999-9999-9999-9999-999999999999';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        issuer: `https://login.microsoftonline.com/${RESOLVED_GUID}/v2.0`,
      }),
    } as any);

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      // A foreign directory, but the mailbox is on the configured domain.
      tid: FOREIGN_GUID,
      iss: `https://login.microsoftonline.com/${FOREIGN_GUID}/v2.0`,
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-foreign',
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'ms_token_foreign_directory' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('fails closed when a domain-valued tenant cannot be resolved to a directory GUID', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    process.env.MICROSOFT_TENANT_ID = 'tenant-unresolvable.example';

    // Discovery is unreachable — resolution cannot prove the tenant, so no
    // token may be accepted (a failed lookup is not permission to trust the
    // e-mail domain).
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tid: '33333333-3333-3333-3333-333333333333',
      iss: 'https://login.microsoftonline.com/33333333-3333-3333-3333-333333333333/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-unresolvable',
    } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'ms_token_unresolvable' })
    ).rejects.toThrow('Verifikasi token SSO gagal');
  });

  it('caches the JWKS client per tenant so signing keys are not refetched on every login', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    // A tenant id not used by any earlier test, so the cache starts empty for it.
    process.env.MICROSOFT_TENANT_ID = '22222222-2222-2222-2222-222222222222';

    const mockUser = {
      id: 'usr_ms_cache',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    const constructorsBefore = mockJwksClient.mock.calls.length;

    const decodeSpy = vi.spyOn(jwt, 'decode');
    const verifySpy = vi.spyOn(jwt, 'verify');
    decodeSpy
      .mockReturnValueOnce({ header: { kid: 'key_a' }, payload: {} } as any)
      .mockReturnValueOnce({ header: { kid: 'key_b' }, payload: {} } as any);
    verifySpy
      .mockReturnValueOnce({
        aud: 'expected-ms-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tid: '22222222-2222-2222-2222-222222222222',
        iss: 'https://login.microsoftonline.com/22222222-2222-2222-2222-222222222222/v2.0',
        preferred_username: 'guru@cipansor.or.id',
        oid: 'ms-oid-1',
      } as any)
      .mockReturnValueOnce({
        aud: 'expected-ms-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tid: '22222222-2222-2222-2222-222222222222',
        iss: 'https://login.microsoftonline.com/22222222-2222-2222-2222-222222222222/v2.0',
        preferred_username: 'guru@cipansor.or.id',
        oid: 'ms-oid-1',
      } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    await authService.ssoLogin({ provider: 'microsoft', idToken: 'token_a' });

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    await authService.ssoLogin({ provider: 'microsoft', idToken: 'token_b' });

    // Two logins for the same tenant must reuse the module-level JwksClient.
    expect(mockJwksClient.mock.calls.length - constructorsBefore).toBe(1);
  });

  it('should expose microsoftTenantId (MICROSOFT_TENANT_ID) from getSSOConfig', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g';
    process.env.MICROSOFT_CLIENT_ID = 'm';
    process.env.MICROSOFT_TENANT_ID = '99999999-9999-9999-9999-999999999999';

    const cfg = authService.getSSOConfig();
    expect(cfg.microsoftTenantId).toBe('99999999-9999-9999-9999-999999999999');
  });

  it('should default microsoftTenantId to common when MICROSOFT_TENANT_ID is unset', async () => {
    delete process.env.MICROSOFT_TENANT_ID;
    process.env.MICROSOFT_CLIENT_ID = 'm';

    const cfg = authService.getSSOConfig();
    expect(cfg.microsoftTenantId).toBe('common');
  });

  it('should match a registered user even when the SSO email casing differs', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    const mockUser = {
      id: 'usr_case_1',
      email: 'guru@cipansor.or.id',
      isActive: true,
      unitId: 'unit_1',
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role_1',
          unitId: 'unit_1',
          role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
        },
      ],
    };

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: { aud: 'expected-ms-client-id' },
    } as any);

    // Provider issues the mailbox with different casing; the account is stored lowercase.
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'https://login.microsoftonline.com/55555555-5555-5555-5555-555555555555/v2.0',
      preferred_username: 'GURU@cipansor.or.id',
      oid: 'ms-oid-1',
    } as any);

    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'mixed_case_email_token',
    });

    expect(result).toHaveProperty('accessToken');
    // The lookup must have normalised the provider email to lowercase.
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'guru@cipansor.or.id' }),
      })
    );
  });

  // ==========================================
  // IdentityProvider linking (TASK 4)
  // ==========================================

  function stubMicrosoftSuccessClaims() {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'https://login.microsoftonline.com/55555555-5555-5555-5555-555555555555/v2.0',
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-link',
    } as any);
  }

  const linkedUser = {
    id: 'usr_link_1',
    email: 'guru@cipansor.or.id',
    isActive: true,
    unitId: 'unit_1',
    userRoles: [
      {
        isPrimary: true,
        roleId: 'role_1',
        unitId: 'unit_1',
        role: { code: 'SDIT_GURU', permissions: ['STUDENT_READ'] },
      },
    ],
  };

  function stubLoginSideEffects(user: any = linkedUser) {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(user as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValueOnce({ id: 'ay_1' } as any);
  }

  it('links the provider identity on first login', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    vi.mocked(prisma.identityProvider.findUnique).mockResolvedValueOnce(null as any);

    await authService.ssoLogin({ provider: 'microsoft', idToken: 'first_login_token' });

    expect(prisma.identityProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'MICROSOFT',
          providerSubjectId: 'ms-oid-link',
          providerEmail: 'guru@cipansor.or.id',
          userId: 'usr_link_1',
        }),
      })
    );
  });

  it('refreshes lastLoginAt on a repeat login instead of creating a second row', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    vi.mocked(prisma.identityProvider.findUnique).mockResolvedValue({
      id: 'idp_1',
      userId: 'usr_link_1',
      provider: 'MICROSOFT',
      providerSubjectId: 'ms-oid-link',
      // Resolution-by-subject reads the linked user through this relation.
      user: linkedUser,
    } as any);

    await authService.ssoLogin({ provider: 'microsoft', idToken: 'repeat_login_token' });

    expect(prisma.identityProvider.create).not.toHaveBeenCalled();
    expect(prisma.identityProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idp_1' },
        data: expect.objectContaining({ providerEmail: 'guru@cipansor.or.id' }),
      })
    );
  });

  it('refuses to re-point a subject that already belongs to another live account', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    vi.mocked(prisma.identityProvider.findUnique).mockResolvedValue({
      id: 'idp_other',
      userId: 'someone-else',
      provider: 'MICROSOFT',
      providerSubjectId: 'ms-oid-link',
    } as any);
    // The other account is alive, so the link is genuinely theirs.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deletedAt: null } as any);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'hijack_attempt_token' })
    ).rejects.toThrow('sudah tertaut ke akun lain');

    expect(prisma.identityProvider.create).not.toHaveBeenCalled();
    expect(prisma.identityProvider.update).not.toHaveBeenCalled();
  });

  it('re-points a stale subject link owned by a soft-deleted user to the recreated account', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    // The old link survives, still pointing at the account that was deleted...
    vi.mocked(prisma.identityProvider.findUnique).mockResolvedValue({
      id: 'idp_stale',
      userId: 'usr_deleted',
      provider: 'MICROSOFT',
      providerSubjectId: 'ms-oid-link',
    } as any);
    // ...and that account is soft-deleted, so the user signs in again through
    // the e-mail fallback as a freshly created (live) row.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      deletedAt: new Date(),
    } as any);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'recreated_user_token',
    });

    expect(result).toHaveProperty('accessToken');
    // The repair: the surviving link is re-pointed at the live account rather
    // than raising a permanent conflict that locked the user out.
    expect(prisma.identityProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idp_stale' },
        data: expect.objectContaining({ userId: 'usr_link_1' }),
      })
    );
    expect(prisma.identityProvider.create).not.toHaveBeenCalled();
  });

  it('resolves the account through the subject link when the PROVIDER EMAIL changed (BUG 5)', async () => {
    stubMicrosoftSuccessClaims();
    // The mailbox moved provider-side; the local row still holds the old one.
    stubLoginSideEffects(linkedUser);

    vi.mocked(prisma.identityProvider.findUnique).mockResolvedValue({
      id: 'idp_1',
      userId: 'usr_link_1',
      provider: 'MICROSOFT',
      providerSubjectId: 'ms-oid-link',
      user: linkedUser,
    } as any);

    const findFirstSpy = vi.spyOn(prisma.user, 'findFirst');

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'email_changed_token',
    });

    // Resolved by (provider, subject) — NOT by email — so the moved mailbox
    // did not lock the user out.
    expect(result).toHaveProperty('accessToken');
    expect(findFirstSpy).not.toHaveBeenCalled();
  });

  it('treats a P2002 unique race as an existing link, not an error (BUG 10)', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    // First read (resolution) sees no link; the create then loses the race and
    // the re-read finds the row this same request was trying to create.
    vi.mocked(prisma.identityProvider.findUnique)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({
        id: 'idp_raced',
        userId: 'usr_link_1',
        provider: 'MICROSOFT',
        providerSubjectId: 'ms-oid-link',
      } as any);

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    vi.mocked(prisma.identityProvider.create).mockRejectedValueOnce(p2002);

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'raced_first_login_token',
    });

    // Idempotent: the concurrent first login is handled as a normal repeat.
    expect(result).toHaveProperty('accessToken');
    expect(prisma.identityProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'idp_raced' } })
    );
  });

  it('does not link an identity when the account does not exist', async () => {
    stubMicrosoftSuccessClaims();
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'unknown_user_token' })
    ).rejects.toThrow();

    expect(prisma.identityProvider.create).not.toHaveBeenCalled();
  });

  // ==========================================
  // Login audit trail (TASK 6)
  // ==========================================

  it('records a successful SSO login in the audit log', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();

    await authService.ssoLogin(
      { provider: 'microsoft', idToken: 'audited_token' },
      { ipAddress: '203.0.113.7', userAgent: 'vitest-agent' }
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LOGIN',
          entity: 'User',
          entityId: 'usr_link_1',
          userId: 'usr_link_1',
          ipAddress: '203.0.113.7',
          userAgent: 'vitest-agent',
        }),
      })
    );
  });

  it('records a failed SSO login with a reason, without the attempted email', async () => {
    stubMicrosoftSuccessClaims();
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);

    await expect(
      authService.ssoLogin({ provider: 'microsoft', idToken: 'bad_user_token' })
    ).rejects.toThrow();

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls.at(-1)?.[0] as any;
    expect(auditCall.data).toMatchObject({
      action: 'LOGIN',
      entity: 'User',
      entityId: null,
      userId: null,
    });
    expect(auditCall.data.newValues).toMatchObject({
      method: 'sso:microsoft',
      success: false,
      reason: 'user_not_found',
    });
    // PII decision: the attempted address must not be persisted.
    expect(JSON.stringify(auditCall.data)).not.toContain('guru@cipansor.or.id');
  });

  it('never lets an audit-write failure break a successful login', async () => {
    stubMicrosoftSuccessClaims();
    stubLoginSideEffects();
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error('audit table is down'));

    const result = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'audit_broken_token',
    });

    expect(result).toHaveProperty('accessToken');
  });
});

describe('password login and SSO login return the same user contract (BUG: SSO returned an incomplete user)', () => {
  const originalEnv = process.env;

  /**
   * A user record in the shape the DB actually returns for the shared
   * `PASSWORD_USER_INCLUDE`. Password login and SSO login must both surface an
   * identical `user` object from it — same top-level keys, same role-assignment
   * keys, same nested role keys.
   */
  const fullUser = {
    id: 'usr_contract',
    email: 'guru@cipansor.or.id',
    name: 'Guru Kontrak',
    phone: '0812',
    isActive: true,
    isTwoFactorEnabled: false,
    isEmployee: false,
    deletedAt: null,
    unitId: 'unit_1',
    passwordHash: 'stored-hash',
    twoFactorSecret: null,
    twoFactorSecretPending: null,
    twoFactorRecoveryCodes: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
    unit: { id: 'unit_1', name: 'SD IT', type: 'SDIT' },
    userRoles: [
      {
        id: 'assign_1',
        userId: 'usr_contract',
        roleId: 'role_1',
        unitId: 'unit_1',
        isPrimary: true,
        isActive: true,
        assignedAt: new Date('2025-01-01'),
        expiresAt: null,
        unit: { id: 'unit_1', name: 'SD IT', type: 'SDIT' },
        role: {
          id: 'role_1',
          code: 'SDIT_GURU',
          name: 'Guru SD IT',
          realm: 'ACADEMIC',
          description: null,
          permissions: ['STUDENT_READ'],
        },
      },
    ],
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';
    vi.restoreAllMocks();
    vi.spyOn(prisma.identityProvider, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.identityProvider, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.identityProvider, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ deletedAt: null } as any);
    vi.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.academicYear, 'findFirst').mockResolvedValue({ id: 'ay_1' } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exposes the identifiers, unit and role assignment fields the web client reads', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';

    // --- Password login ---
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(fullUser as any);
    const passwordResult: any = await authService.login({
      email: 'guru@cipansor.or.id',
      password: 'secret',
    });

    // --- SSO login over the same record ---
    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      iss: 'https://login.microsoftonline.com/55555555-5555-5555-5555-555555555555/v2.0',
      exp: Math.floor(Date.now() / 1000) + 3600,
      preferred_username: 'guru@cipansor.or.id',
      oid: 'ms-oid-contract',
    } as any);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(fullUser as any);
    const ssoResult: any = await authService.ssoLogin({
      provider: 'microsoft',
      idToken: 'contract_token',
    });

    // Identical top-level keys on the returned user.
    expect(Object.keys(ssoResult.user).sort()).toEqual(Object.keys(passwordResult.user).sort());

    // Both paths must ask the database for the SAME relation shape. Prisma is
    // mocked here, so asserting on the returned fixture alone would pass even
    // if the query had narrowed again — the include is what actually decides
    // which fields exist in production.
    const passwordQuery = vi.mocked(prisma.user.findFirst).mock.calls[0][0] as any;
    const ssoQuery = vi.mocked(prisma.user.findFirst).mock.calls[1][0] as any;
    expect(passwordQuery.include.unit).toBe(true);
    expect(passwordQuery.include.userRoles.include.role).toBe(true);
    expect(ssoQuery.include).toEqual(passwordQuery.include);

    // The fields the password path returns and SSO used to omit entirely.
    expect(ssoResult.user.unit).toEqual(passwordResult.user.unit);
    expect(ssoResult.user.userRoles).toHaveLength(1);
    expect(ssoResult.user.userRoles[0].id).toBe('assign_1');
    expect(ssoResult.user.userRoles[0].unit).toEqual(passwordResult.user.userRoles[0].unit);
    expect(ssoResult.user.userRoles[0].role.realm).toBe('ACADEMIC');
    expect(ssoResult.user.userRoles[0].role.name).toBe('Guru SD IT');
    expect(ssoResult.user.userRoles[0].role).toEqual(passwordResult.user.userRoles[0].role);

    // Sensitive fields must never leave the server on either path.
    for (const key of [
      'passwordHash',
      'twoFactorSecret',
      'twoFactorSecretPending',
      'twoFactorRecoveryCodes',
      'resetTokenHash',
      'resetTokenExpiresAt',
    ]) {
      expect(ssoResult.user).not.toHaveProperty(key);
      expect(passwordResult.user).not.toHaveProperty(key);
    }
  });
});

describe('resolveTenantGuidFromDomain transient-failure recovery (BUG 3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    __resetMicrosoftTenantGuidCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    __resetMicrosoftTenantGuidCache();
    vi.restoreAllMocks();
  });

  const DOMAIN = 'tenant-recovery.example';
  const GUID = '44444444-4444-4444-4444-444444444444';

  const okResponse = () =>
    ({
      ok: true,
      json: async () => ({
        issuer: `https://login.microsoftonline.com/${GUID}/v2.0`,
      }),
    }) as any;

  it('does not cache a transient failure permanently — retries and succeeds', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(okResponse());

    const first = await resolveTenantGuidFromDomain(DOMAIN, 1_000);
    expect(first).toBeNull();

    // The network is back and the failure entry has expired; the next attempt
    // must reach discovery and resolve, rather than replaying the cached null.
    const second = await resolveTenantGuidFromDomain(DOMAIN, 1_000 + TENANT_FAILURE_TTL_MS + 1);
    expect(second).toBe(GUID);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not refetch a failure before the TTL elapses', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

    const first = await resolveTenantGuidFromDomain(DOMAIN, 2_000);
    const second = await resolveTenantGuidFromDomain(DOMAIN, 2_000 + TENANT_FAILURE_TTL_MS - 1);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a 200 response without a GUID as a failure that is retried', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ issuer: 'nonsense' }) } as any)
      .mockResolvedValueOnce(okResponse());

    expect(await resolveTenantGuidFromDomain(DOMAIN, 5_000)).toBeNull();
    expect(await resolveTenantGuidFromDomain(DOMAIN, 5_000 + TENANT_FAILURE_TTL_MS + 1)).toBe(GUID);
  });

  it('caches a resolved GUID indefinitely and never refetches it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse());

    expect(await resolveTenantGuidFromDomain(DOMAIN, 10_000)).toBe(GUID);
    // Even long past the failure TTL, a success is authoritative.
    expect(await resolveTenantGuidFromDomain(DOMAIN, 10_000_000_000)).toBe(GUID);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
