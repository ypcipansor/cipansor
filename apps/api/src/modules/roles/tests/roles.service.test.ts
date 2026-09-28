import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The role-switch service has exactly one public method that mutates
 * assignments and mints a session: `switchRoleAndIssueSession`, which runs the
 * lock protocol and the account-state re-check in one transaction.
 *
 * An earlier `switchRole(userId, roleAssignmentId)` — a plain read, an
 * `updateMany`, an `update`, no lock and no account-state check — was left
 * behind after the controller moved to the transactional method. It is
 * unreachable, but a dead writer that predates the protocol is a trap: the
 * lock protocol in `utils/role-assignment-lock.ts` is only sound if every
 * writer takes the same locks in the same order, and a future caller reaching
 * for the shorter name would silently reintroduce the suspension race this PR
 * closes. This test fails if the unlocked method is ever re-added.
 */
describe('RolesService exposes one assignment-writing switch path', () => {
  const source = readFileSync(join(__dirname, '..', 'roles.service.ts'), 'utf8');

  it('does not define the legacy unlocked `switchRole` method', () => {
    // Match a method declaration, not the transactional `switchRoleAndIssueSession`.
    expect(source).not.toMatch(/\basync\s+switchRole\s*\(/);
  });
});

const { prismaMock, lockUserRowsMock, lockUserAndAssignmentsMock } = vi.hoisted(() => {
  const prismaMock: any = {
    userRoleAssignment: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    boardMemberSuspension: { findFirst: vi.fn() },
    refreshToken: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(prismaMock)),
  };
  return {
    prismaMock,
    lockUserRowsMock: vi.fn(),
    lockUserAndAssignmentsMock: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'a', refreshToken: 'r' })),
  getExpirationDate: vi.fn(() => new Date('2030-01-01')),
}));
vi.mock('@/utils/role-assignment-lock', () => ({
  lockUserRows: (...args: unknown[]) => lockUserRowsMock(...args),
  lockUserAndAssignments: (...args: unknown[]) => lockUserAndAssignmentsMock(...args),
}));

import { RolesService } from '../roles.service';

const service = new RolesService();

const liveAssignment = {
  id: 'assign-2',
  roleId: 'role-pembina',
  unitId: null,
  isPrimary: false,
  role: { code: 'YAYASAN_PEMBINA', permissions: [] },
  unit: null,
  user: {
    id: 'u-1',
    email: 'u@cipansor.or.id',
    role: 'ADMIN',
    unitId: null,
    isTwoFactorEnabled: true,
  },
};

describe('RolesService.switchRoleAndIssueSession — 2FA for yayasan organs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => unknown) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'u-1' }]);
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValue(null);
    prismaMock.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);
    prismaMock.userRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userRoleAssignment.update.mockResolvedValue({ id: 'assign-2' });
    prismaMock.refreshToken.create.mockResolvedValue({});
  });

  // 2FA wajib bagi organ yayasan (keputusan 2026-09-24), di peran mana pun.
  it('menolak pindah ke peran Pembina tanpa 2FA', async () => {
    prismaMock.userRoleAssignment.findFirst.mockResolvedValue({
      ...liveAssignment,
      user: { ...liveAssignment.user, isTwoFactorEnabled: false },
    });

    await expect(service.switchRoleAndIssueSession('u-1', 'assign-2')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('mengizinkan pindah ke peran Pembina dengan 2FA aktif', async () => {
    const result = await service.switchRoleAndIssueSession('u-1', 'assign-2');

    expect(result.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(prismaMock.userRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-2' },
      data: { isPrimary: true },
    });
  });
});
