/**
 * A password someone else set, or one marked leaked, is replaced before the
 * account gets a session (decisions/autentikasi-2fa-dan-sandi.md). Sign-in and
 * the 2FA step hand out a token that can do nothing but set the new password;
 * the refresh of a session that was running is refused; the change clears it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generate, generateSecret } from 'otplib';
import { RoleCode, UserRole } from '@prisma/client';

const { prismaMock, jwtMock, passwordMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  },
  jwtMock: {
    generateTokenPair: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh' })),
    generateAccessToken: vi.fn(() => 'temp'),
    verifyToken: vi.fn(),
    getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
  },
  passwordMock: {
    hashPassword: vi.fn(async () => 'new-hash'),
    comparePassword: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/jwt', () => jwtMock);
vi.mock('@/lib/password', () => passwordMock);

import { authService } from '../auth.service';

const SECRET = generateSecret();
const LONG = 'tiga ekor kucing di serambi masjid';

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'guru@example.test',
    name: 'Guru Contoh',
    passwordHash: 'old-hash',
    role: UserRole.TEACHER,
    unitId: 'unit-1',
    isActive: true,
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
    mustChangePassword: true,
    passwordNeedsSecondFactor: false,
    unit: null,
    userRoles: [
      {
        isPrimary: true,
        roleId: 'role-1',
        unitId: 'unit-1',
        role: { code: RoleCode.SDIT_GURU, permissions: [] },
        unit: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.academicYear.findFirst.mockResolvedValue(null);
  // The old password is right; a new one is different from it.
  passwordMock.comparePassword.mockImplementation(
    async (plain: string) => plain === 'the-old-password'
  );
});

describe('signing in with a password that must change', () => {
  it('gets a token for the change, not a session', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    const result = await authService.login({
      email: 'guru@example.test',
      password: 'the-old-password',
    });

    expect(result).toEqual({ requiresPasswordChange: true, tempToken: 'temp' });
    expect(jwtMock.generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', isTemp: true, purpose: 'password-change' }),
      '10m'
    );
    expect(jwtMock.generateTokenPair).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('with 2FA on, is asked for the second factor first', async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      account({ isTwoFactorEnabled: true, twoFactorSecret: SECRET })
    );

    const result = await authService.login({
      email: 'guru@example.test',
      password: 'the-old-password',
    });

    expect(result).toMatchObject({ requiresTwoFactor: true });
    expect(jwtMock.generateAccessToken).toHaveBeenCalledWith(
      expect.not.objectContaining({ purpose: 'password-change' }),
      '5m'
    );
  });

  it('after the second factor, gets the token for the change', async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      account({ isTwoFactorEnabled: true, twoFactorSecret: SECRET })
    );

    const code = await generate({ secret: SECRET });
    const result = await authService.verifyTwoFactorLogin('user-1', code, true);

    expect(result).toEqual({ requiresPasswordChange: true, tempToken: 'temp' });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('a wrong password still gets nothing', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    await expect(
      authService.login({ email: 'guru@example.test', password: 'a guess' })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(jwtMock.generateAccessToken).not.toHaveBeenCalled();
  });

  it('without the flag, signs in as before', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account({ mustChangePassword: false }));

    const result = await authService.login({
      email: 'guru@example.test',
      password: 'the-old-password',
    });

    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
  });
});

describe('choosing the new password', () => {
  it('saves it, clears the flag, ends the old sessions and starts one', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    const result = await authService.completeForcedChange('user-1', LONG);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        passwordHash: 'new-hash',
        mustChangePassword: false,
        passwordNeedsSecondFactor: false,
      },
    });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: 'refresh', userId: 'user-1' }),
    });
    expect(result).toMatchObject({ accessToken: 'access', user: { id: 'user-1' } });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('refuses the old password again', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());
    passwordMock.comparePassword.mockResolvedValue(true);

    await expect(authService.completeForcedChange('user-1', LONG)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('berbeda'),
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('holds it to the same rules: 15 characters without 2FA', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    await expect(authService.completeForcedChange('user-1', 'kopi-susu-12')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows 8 with 2FA on, and remembers that it needs it', async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      account({ isTwoFactorEnabled: true, twoFactorSecret: SECRET })
    );

    await authService.completeForcedChange('user-1', 'kopi-susu-12');

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordNeedsSecondFactor: true }),
      })
    );
  });

  it('is refused for an account that does not have to change', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account({ mustChangePassword: false }));

    await expect(authService.completeForcedChange('user-1', LONG)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('is refused for an account deactivated since the sign-in', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account({ isActive: false }));

    await expect(authService.completeForcedChange('user-1', LONG)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('a session that was running when the flag was set', () => {
  it('is not renewed', async () => {
    jwtMock.verifyToken.mockReturnValue({ type: 'refresh', sub: 'user-1' });
    prismaMock.refreshToken.findFirst.mockResolvedValue({
      id: 'rt-1',
      token: 'refresh',
      userId: 'user-1',
      user: account(),
    });

    await expect(authService.refreshToken('refresh')).rejects.toMatchObject({ statusCode: 401 });
    expect(jwtMock.generateTokenPair).not.toHaveBeenCalled();
  });
});

describe('changing the password from the profile', () => {
  it('keeps the session that made the change and ends the others', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    await authService.changePassword(
      'user-1',
      { currentPassword: 'the-old-password', newPassword: LONG },
      'this-session'
    );

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', token: { not: 'this-session' } },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: false }),
      })
    );
  });

  it('without a session cookie (a bearer client), ends them all', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account());

    await authService.changePassword('user-1', {
      currentPassword: 'the-old-password',
      newPassword: LONG,
    });

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });
});

describe('turning 2FA off', () => {
  async function disable(passwordNeedsSecondFactor: boolean) {
    prismaMock.user.findUnique.mockResolvedValue(
      account({
        isTwoFactorEnabled: true,
        twoFactorSecret: SECRET,
        mustChangePassword: false,
        passwordNeedsSecondFactor,
      })
    );
    return authService.disableTwoFactor('user-1', await generate({ secret: SECRET }));
  }

  it('with a password under 15 characters, makes it change', async () => {
    const result = await disable(true);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isTwoFactorEnabled: false, mustChangePassword: true }),
      })
    );
    expect(result).toMatchObject({ mustChangePassword: true });
  });

  it('with a long password, leaves it alone', async () => {
    const result = await disable(false);

    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('mustChangePassword');
    expect(result).toMatchObject({ mustChangePassword: false });
  });
});
