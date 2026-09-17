import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    unit: { findFirst: vi.fn() },
    role: { findUnique: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
}));
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn(async () => 'hashed') }));
vi.mock('@/utils/user-suspension', () => ({
  markUserSuspended: vi.fn(async () => undefined),
  invalidateUserSuspensionCache: vi.fn(async () => undefined),
}));

import { prisma } from '@/lib/prisma';
import { userService } from './user.service';
import { markUserSuspended, invalidateUserSuspensionCache } from '@/utils/user-suspension';
import { ApiError } from '@/middleware/error';
import type { CreateUserInput, UpdateUserInput } from './user.schema';

const mock = prisma as unknown as {
  user: Record<'findFirst' | 'findMany' | 'create' | 'update' | 'count', ReturnType<typeof vi.fn>>;
  unit: { findFirst: ReturnType<typeof vi.fn> };
  role: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe('user.service unit scoping (one admin per unit)', () => {
  const unitA = 'unit-a';
  const unitB = 'unit-b';

  it('rejects a unit admin creating an admin account', async () => {
    const input = { role: 'UNIT_ADMIN', unitId: unitA } as CreateUserInput;
    await expect(
      userService.create(input, { roleCode: 'SDIT_ADMIN', unitId: unitA })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a non-super creator making a SUPER_ADMIN', async () => {
    const input = { role: 'SUPER_ADMIN' } as CreateUserInput;
    await expect(
      userService.create(input, { roleCode: 'SDIT_ADMIN', unitId: unitA })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a unit admin creating a user in another unit", async () => {
    const input = { role: 'TEACHER', unitId: unitB } as CreateUserInput;
    await expect(
      userService.create(input, { roleCode: 'SDIT_ADMIN', unitId: unitA })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await Promise.resolve(mock.user.create)).mock.calls.length).toBe(0);
  });

  it("rejects a unit admin updating another unit's user", async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: unitB, email: 'x@y.z' });
    await expect(
      userService.update('u1', { name: 'X' } as UpdateUserInput, {
        roleCode: 'SDIT_ADMIN',
        unitId: unitA,
        sub: 'me',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a non-super changing a role', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: unitA, email: 'x@y.z' });
    await expect(
      userService.update('u1', { role: 'TEACHER' } as UpdateUserInput, {
        roleCode: 'SDIT_ADMIN',
        unitId: unitA,
        sub: 'me',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a non-super moving a user between units', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: unitA, email: 'x@y.z' });
    await expect(
      userService.update('u1', { unitId: unitB } as UpdateUserInput, {
        roleCode: 'SDIT_ADMIN',
        unitId: unitA,
        sub: 'me',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets SUPER_ADMIN create the single admin for a new unit', async () => {
    mock.user.findFirst.mockResolvedValue(null); // email free
    mock.unit.findFirst.mockResolvedValue({ id: unitB, type: 'SMA_QURAN' });
    mock.role.findUnique.mockResolvedValue({ id: 'role-smaq-admin', code: 'SMAQ_ADMIN' });
    mock.user.create.mockResolvedValue({
      id: 'new-admin',
      unit: { id: unitB },
      passwordHash: 'hashed',
    });

    const input = {
      name: 'Admin SMAQ',
      email: 'admin@smaq.sch.id',
      password: 'Secret123!',
      role: 'UNIT_ADMIN',
      unitId: unitB,
    } as CreateUserInput;
    const result = await userService.create(input, { roleCode: 'SUPER_ADMIN', unitId: null });
    expect(result).toHaveProperty('id', 'new-admin');
    // Role assignment provisioned together with the user
    const createArgs = mock.user.create.mock.calls[0][0];
    expect(createArgs.data.userRoles.create.roleId).toBe('role-smaq-admin');
    expect(createArgs.data.userRoles.create.isPrimary).toBe(true);
  });

  it('scopes findAll to the unit for unit admins', async () => {
    mock.user.findMany.mockResolvedValue([]);
    mock.user.count.mockResolvedValue(0);
    await userService.findAll(
      { page: 1, limit: 10 } as Parameters<typeof userService.findAll>[0],
      { roleCode: 'SDIT_ADMIN', unitId: unitA }
    );
    expect(mock.user.findMany.mock.calls[0][0].where.unitId).toBe(unitA);
  });

  it('does not scope findAll for SUPER_ADMIN', async () => {
    mock.user.findMany.mockResolvedValue([]);
    mock.user.count.mockResolvedValue(0);
    await userService.findAll(
      { page: 1, limit: 10 } as Parameters<typeof userService.findAll>[0],
      { roleCode: 'SUPER_ADMIN', unitId: null }
    );
    expect(mock.user.findMany.mock.calls[0][0].where.unitId).toBeUndefined();
  });
});

// keep the linter satisfied about the imported ApiError type usage
void ApiError;

describe('user.service suspension-cache invalidation', () => {
  const superUser = { roleCode: 'SUPER_ADMIN', unitId: null, sub: 'me' };

  it('primes the suspension cache when an admin deactivates an account', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: null, email: 'x@y.z', isActive: true });
    mock.user.update.mockResolvedValue({ id: 'u1', passwordHash: 'hashed' });

    await userService.update('u1', { isActive: false } as UpdateUserInput, superUser);

    // Without this the old access token kept authenticating for a whole TTL.
    expect(markUserSuspended).toHaveBeenCalledWith('u1');
    expect(invalidateUserSuspensionCache).not.toHaveBeenCalled();
  });

  it('drops the cached answer when an account is reactivated', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: null, email: 'x@y.z', isActive: false });
    mock.user.update.mockResolvedValue({ id: 'u1', passwordHash: 'hashed' });

    await userService.update('u1', { isActive: true } as UpdateUserInput, superUser);

    expect(invalidateUserSuspensionCache).toHaveBeenCalledWith('u1');
    expect(markUserSuspended).not.toHaveBeenCalled();
  });

  it('leaves the cache alone when the update touches neither state', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: null, email: 'x@y.z', isActive: true });
    mock.user.update.mockResolvedValue({ id: 'u1', passwordHash: 'hashed' });

    await userService.update('u1', { name: 'New Name' } as UpdateUserInput, superUser);

    expect(markUserSuspended).not.toHaveBeenCalled();
    expect(invalidateUserSuspensionCache).not.toHaveBeenCalled();
  });

  it('marks a soft-deleted account suspended so its token stops working', async () => {
    mock.user.findFirst.mockResolvedValue({ id: 'u1', unitId: null, email: 'x@y.z' });
    mock.user.update.mockResolvedValue({ id: 'u1' });

    await userService.delete('u1');

    expect(markUserSuspended).toHaveBeenCalledWith('u1');
  });
});
