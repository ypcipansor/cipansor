import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `RolesService.removeRoleAssignment` — the legacy-column sweep.
 *
 * The deprecated `users.role` column is only rewritten by `assignRoleToUser`,
 * so deleting the last assignment used to leave it behind. Refresh and the 2FA
 * completion fall back to that column for an account that never held an
 * assignment, so a revoked Super Admin kept re-minting its own role. The
 * revocation must therefore clear the column when the last assignment goes,
 * and must leave it alone while other assignments remain.
 */
const { prismaMock } = vi.hoisted(() => {
  const prismaMock: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    userRoleAssignment: {
      findUnique: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    boardSuspensionPlhAssignment: { findFirst: vi.fn() },
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
vi.mock('@/lib/realtime', () => ({ disconnectUserSockets: vi.fn() }));

import { RolesService, type RoleActor } from '../roles.service';

const service = new RolesService();

// The revoke path is authorized from the verified token; a Super Admin actor
// keeps this suite focused on the legacy-column sweep (the RBAC matrix lives in
// `role-assignment-scope.test.ts`).
const superAdmin: RoleActor = { sub: 'actor-sa', roleCode: 'SUPER_ADMIN', unitId: null };

describe('RolesService.removeRoleAssignment legacy-column sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userRoleAssignment.findUnique.mockResolvedValue({
      id: 'assign-1',
      userId: 'user-1',
      role: { code: 'SMPIT_GURU', realm: 'SMP_IT' },
    });
    prismaMock.boardSuspensionPlhAssignment.findFirst.mockResolvedValue(null);
    prismaMock.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('clears the deprecated users.role when the last assignment is revoked', async () => {
    prismaMock.userRoleAssignment.count.mockResolvedValue(0);

    await service.removeRoleAssignment(superAdmin, 'assign-1');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: null },
    });
  });

  it('keeps the deprecated users.role while other assignments remain', async () => {
    prismaMock.userRoleAssignment.count.mockResolvedValue(1);

    await service.removeRoleAssignment(superAdmin, 'assign-1');

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
