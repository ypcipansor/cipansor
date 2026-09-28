/**
 * Who must use 2FA (decided 2026-09-28): admins, the yayasan's organs, and the
 * head of every unit — the four kepala sekolah and the Pimpinan Pesantren. Any
 * active assignment counts. Everyone else may turn it on, and off, themselves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode, UserRole } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn() },
    academicYear: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh' })),
  generateAccessToken: vi.fn(() => 'temp'),
  verifyToken: vi.fn(),
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
}));

import { requiresSecondFactor } from '@/middleware/auth';
import { authService } from '../auth.service';

const UNIT_HEADS = [
  RoleCode.TKQ_KEPALA_SEKOLAH,
  RoleCode.SDIT_KEPALA_SEKOLAH,
  RoleCode.SMPIT_KEPALA_SEKOLAH,
  RoleCode.SMAQ_KEPALA_SEKOLAH,
  RoleCode.PESANTREN_PENGASUH,
];

function account(codes: RoleCode[], isTwoFactorEnabled = false) {
  return {
    id: 'user-1',
    email: 'kepala@example.test',
    passwordHash: 'hash',
    role: UserRole.TEACHER,
    unitId: 'unit-1',
    isActive: true,
    isTwoFactorEnabled,
    twoFactorSecret: isTwoFactorEnabled ? 'JBSWY3DPEHPK3PXP' : null,
    unit: null,
    userRoles: codes.map((code, i) => ({
      isPrimary: i === 0,
      roleId: `role-${code}`,
      unitId: 'unit-1',
      role: { code, permissions: [] },
      unit: null,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.academicYear.findFirst.mockResolvedValue(null);
});

describe('which roles make 2FA mandatory', () => {
  it.each(UNIT_HEADS)('%s does', (code) => {
    expect(requiresSecondFactor([code])).toBe(true);
  });

  it.each([RoleCode.SUPER_ADMIN, RoleCode.SMPIT_ADMIN, RoleCode.YAYASAN_PENGAWAS])(
    '%s still does',
    (code) => {
      expect(requiresSecondFactor([code])).toBe(true);
    }
  );

  it.each([
    RoleCode.SDIT_GURU,
    RoleCode.MUSYRIF,
    RoleCode.SMPIT_TATA_USAHA,
    RoleCode.SDIT_ORANG_TUA,
    RoleCode.SMAQ_SISWA,
  ])('%s does not', (code) => {
    expect(requiresSecondFactor([code])).toBe(false);
  });

  it('counts a secondary assignment, not only the one in use', () => {
    expect(requiresSecondFactor([RoleCode.SMPIT_GURU, RoleCode.SMPIT_KEPALA_SEKOLAH])).toBe(true);
  });
});

describe('a kepala sekolah without 2FA', () => {
  it('is sent to set it up at sign-in', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account([RoleCode.SDIT_KEPALA_SEKOLAH]));

    const result = await authService.login({ email: 'kepala@example.test', password: 'x' });

    expect(result).toMatchObject({ requiresTwoFactorSetup: true });
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('is told on the profile that 2FA is required', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account([RoleCode.PESANTREN_PENGASUH], true));

    await expect(authService.getTwoFactorStatus('user-1')).resolves.toEqual({
      isEnabled: true,
      isRequired: true,
    });
  });

  it('cannot turn it off', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account([RoleCode.SMAQ_KEPALA_SEKOLAH], true));

    await expect(authService.disableTwoFactor('user-1', '123456')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('a teacher', () => {
  it('signs in without 2FA, and the profile says it is optional', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account([RoleCode.SDIT_GURU]));
    prismaMock.user.findUnique.mockResolvedValue(account([RoleCode.SDIT_GURU]));

    const result = await authService.login({ email: 'guru@example.test', password: 'x' });
    const status = await authService.getTwoFactorStatus('user-1');

    expect(result).toHaveProperty('accessToken', 'access');
    expect(status).toEqual({ isEnabled: false, isRequired: false });
  });
});
