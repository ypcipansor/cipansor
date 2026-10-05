/**
 * Deleting an account, and changing another account's email or switching it
 * off, follow one rule (`utils/account-scope.ts`): Super Admin on anyone; a
 * unit admin inside the unit and never on an account that must use 2FA. The
 * delete used to check neither, so any admin could remove any account,
 * Super Admin's included.
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

function account(code: RoleCode, unitId = 'unit-sdit') {
  return {
    id: 'user-9',
    name: 'Contoh',
    email: 'contoh@example.test',
    unitId,
    isActive: true,
    userRoles: [{ role: { code } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({ id: 'user-9' });
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
});

describe('deleting an account', () => {
  it('a unit admin removes a teacher of the unit, and the sessions go too', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_GURU));

    await userService.delete('user-9', SDIT_ADMIN);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-9' },
    });
  });

  it.each([
    ['Super Admin', account(RoleCode.SUPER_ADMIN, 'unit-sdit')],
    ['the kepala sekolah', account(RoleCode.SDIT_KEPALA_SEKOLAH)],
    ['another unit admin', account(RoleCode.SDIT_ADMIN)],
    ['a teacher of another unit', account(RoleCode.SMPIT_GURU, 'unit-smpit')],
  ])('a unit admin cannot remove %s', async (_, target) => {
    prismaMock.user.findFirst.mockResolvedValue(target);

    await expect(userService.delete('user-9', SDIT_ADMIN)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('Super Admin can remove a kepala sekolah', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_KEPALA_SEKOLAH));

    await userService.delete('user-9', SUPER);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it('nobody removes their own account from here', async () => {
    await expect(userService.delete('admin-1', SDIT_ADMIN)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('editing an account', () => {
  it("a unit admin cannot change the kepala sekolah's email", async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_KEPALA_SEKOLAH));

    await expect(
      userService.update('user-9', { email: 'baru@example.test' }, SDIT_ADMIN)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('a unit admin cannot switch another admin of the unit off', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_ADMIN));

    await expect(
      userService.update('user-9', { isActive: false }, SDIT_ADMIN)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("a unit admin can still correct the kepala sekolah's name", async () => {
    prismaMock.user.findFirst.mockResolvedValue(account(RoleCode.SDIT_KEPALA_SEKOLAH));

    await userService.update('user-9', { name: 'Nama Benar' }, SDIT_ADMIN);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("a unit admin can change a teacher's email", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(account(RoleCode.SDIT_GURU))
      .mockResolvedValueOnce(null); // the new email is free

    await userService.update('user-9', { email: 'baru@example.test' }, SDIT_ADMIN);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("Super Admin can change the kepala sekolah's email", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(account(RoleCode.SDIT_KEPALA_SEKOLAH))
      .mockResolvedValueOnce(null);

    await userService.update('user-9', { email: 'baru@example.test' }, SUPER);

    expect(prismaMock.user.update).toHaveBeenCalled();
  });
});

describe('listing accounts by realm', () => {
  it('filters on an active role in that realm, across every page', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    Object.assign(prismaMock.user, { findMany, count });

    await userService.findAll({ page: 2, limit: 10, realm: 'SD_IT' } as never, {
      roleCode: RoleCode.SUPER_ADMIN,
      unitId: null,
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.userRoles).toEqual({
      some: expect.objectContaining({ isActive: true, role: { realm: 'SD_IT' } }),
    });
    // The count uses the same filter, so the footer and the pages agree.
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
  });
});
