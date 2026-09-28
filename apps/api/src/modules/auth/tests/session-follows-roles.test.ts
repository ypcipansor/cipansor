/**
 * A session follows the account's live role assignments.
 *
 * Refresh and the 2FA step used to fall back to the legacy `users.role`
 * column when no active assignment was left, so removing or expiring every
 * role of an account did not end its sessions: each refresh minted a new one
 * on the old role (login itself already refused such an account). And a role
 * that demands 2FA, granted while a session was open, kept being renewed
 * without it for the refresh token's 30 days.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode, UserRole } from '@prisma/client';

const { prismaMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    refreshToken: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  },
  jwtMock: {
    generateTokenPair: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh-2' })),
    generateAccessToken: vi.fn(() => 'temp'),
    verifyToken: vi.fn(() => ({ type: 'refresh', sub: 'user-1' })),
    getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/jwt', () => jwtMock);

import { authService } from '../auth.service';

function assignment(code: RoleCode, isPrimary = true) {
  return {
    isPrimary,
    roleId: `role-${code}`,
    unitId: 'unit-1',
    role: { code, permissions: [] },
    unit: null,
  };
}

function storedToken(user: Record<string, unknown>) {
  return {
    id: 'rt-1',
    token: 'refresh-1',
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'akun@example.test',
      unitId: 'unit-1',
      isActive: true,
      isTwoFactorEnabled: false,
      role: UserRole.SUPER_ADMIN,
      userRoles: [],
      ...user,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.delete.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.academicYear.findFirst.mockResolvedValue(null);
  prismaMock.$executeRaw.mockResolvedValue(1);
});

describe('renewing a session', () => {
  it('ends it when the account has no active role left, whatever the legacy column says', async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValue(storedToken({ userRoles: [] }));

    await expect(authService.refreshToken('refresh-1')).rejects.toMatchObject({
      statusCode: 403,
    });
    // The presented token is spent, so the session cannot try again.
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
    expect(jwtMock.generateTokenPair).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('sends the account back to sign-in when it now holds a role that demands 2FA and has none', async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValue(
      storedToken({
        isTwoFactorEnabled: false,
        userRoles: [assignment(RoleCode.SDIT_GURU), assignment(RoleCode.SDIT_ADMIN, false)],
      })
    );

    await expect(authService.refreshToken('refresh-1')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(jwtMock.generateTokenPair).not.toHaveBeenCalled();
  });

  it('renews on the primary assignment when the account has one', async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValue(
      storedToken({ userRoles: [assignment(RoleCode.SDIT_GURU)] })
    );

    const tokens = await authService.refreshToken('refresh-1');

    expect(tokens.accessToken).toBe('access');
    expect(jwtMock.generateTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: RoleCode.SDIT_GURU })
    );
  });

  it('renews a 2FA-mandatory role when the account has 2FA on', async () => {
    prismaMock.refreshToken.findFirst.mockResolvedValue(
      storedToken({ isTwoFactorEnabled: true, userRoles: [assignment(RoleCode.SDIT_ADMIN)] })
    );

    const tokens = await authService.refreshToken('refresh-1');

    expect(tokens.accessToken).toBe('access');
  });
});

describe('the 2FA step', () => {
  it('refuses an account with no active role before spending its recovery code', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'akun@example.test',
      unitId: 'unit-1',
      role: UserRole.UNIT_ADMIN,
      isActive: true,
      isTwoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      unit: null,
      userRoles: [],
    });

    await expect(
      authService.verifyTwoFactorLogin('user-1', 'A1B2C3D4E5', true)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(jwtMock.generateTokenPair).not.toHaveBeenCalled();
  });
});
