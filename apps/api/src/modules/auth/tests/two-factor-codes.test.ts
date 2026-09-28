/**
 * Two-factor codes as people type them, against the real otplib.
 *
 * otplib's `verify` throws on any token that is not exactly six digits. The
 * service used to hand it whatever arrived, so a recovery code (ten characters)
 * never reached the recovery-code lookup, and a mistyped or pasted code
 * answered 500. These tests run otplib unmocked for that reason; the unit tests
 * in tests/unit/auth.service.test.ts mock it and could not see it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generate, generateSecret } from 'otplib';
import { RoleCode, UserRole } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh' })),
  generateAccessToken: vi.fn(() => 'temp'),
  verifyToken: vi.fn(),
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
}));

import { authService } from '../auth.service';

const SECRET = generateSecret();

function signingInUser() {
  return {
    id: 'user-1',
    email: 'guru@example.test',
    role: UserRole.TEACHER,
    unitId: 'unit-1',
    isActive: true,
    isTwoFactorEnabled: true,
    twoFactorSecret: SECRET,
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
  };
}

/** The recovery code the $executeRaw template was called with. */
function spentCode(): unknown {
  const call = prismaMock.$executeRaw.mock.calls[0];
  return call?.slice(1)[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockResolvedValue(signingInUser());
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.academicYear.findFirst.mockResolvedValue(null);
  prismaMock.$executeRaw.mockResolvedValue(0);
});

describe('signing in with a second factor', () => {
  it('accepts an unused recovery code and spends it', async () => {
    prismaMock.$executeRaw.mockResolvedValue(1);

    const result = await authService.verifyTwoFactorLogin('user-1', 'A1B2C3D4E5', true);

    expect(result.accessToken).toBe('access');
    expect(spentCode()).toBe('A1B2C3D4E5');
  });

  it('accepts a recovery code typed in lower case, with spaces or a dash', async () => {
    prismaMock.$executeRaw.mockResolvedValue(1);

    await authService.verifyTwoFactorLogin('user-1', ' a1b2c-3d4e5 ', true);

    expect(spentCode()).toBe('A1B2C3D4E5');
  });

  it('refuses a recovery code that was already spent, with a 401', async () => {
    prismaMock.$executeRaw.mockResolvedValue(0);

    await expect(
      authService.verifyTwoFactorLogin('user-1', 'A1B2C3D4E5', true)
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('accepts the current authenticator code with spaces around or inside', async () => {
    const code = await generate({ secret: SECRET });

    const result = await authService.verifyTwoFactorLogin(
      'user-1',
      ` ${code.slice(0, 3)} ${code.slice(3)} `,
      true
    );

    expect(result.accessToken).toBe('access');
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['five digits', '12345'],
    ['seven digits', '1234567'],
    ['letters', 'abcdef'],
  ])('answers %s with a 401, not a server error', async (_label, token) => {
    await expect(authService.verifyTwoFactorLogin('user-1', token, true)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not look a wrong six-digit code up among the recovery codes', async () => {
    const code = await generate({ secret: SECRET });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');

    await expect(authService.verifyTwoFactorLogin('user-1', wrong, true)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('turning two-factor on and off', () => {
  it('answers a malformed code during setup with a 400, not a server error', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isTwoFactorEnabled: false,
      twoFactorSecretPending: SECRET,
    });

    await expect(authService.enableTwoFactor('user-1', '12345')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('answers a wrong code when turning it off with a 400, not a 401 that reads as an expired session', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.STUDENT,
      unitId: 'unit-1',
      isTwoFactorEnabled: true,
      twoFactorSecret: SECRET,
      userRoles: [{ isPrimary: true, role: { code: RoleCode.SDIT_SISWA } }],
    });

    await expect(authService.disableTwoFactor('user-1', '000000x')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
