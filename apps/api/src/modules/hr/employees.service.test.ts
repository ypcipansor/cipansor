import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    teacher: { create: vi.fn(), update: vi.fn() },
    staff: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from './hr.service';

const mocked = prisma as unknown as {
  user: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  teacher: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  staff: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('hr getEmployees', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to TEACHER + STAFF and paginates', async () => {
    mocked.user.findMany.mockResolvedValue([]);
    mocked.user.count.mockResolvedValue(0);

    await getEmployees({ page: 2, limit: 10 });

    expect(mocked.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('narrows to one role when asked', async () => {
    mocked.user.findMany.mockResolvedValue([]);
    mocked.user.count.mockResolvedValue(0);

    await getEmployees({ page: 1, limit: 20, role: 'STAFF' });

    expect(mocked.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'STAFF' }),
      }),
    );
  });

  it('includes unit, teacher and staff relations — the HR table reads all three', async () => {
    mocked.user.findMany.mockResolvedValue([]);
    mocked.user.count.mockResolvedValue(0);

    await getEmployees({ page: 1, limit: 20 });

    expect(mocked.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          unit: { select: { id: true, name: true } },
          teacher: true,
          staff: true,
        }),
      }),
    );
  });

  it('never selects credential columns', async () => {
    mocked.user.findMany.mockResolvedValue([]);
    mocked.user.count.mockResolvedValue(0);

    await getEmployees({ page: 1, limit: 20 });

    const select = mocked.user.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('twoFactorSecret');
    expect(select).not.toHaveProperty('twoFactorRecoveryCodes');
    expect(select).not.toHaveProperty('resetTokenHash');
    expect(mocked.user.findMany.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('reports the total so the page can show a count, not an empty roster', async () => {
    mocked.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
    mocked.user.count.mockResolvedValue(4);

    const result = await getEmployees({ page: 1, limit: 20 });

    expect(result.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
  });

  it('searches name, email and both employee profiles', async () => {
    mocked.user.findMany.mockResolvedValue([]);
    mocked.user.count.mockResolvedValue(0);

    await getEmployees({ page: 1, limit: 20, search: 'sri' });

    const where = mocked.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'sri', mode: 'insensitive' } },
      { email: { contains: 'sri', mode: 'insensitive' } },
      { teacher: { nip: { contains: 'sri', mode: 'insensitive' } } },
      { staff: { nip: { contains: 'sri', mode: 'insensitive' } } },
    ]);
  });
});

describe('hr getEmployeeById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the user with both profile relations', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 'u-1', teacher: null, staff: {} });

    const result = await getEmployeeById('u-1');

    expect(result).toMatchObject({ id: 'u-1' });
    expect(mocked.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-1' } }),
    );
  });

  it('never selects credential columns for the detail view', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 'u-1' });

    await getEmployeeById('u-1');

    const select = mocked.user.findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('twoFactorSecret');
    expect(mocked.user.findUnique.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('returns null for an unknown id so the controller can 404', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    expect(await getEmployeeById('nope')).toBeNull();
  });
});

describe('hr createEmployee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a duplicate email before touching the transaction', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      createEmployee({
        name: 'A',
        email: 'a@x.id',
        role: 'STAFF',
        unitId: 'unit-1',
        position: 'Petugas',
      }),
    ).rejects.toThrow(/already exists/i);

    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('creates a Staff row for a STAFF employee', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    const txStaffCreate = vi.fn();
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
        teacher: { create: vi.fn() },
        staff: { create: txStaffCreate },
      }),
    );

    await createEmployee({
      name: 'Sri',
      email: 'sri@x.id',
      role: 'STAFF',
      unitId: 'unit-1',
      position: 'Petugas Kesehatan',
      department: 'Kesehatan',
    });

    expect(txStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          position: 'Petugas Kesehatan',
          department: 'Kesehatan',
        }),
      }),
    );
  });

  it('requires a position for a STAFF employee — a Staff row cannot be built without it', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
        teacher: { create: vi.fn() },
        staff: { create: vi.fn() },
      }),
    );

    await expect(
      createEmployee({
        name: 'Sri',
        email: 'sri@x.id',
        role: 'STAFF',
        unitId: 'unit-1',
      }),
    ).rejects.toThrow(/position/i);
  });

  it('creates a Teacher row (not Staff) for a TEACHER employee', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    const txTeacherCreate = vi.fn();
    const txStaffCreate = vi.fn();
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
        teacher: { create: txTeacherCreate },
        staff: { create: txStaffCreate },
      }),
    );

    await createEmployee({
      name: 'Ust. A',
      email: 'a@x.id',
      role: 'TEACHER',
      unitId: 'unit-1',
    });

    expect(txTeacherCreate).toHaveBeenCalled();
    expect(txStaffCreate).not.toHaveBeenCalled();
  });
});

describe('hr updateEmployee / deleteEmployee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404s on an unknown employee', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    await expect(updateEmployee('nope', { name: 'X' })).rejects.toThrow(/not found/i);
  });

  it('soft-deletes the user and both profiles rather than removing rows', async () => {
    const txUserUpdate = vi.fn().mockResolvedValue({
      id: 'u-1',
      teacher: { id: 't-1' },
      staff: { id: 's-1' },
    });
    const txTeacherUpdate = vi.fn();
    const txStaffUpdate = vi.fn();
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { update: txUserUpdate },
        teacher: { update: txTeacherUpdate },
        staff: { update: txStaffUpdate },
      }),
    );

    await deleteEmployee('u-1');

    expect(txUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false }),
      }),
    );
    // NIP is released too, or a later employee cannot reuse the number.
    expect(txTeacherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nip: null }) }),
    );
    expect(txStaffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nip: null }) }),
    );
  });

  it('frees the email so the address can be reused', async () => {
    const txUserUpdate = vi.fn().mockResolvedValue({ id: 'u-1' });
    mocked.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ user: { update: txUserUpdate }, teacher: { update: vi.fn() }, staff: { update: vi.fn() } }),
    );

    await deleteEmployee('u-1');

    const email = txUserUpdate.mock.calls[0][0].data.email as string;
    expect(email).toMatch(/^deleted_u-1_\d+@example\.com$/);
  });
});
