import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Until this file's fix, POST /roles/assign took any roleId for any user at any
// unit from any account in the legacy UNIT_ADMIN bucket: the unit admins and
// every yayasan organ. One request made a unit admin, or a board member without
// 2FA, a Super Admin. Removing and setting a primary role had the same hole.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/realtime', () => ({ disconnectUserSockets: vi.fn() }));
vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn() },
    userRoleAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    boardSuspensionPlhAssignment: { findFirst: vi.fn() },
    studentParent: { findFirst: vi.fn() },
    // The writers wrap their read-then-write in the shared lock protocol; the
    // transaction runner invokes the callback with the same mock as `tx`.
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(prisma)),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import { RolesService, type RoleActor } from '../roles.service';

const ROLES: Record<string, { id: string; code: string; realm: string }> = {};
for (const [code, realm] of [
  ['SUPER_ADMIN', 'GLOBAL'],
  ['SMPIT_ADMIN', 'SMP_IT'],
  ['SDIT_ADMIN', 'SD_IT'],
  ['YAYASAN_KETUA', 'YAYASAN'],
  ['YAYASAN_PENGAWAS', 'YAYASAN'],
  ['SMPIT_GURU', 'SMP_IT'],
  ['SMPIT_TATA_USAHA', 'SMP_IT'],
  ['SDIT_GURU', 'SD_IT'],
  ['PERAWAT', 'YAYASAN'],
  ['USTADZ', 'PESANTREN'],
]) {
  ROLES[code] = { id: `role-${code}`, code, realm };
}

const superAdmin: RoleActor = { sub: 'u-sa', roleCode: 'SUPER_ADMIN', unitId: null };
const smpAdmin: RoleActor = { sub: 'u-smp-admin', roleCode: 'SMPIT_ADMIN', unitId: 'unit-smp' };
const ketua: RoleActor = { sub: 'u-ketua', roleCode: 'YAYASAN_KETUA', unitId: null };

const m = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  role: Record<string, ReturnType<typeof vi.fn>>;
  userRoleAssignment: Record<string, ReturnType<typeof vi.fn>>;
  boardSuspensionPlhAssignment: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id }));
  m.role.findUnique.mockImplementation(async ({ where }: any) =>
    where.id
      ? (Object.values(ROLES).find((r) => r.id === where.id) ?? null)
      : (ROLES[where.code] ?? null)
  );
  m.userRoleAssignment.findFirst.mockResolvedValue(null);
  m.userRoleAssignment.findMany.mockResolvedValue([]);
  m.userRoleAssignment.create.mockImplementation(async ({ data }: any) => data);
  m.userRoleAssignment.delete.mockResolvedValue({});
  m.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });
  m.userRoleAssignment.count.mockResolvedValue(1);
  m.userRoleAssignment.update.mockResolvedValue({});
  m.userRoleAssignment.updateMany.mockResolvedValue({ count: 0 });
  m.boardSuspensionPlhAssignment.findFirst.mockResolvedValue(null);
});

const service = new RolesService();
const assign = (actor: RoleActor, userId: string, code: string, unitId?: string) =>
  service.assignRoleToUser(actor, userId, ROLES[code].id, unitId);

describe('assigning a role: a unit admin stays inside their unit and below their level', () => {
  it.each([
    ['SUPER_ADMIN to themselves', 'u-smp-admin', 'SUPER_ADMIN'],
    ['SUPER_ADMIN to someone else', 'u-guru', 'SUPER_ADMIN'],
    ['another school’s admin role', 'u-guru', 'SDIT_ADMIN'],
    ['their own admin role', 'u-guru', 'SMPIT_ADMIN'],
    ['a yayasan organ', 'u-guru', 'YAYASAN_KETUA'],
    ['another school’s role', 'u-guru', 'SDIT_GURU'],
    ['a pesantren role', 'u-guru', 'USTADZ'],
    ['a role to themselves, even their own school’s', 'u-smp-admin', 'SMPIT_GURU'],
  ])('refuses %s', async (_label, userId, code) => {
    await expect(assign(smpAdmin, userId, code)).rejects.toMatchObject({ statusCode: 403 });
    expect(m.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses their own school’s role at another unit', async () => {
    await expect(assign(smpAdmin, 'u-guru', 'SMPIT_GURU', 'unit-sd')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(m.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('assigns their own school’s role, in their own unit when none is given', async () => {
    await assign(smpAdmin, 'u-guru', 'SMPIT_GURU');
    expect(m.userRoleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-guru',
          unitId: 'unit-smp',
          assignedBy: 'u-smp-admin',
        }),
      })
    );
  });

  it('assigns a support role (nurse) in their own unit', async () => {
    await assign(smpAdmin, 'u-perawat', 'PERAWAT', 'unit-smp');
    expect(m.userRoleAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a yayasan organ acting as an admin, even for an ordinary role', async () => {
    await expect(assign(ketua, 'u-ketua', 'SUPER_ADMIN')).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(assign(ketua, 'u-guru', 'SMPIT_GURU', 'unit-smp')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(m.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('leaves Super Admin unrestricted', async () => {
    await assign(superAdmin, 'u-new-admin', 'SUPER_ADMIN');
    await assign(superAdmin, 'u-pengawas', 'YAYASAN_PENGAWAS');
    await assign(superAdmin, 'u-guru', 'SDIT_GURU', 'unit-sd');
    expect(m.userRoleAssignment.create).toHaveBeenCalledTimes(3);
  });
});

describe('removing an assignment', () => {
  const assignment = (code: string, unitId: string | null, userId = 'u-guru') => ({
    id: 'a-1',
    userId,
    unitId,
    role: { code, realm: ROLES[code].realm },
  });

  it.each([
    ['a Super Admin assignment', assignment('SUPER_ADMIN', null, 'u-sa')],
    ['a yayasan organ', assignment('YAYASAN_KETUA', null, 'u-ketua')],
    ['another unit’s assignment', assignment('SDIT_GURU', 'unit-sd')],
    ['their own admin assignment', assignment('SMPIT_ADMIN', 'unit-smp', 'u-smp-admin')],
  ])('refuses %s', async (_label, row) => {
    m.userRoleAssignment.findUnique.mockResolvedValue(row);
    await expect(service.removeRoleAssignment(smpAdmin, 'a-1')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(m.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it('removes their own school’s role in their unit', async () => {
    m.userRoleAssignment.findUnique.mockResolvedValue(assignment('SMPIT_GURU', 'unit-smp'));
    await service.removeRoleAssignment(smpAdmin, 'a-1');
    expect(m.userRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { id: 'a-1' } });
  });

  it('refuses to revoke a Plh assignment an active suspension depends on', async () => {
    m.userRoleAssignment.findUnique.mockResolvedValue(assignment('SMPIT_GURU', 'unit-smp'));
    m.boardSuspensionPlhAssignment.findFirst.mockResolvedValue({ id: 'dep-1' });
    await expect(service.removeRoleAssignment(smpAdmin, 'a-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(m.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
  });
});

describe('setting the primary role', () => {
  it('refuses an assignment at another unit', async () => {
    m.userRoleAssignment.findFirst.mockResolvedValue({
      id: 'a-1',
      userId: 'u-guru',
      unitId: 'unit-sd',
      role: { code: 'SDIT_GURU', realm: 'SD_IT' },
    });
    await expect(service.setPrimaryRole(smpAdmin, 'u-guru', 'a-1')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(m.userRoleAssignment.updateMany).not.toHaveBeenCalled();
    expect(m.userRoleAssignment.update).not.toHaveBeenCalled();
  });

  it('sets it for their own school’s role in their unit', async () => {
    m.userRoleAssignment.findFirst.mockResolvedValue({
      id: 'a-1',
      userId: 'u-guru',
      unitId: 'unit-smp',
      role: { code: 'SMPIT_TATA_USAHA', realm: 'SMP_IT' },
    });
    await service.setPrimaryRole(smpAdmin, 'u-guru', 'a-1');
    expect(m.userRoleAssignment.update).toHaveBeenCalledTimes(1);
  });
});

describe('the role-management routes admit administrators only', async () => {
  const { default: router } = await import('../roles.routes');

  type Handler = (req: Request, res: Response, next: NextFunction) => void;
  type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] };
  };
  // [authenticate, guard, ...]: the guard is the route's second handler.
  function guardOf(method: string, path: string) {
    const layer = (router as unknown as { stack: Layer[] }).stack.find(
      (l) => l.route?.path === path && l.route.methods[method]
    );
    if (!layer?.route) throw new Error(`no ${method} ${path}`);
    return layer.route.stack[1].handle;
  }
  function run(guard: Handler, user: Record<string, unknown>) {
    const next = vi.fn();
    guard({ user } as unknown as Request, {} as Response, next as unknown as NextFunction);
    return next.mock.calls[0]?.[0];
  }

  const routes: [string, string][] = [
    ['post', '/assign'],
    ['delete', '/assignments/:id'],
    ['patch', '/users/:userId/primary'],
    ['get', '/users/:userId'],
  ];

  it.each(routes)('%s %s refuses a yayasan organ', (method, path) => {
    for (const roleCode of ['YAYASAN_KETUA', 'YAYASAN_ANGGOTA', 'YAYASAN_PENGAWAS']) {
      expect(run(guardOf(method, path), { role: 'UNIT_ADMIN', roleCode })).toMatchObject({
        statusCode: 403,
      });
    }
  });

  it.each(routes)('%s %s admits a unit admin and Super Admin', (method, path) => {
    expect(run(guardOf(method, path), { roleCode: 'SMPIT_ADMIN' })).toBe(undefined);
    expect(run(guardOf(method, path), { roleCode: 'SUPER_ADMIN' })).toBe(undefined);
  });
});
