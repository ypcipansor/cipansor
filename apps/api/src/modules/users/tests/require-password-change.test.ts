/**
 * "Wajibkan ganti kata sandi" on the users list: for a password that leaked or
 * that someone else learned. The account chooses a new one at its next
 * sign-in; its refresh tokens go now. A unit admin acts only inside the unit,
 * and never on an account that must use 2FA (admins, organs, unit heads) —
 * the same peer rule as turning someone's 2FA off.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn() }));

import { userService } from '../user.service';

const SUPER = { roleCode: RoleCode.SUPER_ADMIN, unitId: null, sub: 'admin-0' };
const SDIT_ADMIN = { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit', sub: 'admin-1' };

function target(code: RoleCode, unitId = 'unit-sdit', passwordHash: string | null = 'hash') {
  return {
    id: 'user-9',
    name: 'Guru Contoh',
    unitId,
    passwordHash,
    userRoles: [{ role: { code } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
});

function expectNothingChanged() {
  expect(prismaMock.user.update).not.toHaveBeenCalled();
  expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
}

describe('requiring a new password', () => {
  it('a unit admin flags a teacher of the unit and ends the sessions', async () => {
    prismaMock.user.findFirst.mockResolvedValue(target(RoleCode.SDIT_GURU));

    const result = await userService.requirePasswordChange('user-9', SDIT_ADMIN);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { mustChangePassword: true },
    });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-9' },
    });
    expect(result.message).toContain('Guru Contoh');
  });

  it('a unit admin cannot reach another unit', async () => {
    prismaMock.user.findFirst.mockResolvedValue(target(RoleCode.SMPIT_GURU, 'unit-smpit'));

    await expect(userService.requirePasswordChange('user-9', SDIT_ADMIN)).rejects.toMatchObject({
      statusCode: 403,
    });
    expectNothingChanged();
  });

  it.each([RoleCode.SUPER_ADMIN, RoleCode.SDIT_ADMIN, RoleCode.SDIT_KEPALA_SEKOLAH])(
    'a unit admin cannot flag %s, who must use 2FA',
    async (code) => {
      prismaMock.user.findFirst.mockResolvedValue(target(code));

      await expect(userService.requirePasswordChange('user-9', SDIT_ADMIN)).rejects.toMatchObject({
        statusCode: 403,
      });
      expectNothingChanged();
    }
  );

  it('Super Admin can flag a kepala sekolah', async () => {
    prismaMock.user.findFirst.mockResolvedValue(target(RoleCode.SDIT_KEPALA_SEKOLAH));

    await userService.requirePasswordChange('user-9', SUPER);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("is not for the admin's own account", async () => {
    await expect(userService.requirePasswordChange('admin-1', SDIT_ADMIN)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it('refuses a record with no login', async () => {
    prismaMock.user.findFirst.mockResolvedValue(target(RoleCode.SDIT_GURU, 'unit-sdit', null));

    await expect(userService.requirePasswordChange('user-9', SUPER)).rejects.toMatchObject({
      statusCode: 400,
    });
    expectNothingChanged();
  });

  it('answers 404 for an account that does not exist', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(userService.requirePasswordChange('nobody', SUPER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
