import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService } from '../auth.service';
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

describe('SSO Authentication Security Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
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
    ).rejects.toThrow('Google SSO is not configured on this server');
  });

  it('should reject Google SSO when token audience (aud) mismatches', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'user@cipansor.or.id',
        email_verified: true,
        aud: 'wrong-google-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as Response);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'token_with_wrong_aud',
      })
    ).rejects.toThrow('Google token audience (aud) mismatch');
  });

  it('should reject Google SSO when token is expired', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'user@cipansor.or.id',
        email_verified: true,
        aud: 'expected-google-client-id',
        exp: Math.floor(Date.now() / 1000) - 100, // Expired
      }),
    } as Response);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'expired_token',
      })
    ).rejects.toThrow('Google token has expired');
  });

  it('should reject Google SSO when email is not verified', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'user@cipansor.or.id',
        email_verified: false,
        aud: 'expected-google-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as Response);

    await expect(
      authService.ssoLogin({
        provider: 'google',
        idToken: 'unverified_email_token',
      })
    ).rejects.toThrow('Google account email is missing or not verified');
  });

  it('should reject Google SSO when user is not found in database', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-google-client-id';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'unregistered@cipansor.or.id',
        email_verified: true,
        aud: 'expected-google-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as Response);

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
    ).rejects.toThrow('Microsoft SSO is not configured on this server');
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
      preferred_username: 'guru@cipansor.or.id',
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
    process.env.MICROSOFT_TENANT_ID = 'tenant-guid-111';

    vi.spyOn(jwt, 'decode').mockReturnValueOnce({
      header: { kid: 'key_123' },
      payload: {},
    } as any);
    vi.spyOn(jwt, 'verify').mockReturnValueOnce({
      aud: 'expected-ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      // A token minted for a different tenant: same email domain, foreign tid.
      tid: 'tenant-guid-999',
      iss: 'https://login.microsoftonline.com/tenant-guid-999/v2.0',
      preferred_username: 'guru@cipansor.or.id',
    } as any);

    await expect(
      authService.ssoLogin({
        provider: 'microsoft',
        idToken: 'ms_token_wrong_tenant',
      })
    ).rejects.toThrow('Microsoft token tenant (tid) mismatch');
  });

  it('should accept Microsoft token whose tenant matches MICROSOFT_TENANT_ID', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    process.env.MICROSOFT_TENANT_ID = 'tenant-guid-111';

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
      tid: 'tenant-guid-111',
      iss: 'https://login.microsoftonline.com/tenant-guid-111/v2.0',
      preferred_username: 'guru@cipansor.or.id',
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

  it('caches the JWKS client per tenant so signing keys are not refetched on every login', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'expected-ms-client-id';
    // A tenant id not used by any earlier test, so the cache starts empty for it.
    process.env.MICROSOFT_TENANT_ID = 'tenant-guid-cache';

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
        tid: 'tenant-guid-cache',
        iss: 'https://login.microsoftonline.com/tenant-guid-cache/v2.0',
        preferred_username: 'guru@cipansor.or.id',
      } as any)
      .mockReturnValueOnce({
        aud: 'expected-ms-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tid: 'tenant-guid-cache',
        iss: 'https://login.microsoftonline.com/tenant-guid-cache/v2.0',
        preferred_username: 'guru@cipansor.or.id',
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
    process.env.MICROSOFT_TENANT_ID = 'tenant-guid-999';

    const cfg = authService.getSSOConfig();
    expect(cfg.microsoftTenantId).toBe('tenant-guid-999');
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
      preferred_username: 'GURU@cipansor.or.id',
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
});
