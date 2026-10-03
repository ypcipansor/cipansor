/**
 * "Kirim tautan reset password" on the users list. The link goes to the
 * account's own email, so this is no takeover — but an admin still sends it
 * only within their scope (`utils/account-scope.ts`), and every link replaces
 * the one before it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { user: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(),
  generateAccessToken: vi.fn(),
  verifyToken: vi.fn(),
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
}));

import { authService } from '../auth.service';

const SUPER = { roleCode: RoleCode.SUPER_ADMIN, unitId: null, sub: 'admin-0' };
const SDIT_ADMIN = { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit', sub: 'admin-1' };

function account(code: RoleCode, unitId = 'unit-sdit', id = 'user-9') {
  return {
    id,
    email: 'contoh@example.test',
    name: 'Contoh',
    passwordHash: 'hash',
    isActive: true,
    unitId,
    userRoles: [{ role: { code } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
});

describe('sending a reset link', () => {
  it('a unit admin sends one to a teacher of the unit', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_GURU));

    const reset = await authService.issuePasswordResetToken('user-9', SDIT_ADMIN);

    expect(reset).toMatchObject({ userId: 'user-9', email: 'contoh@example.test' });
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it.each([
    ['a teacher of another unit', account(RoleCode.SMPIT_GURU, 'unit-smpit')],
    ['the kepala sekolah', account(RoleCode.SDIT_KEPALA_SEKOLAH)],
    ['Super Admin', account(RoleCode.SUPER_ADMIN)],
  ])('a unit admin cannot send one to %s', async (_, target) => {
    prismaMock.user.findFirst.mockResolvedValue(target);

    await expect(authService.issuePasswordResetToken('user-9', SDIT_ADMIN)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('an admin may send one to their own account', async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      account(RoleCode.SDIT_ADMIN, 'unit-sdit', 'admin-1')
    );

    await authService.issuePasswordResetToken('admin-1', SDIT_ADMIN);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it('Super Admin sends one to anyone', async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      account(RoleCode.SMPIT_KEPALA_SEKOLAH, 'unit-smpit')
    );

    await authService.issuePasswordResetToken('user-9', SUPER);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });
});
