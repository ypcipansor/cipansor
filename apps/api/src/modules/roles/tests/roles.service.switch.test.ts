import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `RolesService.switchRoleAndIssueSession` — the role switch, the account-state
 * re-validation, the token mint and the refresh-token insert run in ONE
 * transaction under the shared lock protocol.
 *
 * Finding 14: the old split (switch here, mint + insert in the controller)
 * let a suspension that committed in the gap delete every refresh token it
 * could see while the one created afterwards survived and authenticated away
 * the suspension. These tests pin the transaction shape: the user row is
 * locked first, then the assignment rows, the account state is re-checked at
 * the commit point, and no token is written for an unusable account.
 *
 * The order assertions matter as much as the outcome: the shared protocol
 * (`utils/role-assignment-lock.ts`) is only a protocol if every writer takes
 * the locks in the same order. Taking the assignment rows before the user row
 * would deadlock against `BoardSuspensionService` and `AuthService`.
 */
const order: string[] = [];
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
  lockUserRows: (...args: unknown[]) => {
    order.push('user-row');
    return lockUserRowsMock(...args);
  },
  lockUserAndAssignments: (...args: unknown[]) => {
    // The helper itself takes the user row first, then the assignment rows.
    order.push('user-row');
    order.push('assignment-rows');
    return lockUserAndAssignmentsMock(...args);
  },
}));

import { RolesService } from '../roles.service';

const service = new RolesService();

const liveAssignment = {
  id: 'assign-1',
  roleId: 'role-smp-admin',
  unitId: 'unit-smp',
  isPrimary: false,
  role: { code: 'SMPIT_ADMIN', permissions: ['PERM_1'] },
  unit: { id: 'unit-smp', name: 'SMP IT' },
  user: {
    id: 'u-1',
    email: 'u@cipansor.or.id',
    role: 'ADMIN',
    unitId: 'unit-smp',
    isTwoFactorEnabled: true,
  },
};

describe('RolesService.switchRoleAndIssueSession', () => {
  beforeEach(() => {
    // `resetAllMocks`, not `clearAllMocks`: the latter leaves a queued
    // `mockResolvedValueOnce` in place, so an assertion from one test leaks
    // into the next. Each test below re-establishes exactly the behaviour it
    // needs.
    vi.resetAllMocks();
    // `resetAllMocks` clears implementations, so the transaction runner (and
    // the lock-helper stubs, which are plain functions and unaffected) must be
    // re-established. The runner invokes the callback with the same mock as
    // `tx`, so every `tx.*` call lands on the mocks asserted below.
    prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => unknown) => cb(prismaMock));
    // The lock helpers are mocked; the only real `$queryRaw` is the account
    // claim, which must look like one live row on the happy path.
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'u-1' }]);
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValue(null);
    prismaMock.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);
    prismaMock.userRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userRoleAssignment.update.mockResolvedValue({ id: 'assign-1' });
    prismaMock.refreshToken.create.mockResolvedValue({});
    order.length = 0;
  });

  it('locks the user row before the assignment rows', async () => {
    await service.switchRoleAndIssueSession('u-1', 'assign-1');

    // The shared protocol locks the user's own row first, then its assignment
    // rows. Reversing this deadlocks against `BoardSuspensionService`,
    // `AuthService` and the correspondence draft writer, which all take the
    // user row first.
    expect(order[0]).toBe('user-row');
    expect(order.indexOf('assignment-rows')).toBeGreaterThan(order.indexOf('user-row'));
  });

  it('mints and stores the refresh token in the same transaction as the switch', async () => {
    const result = await service.switchRoleAndIssueSession('u-1', 'assign-1');

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(result.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(prismaMock.userRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
      data: { isPrimary: true },
    });
  });

  it('refuses to mint a token when the account is off at the commit point', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]); // claim: switched off

    await expect(service.switchRoleAndIssueSession('u-1', 'assign-1')).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses to mint a token when an ACTIVE suspension exists at the commit point', async () => {
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValueOnce({ id: 'susp-1' });

    await expect(service.switchRoleAndIssueSession('u-1', 'assign-1')).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('reads the assignment under the lock, not before it', async () => {
    await service.switchRoleAndIssueSession('u-1', 'assign-1');

    // The assignment lookup is the locked re-read: inactive or expired rows
    // must not be switchable even if a pre-flight saw them as live.
    const lookup = prismaMock.userRoleAssignment.findFirst.mock.calls[0][0];
    expect(lookup.where).toMatchObject({
      id: 'assign-1',
      userId: 'u-1',
      isActive: true,
    });
  });

  it('refuses to switch into an admin role without 2FA enabled', async () => {
    // Login forces an admin account through 2FA setup before it will issue a
    // session. Switch is a second door to the same session: an account whose
    // primary role is non-admin (so login never challenged it) could hold an
    // admin assignment and switch straight into it, minting an admin session
    // with 2FA never enabled.
    prismaMock.userRoleAssignment.findFirst.mockResolvedValue({
      ...liveAssignment,
      user: { ...liveAssignment.user, isTwoFactorEnabled: false },
    });

    await expect(service.switchRoleAndIssueSession('u-1', 'assign-1')).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});
