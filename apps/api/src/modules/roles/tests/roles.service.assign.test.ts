import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `RolesService.assignRoleToUser` — the privilege-escalation guard.
 *
 * `POST /roles/assign` is guarded by `authorize(SUPER_ADMIN, UNIT_ADMIN)`, so a
 * unit admin can reach the route. Before this guard the only role rule was
 * `findOrganConflict`, which stops a person holding two yayasan organs but says
 * nothing about *who may grant which role* — so a unit admin could mint
 * SUPER_ADMIN, another unit's admin, or a governance role for any account, the
 * same escalation `AuthService.createUser` already refuses. The two doors must
 * agree: only a Super Admin may grant an admin-level or governance-level role.
 *
 * `actorRoleCode` is optional so internal/direct callers that predate the guard
 * keep working; the controller always passes `req.user.roleCode`.
 */
const { prismaMock } = vi.hoisted(() => {
  const prismaMock: any = {
    user: { findUnique: vi.fn() },
    role: { findUnique: vi.fn() },
    userRoleAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    studentParent: { findFirst: vi.fn() },
    // `assignRoleToUser` wraps the insert in the shared lock protocol; the
    // transaction runner invokes the callback with the same mock as `tx`.
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(prismaMock)),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return { prismaMock };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'a', refreshToken: 'r' })),
  getExpirationDate: vi.fn(() => new Date('2030-01-01')),
}));

import { RolesService } from '../roles.service';

const service = new RolesService();

describe('RolesService.assignRoleToUser privilege guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'target-1' });
    prismaMock.userRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.userRoleAssignment.findMany.mockResolvedValue([]);
    prismaMock.userRoleAssignment.create.mockResolvedValue({
      id: 'assign-new',
      role: { code: 'SDIT_GURU' },
      unit: null,
    });
  });

  it('refuses a unit admin granting a SUPER_ADMIN role', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-super', code: 'SUPER_ADMIN' });

    await expect(
      service.assignRoleToUser('target-1', 'role-super', undefined, false, 'SDIT_ADMIN')
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prismaMock.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses a unit admin granting another unit admin role', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-admin', code: 'SMAQ_ADMIN' });

    await expect(
      service.assignRoleToUser('target-1', 'role-admin', undefined, false, 'SDIT_ADMIN')
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a unit admin granting a governance role', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-pembina', code: 'YAYASAN_PEMBINA' });

    await expect(
      service.assignRoleToUser('target-1', 'role-pembina', undefined, false, 'SDIT_ADMIN')
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a Super Admin to grant an admin role', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-admin', code: 'SMAQ_ADMIN' });

    await expect(
      service.assignRoleToUser('target-1', 'role-admin', undefined, false, 'SUPER_ADMIN')
    ).resolves.toMatchObject({ id: 'assign-new' });
  });

  it('allows a unit admin to grant a non-admin, non-governance role', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-guru', code: 'SDIT_GURU' });

    await expect(
      service.assignRoleToUser('target-1', 'role-guru', undefined, false, 'SDIT_ADMIN')
    ).resolves.toMatchObject({ id: 'assign-new' });
  });
});
