import { describe, it, expect, beforeEach, vi } from 'vitest';
import { boardSuspensionService, SIGNING_KEY_SUSPENSION_LOCK } from '../board-suspension.service';
import { invalidateUserSuspensionCache } from '@/utils/user-suspension';
import { prisma } from '@/lib/prisma';

// Prisma is mocked so the service's control flow can be exercised without a
// database. The *locking* these tests assert — the `FOR UPDATE` re-reads and
// the ordered row locks taken on lift — is not something a mock can prove; it is
// proven against a real PostgreSQL in
// `apps/api/tests/integration/board-suspension-concurrency.integration.test.ts`.
// What is asserted here is that the service takes the lock and aborts on the
// state that lock reveals.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    boardMemberSuspension: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: { deleteMany: vi.fn() },
    userSigningKey: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    userRoleAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    boardSuspensionPlhAssignment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ deleted_at: null, is_active: true }]),
    // The Plh delegate+role advisory lock runs through `$executeRaw` (it returns
    // `void`). The serialization it provides is proven against real PostgreSQL in
    // the integration suite; here the mock only needs to not throw.
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

vi.mock('@/utils/user-suspension', () => ({
  markUserSuspended: vi.fn().mockResolvedValue(undefined),
  unmarkUserSuspended: vi.fn().mockResolvedValue(undefined),
  invalidateUserSuspensionCache: vi.fn().mockResolvedValue(undefined),
  isUserSuspended: vi.fn().mockResolvedValue(false),
}));

describe('BoardSuspensionService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` does not drain a `mockResolvedValueOnce` queue, so an
    // unconsumed `$queryRaw`/`findUnique` value leaks into the next test and
    // shifts every subsequent raw query by one. Reset them here and re-establish
    // the defaults the factory installed.
    (prisma.$queryRaw as any).mockReset();
    (prisma.$queryRaw as any).mockResolvedValue([{ deleted_at: null, is_active: true }]);
    (prisma.user.findUnique as any).mockReset();
    // The lift claims the row with a conditional update; one caller wins.
    (prisma.boardMemberSuspension.updateMany as any).mockResolvedValue({ count: 1 });
    // E-Sign soft-locks are claimed per key with a conditional update; one
    // caller wins.
    (prisma.userSigningKey.updateMany as any).mockResolvedValue({ count: 1 });
    // The suspension claims the account with a conditional update; one caller
    // wins unless a test overrides this to simulate a concurrent admin change.
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    // Rows written before the dependency table existed have no dependency
    // rows; the legacy single-assignment path is exercised explicitly below.
    (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([]);
    (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);
    // Defaults; a test that cares overrides them.
    (prisma.userSigningKey.findMany as any).mockResolvedValue([]);
    (prisma.role.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
  });

  it('suspends board member, deactivates account, soft-locks e-sign keys, and delegates Plh role', async () => {
    const mockUser = {
      id: 'user-pengurus',
      name: 'Pengurus Fulan',
      email: 'pengurus@cipansor.or.id',
      isActive: true,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_BENDAHARA' } }],
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockUser);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({
      id: 'susp-1',
      userId: 'user-pengurus',
      skNumber: 'SK/PENGAWAS/2026/001',
      status: 'ACTIVE',
    });
    (prisma.user.update as any).mockResolvedValue({
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([
      { id: 'key-1', lockedUntil: null },
      { id: 'key-2', lockedUntil: new Date('2026-02-01T00:00:00.000Z') },
    ]);
    (prisma.role.findFirst as any).mockResolvedValue({
      id: 'role-ketua-id',
      code: 'YAYASAN_KETUA',
    });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.userRoleAssignment.create as any).mockResolvedValue({ id: 'assign-1' });

    const suspension = await boardSuspensionService.suspendBoardMember(
      {
        userId: 'user-pengurus',
        skNumber: 'SK/PENGAWAS/2026/001',
        auditReason: 'Indikasi penyalahgunaan wewenang keuangan yayasan',
        plhUserId: 'user-sekretaris',
        plhRoleCode: 'YAYASAN_KETUA',
      },
      'issuer-pengawas',
      'YAYASAN_PENGAWAS'
    );

    expect(suspension.id).toBe('susp-1');
    // The deactivation is a conditional claim on the state that was just read,
    // stamped with a fresh ownership token so a later lift can prove the
    // `false` is still this suspension's own write.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
      },
      data: {
        isActive: false,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-pengurus' },
    });
    // E-Sign keys are soft-locked per key, conditionally on the observed
    // `lockedUntil`, so a lockout that lands in between is not clobbered.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: expect.any(Date) },
    });
    expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-sekretaris',
        roleId: 'role-ketua-id',
        isPrimary: false,
      },
    });
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plhAssignmentCreated: true,
          plhAssignmentId: 'assign-1',
        }),
      })
    );
  });

  it('aborts when an admin changes the account state between the read and the claim', async () => {
    // The snapshot read `isActive: true` / no writer, then an admin deactivated
    // the account before the conditional claim ran. The claim matches nothing
    // (count 0), so the suspension must not be created and must not overwrite
    // the admin's state with its own writer token.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.user.updateMany as any).mockResolvedValue({ count: 0 });

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/PENGAWAS/2026/009',
          auditReason: 'Indikasi penyalahgunaan wewenang keuangan yayasan',
        },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    // The compare-and-set is filtered on the values just read, including the
    // `null` writer and the `deletedAt: null` soft-delete guard — not on
    // `updatedAt`, and not unconditioned.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
      },
      data: {
        isActive: false,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
    });
  });

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA', 'SDIT_SISWA', 'SDIT_GURU'])(
    'refuses to suspend a non-Pengurus target (%s)',
    async (code) => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-x',
        isActive: true,
        deletedAt: null,
        userRoles: [{ role: { code } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-x', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    }
  );

  it('refuses a soft-deleted target even when isActive is still true', async () => {
    // A soft delete clears nothing about `isActive`, so the ACTIVE gate alone
    // let a removed account through: the suspension switched it off (a no-op
    // on paper) and minted a Plh role to replace someone the app had already
    // deleted.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: new Date('2026-04-01T00:00:00.000Z'),
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('rejects a future startDate at the service, not only at the edge', async () => {
    // Internal callers reach the service directly. A future date cannot defer
    // the deactivation the service performs immediately, so it is refused
    // rather than stored as a schedule that is not honoured.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          startDate: new Date(Date.now() + 86_400_000).toISOString(),
        },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the target is soft-deleted between the pre-flight read and the claim', async () => {
    // The pre-flight read saw a live row; the delete lands before the claim
    // acquires the row lock. The in-transaction `FOR UPDATE` re-check sees
    // `deleted_at` and the whole suspension aborts.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any).mockResolvedValueOnce([
      { deleted_at: new Date('2026-04-01T00:00:00.000Z') },
    ]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when an admin deactivates the target after preflight but before the lock', async () => {
    // Preflight saw `isActive: true`; an admin deactivation commits before the
    // transaction takes the row lock. The locked re-read sees the account is
    // already off, so the suspension must not create a second deactivation, a
    // signing-key lock, a refresh-token purge, or a Plh delegation for a board
    // member who is no longer active.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any).mockResolvedValueOnce([{ is_active: false, deleted_at: null }]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          plhUserId: 'user-sekretaris',
          plhRoleCode: 'YAYASAN_KETUA',
        },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the Pengurus role is revoked between preflight and the lock', async () => {
    // A role removal/expiry that commits in the gap leaves a target who is no
    // longer a Pengurus. Preflight cannot see it; the locked re-read can.
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any).mockResolvedValueOnce([{ is_active: true, deleted_at: null }]);
    // The locked snapshot now resolves no effective Pengurus assignment (the
    // query filters `isActive`/`expiresAt`, so a revoked or expired row simply
    // does not come back).
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      isActive: true,
      accountStateWriter: null,
      userRoles: [],
    });

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the Plh delegate is deactivated between the pre-flight read and the grant', async () => {
    // The delegate was active at pre-flight; an admin deactivates them before
    // the grant. Without the in-transaction re-claim under `FOR UPDATE`, the
    // suspension would still mint a Pengurus role for someone who cannot act.
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      })
      .mockResolvedValueOnce({
        id: 'user-sekretaris',
        isActive: true,
        deletedAt: null,
        userRoles: [{ role: { code: 'YAYASAN_SEKRETARIS' } }],
      })
      // The transactional re-read of the *target*: the Plh check runs after it.
      .mockResolvedValueOnce({
        isActive: true,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    // Target lock first, then the Plh lock — which sees the new state.
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ is_active: true, deleted_at: null }])
      .mockResolvedValueOnce([{ is_active: false, deleted_at: null }]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          plhUserId: 'user-sekretaris',
          plhRoleCode: 'YAYASAN_KETUA',
        },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the Plh delegate is soft-deleted between the pre-flight read and the grant', async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      })
      .mockResolvedValueOnce({
        id: 'user-sekretaris',
        isActive: true,
        deletedAt: null,
        userRoles: [{ role: { code: 'YAYASAN_SEKRETARIS' } }],
      })
      // The transactional re-read of the *target*: the Plh check runs after it.
      .mockResolvedValueOnce({
        isActive: true,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ is_active: true, deleted_at: null }])
      .mockResolvedValueOnce([{ is_active: true, deleted_at: new Date('2026-04-01') }]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          plhUserId: 'user-sekretaris',
          plhRoleCode: 'YAYASAN_KETUA',
        },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('keeps the per-key conditional lock so a lockout re-armed mid-flight survives', async () => {
    // Both keys are read with `lockedUntil: null`. The first claim matches,
    // the second does not (an unrelated lockout was armed after the read), so
    // only the claimed key enters the snapshot — the lift then cannot write a
    // stale `null` back over the newer lockout.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({ id: 'susp-lock' });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([
      { id: 'key-1', lockedUntil: null },
      { id: 'key-2', lockedUntil: null },
    ]);
    (prisma.userSigningKey.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await boardSuspensionService.suspendBoardMember(
      { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
      'issuer-pengawas',
      'YAYASAN_PENGAWAS'
    );

    // Each key is claimed against the value just observed, not blanket-matched.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
    });
    // Only the claimed key is captured, so the snapshot never claims a key it
    // did not actually replace.
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signingKeyLocks: { 'key-1': null },
        }),
      })
    );
  });

  it('refuses a second ACTIVE suspension for the same user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue({ skNumber: 'SK/LAMA' });

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/BARU', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas',
        'YAYASAN_PENGAWAS'
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reactivates an expired Plh assignment and records what to restore', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_ANGGOTA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({ id: 'susp-1' });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([]);
    (prisma.role.findFirst as any).mockResolvedValue({ id: 'role-ketua-id' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      id: 'assign-old',
      isActive: false,
      expiresAt: new Date('2020-01-01'),
    });

    await boardSuspensionService.suspendBoardMember(
      {
        userId: 'user-pengurus',
        skNumber: 'SK/1',
        auditReason: 'alasan audit yang panjang',
        plhUserId: 'user-sekretaris',
        plhRoleCode: 'YAYASAN_KETUA',
      },
      'issuer-pengawas',
      'YAYASAN_PENGAWAS'
    );

    expect(prisma.userRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-old' },
      data: { isActive: true, expiresAt: null },
    });
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plhAssignmentCreated: false,
          plhAssignmentId: 'assign-old',
          plhAssignmentRestore: expect.objectContaining({ isActive: false }),
        }),
      })
    );
  });

  it('lifts suspension, reactivates account, restores captured e-sign lockouts and removes the Plh it created', async () => {
    const mockSuspension = {
      id: 'susp-1',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhUserId: 'user-sekretaris',
      plhRoleCode: 'YAYASAN_KETUA',
      plhAssignmentCreated: true,
      plhAssignmentId: 'assign-new',
      plhAssignmentRestore: null,
      signingKeyLocks: { 'key-1': null, 'key-2': '2026-01-01T00:00:00.000Z' },
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    // The row still carries the suspension's own write, so it is restored.
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const updated = await boardSuspensionService.liftBoardSuspension(
      'susp-1',
      'lifter-pembina',
      'Penyelidikan selesai'
    );

    expect(updated.status).toBe('LIFTED');
    // The reactivation is a conditional claim: `id`, `isActive: false`,
    // `deletedAt: null` and the exact writer token all in one statement.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      },
      data: {
        isActive: true,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
    });
    // Both restores are gated on the sentinel the suspension itself wrote, so
    // a key whose lock state changed in the meantime is left alone.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: null },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'assign-new' },
    });
  });

  it('does not erase a lockout re-armed after the suspension', async () => {
    // Suspension captured `key-1: null` and wrote the sentinel. Someone then
    // locked that key for a newer, unrelated reason, so `lockedUntil` no longer
    // matches the sentinel the suspension wrote. The lift must leave it alone
    // rather than writing the stale `null` back and clearing the lockout.
    const mockSuspension = {
      id: 'susp-lock',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhUserId: null,
      plhRoleCode: null,
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      plhAssignmentRestore: null,
      signingKeyLocks: { 'key-1': null },
      accountStateSnapshot: { isActiveBefore: false },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      accountStateWriter: 'asw_admin_other',
    });

    await boardSuspensionService.liftBoardSuspension('susp-lock', 'lifter', 'Pulih');

    // The restore is scoped to the sentinel, so a key re-armed in the meantime
    // is not matched and survives.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: null },
    });
  });

  it('suspends signing by a reversible lock and never writes the audited revocation field', async () => {
    // Product decision (2026-09-21): a suspension is temporary, so it locks
    // signing via `lockedUntil` and leaves `revokedAt` untouched. Writing
    // `revokedAt` would be irreversible on lift (a revoked key stays revoked),
    // and "un-revoking" is exactly what the e-sign lifecycle forbids. This pins
    // the decision to the code so the PR description cannot drift back to
    // claiming a formal revocation.
    const mockUser = {
      id: 'user-pengurus',
      name: 'Pengurus Fulan',
      email: 'pengurus@cipansor.or.id',
      isActive: true,
      userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_BENDAHARA' } }],
    };
    (prisma.user.findUnique as any).mockResolvedValue(mockUser);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({ id: 'susp-1', status: 'ACTIVE' });
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([{ id: 'key-1', lockedUntil: null }]);
    (prisma.userSigningKey.updateMany as any).mockResolvedValue({ count: 1 });

    await boardSuspensionService.suspendBoardMember(
      {
        userId: 'user-pengurus',
        skNumber: 'SK/PENGAWAS/2026/010',
        auditReason: 'Indikasi penyalahgunaan wewenang keuangan yayasan',
      },
      'issuer-pengawas',
      'YAYASAN_PENGAWAS'
    );

    for (const call of (prisma.userSigningKey.updateMany as any).mock.calls) {
      expect(call[0].data).not.toHaveProperty('revokedAt');
      expect(call[0].data).not.toHaveProperty('revokedReason');
    }
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
    });
  });


  it('leaves a pre-existing effective Plh assignment alone on lift', async () => {
    const mockSuspension = {
      id: 'susp-2',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      plhAssignmentRestore: null,
      signingKeyLocks: null,
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await boardSuspensionService.liftBoardSuspension('susp-2', 'lifter-pembina', 'Pulih');

    expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('restores a reactivated (previously inactive) Plh assignment on lift instead of deleting it', async () => {
    const mockSuspension = {
      id: 'susp-3',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhAssignmentCreated: false,
      plhAssignmentId: 'assign-old',
      plhAssignmentRestore: { isActive: false, expiresAt: '2020-01-01T00:00:00.000Z' },
      signingKeyLocks: null,
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await boardSuspensionService.liftBoardSuspension('susp-3', 'lifter-pembina', 'Pulih');

    expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: 'assign-old' },
      data: { isActive: false, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
  });

  it('does not undo an admin deactivation that landed during the suspension', async () => {
    // The suspension switched the account off and stamped `asw_ours`. An
    // admin then deactivated it again for an unrelated reason, stamping a new
    // token. The lift must not claim that `false` as its own.
    const mockSuspension = {
      id: 'susp-adm',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_ours',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      signingKeyLocks: null,
      accountStateSnapshot: { isActiveBefore: true, writer: 'asw_ours' },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      // A different writer owns the current value.
      accountStateWriter: 'asw_admin',
    });

    await boardSuspensionService.liftBoardSuspension('susp-adm', 'lifter', 'Pulih');

    // The write is attempted, but its `where` requires the suspension's own
    // writer token — which the admin's deactivation replaced. The database
    // therefore matches zero rows and the admin's `false` survives.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_ours',
      },
      data: {
        isActive: true,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
    });
  });

  it('reactivates when the suspension still owns the current deactivation', async () => {
    const mockSuspension = {
      id: 'susp-own',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_ours',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      signingKeyLocks: null,
      accountStateSnapshot: { isActiveBefore: true, writer: 'asw_ours' },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      accountStateWriter: 'asw_ours',
    });

    await boardSuspensionService.liftBoardSuspension('susp-own', 'lifter', 'Pulih');

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_ours',
      },
      data: {
        isActive: true,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
    });
  });

  it('refuses to lift a suspension that is not ACTIVE', async () => {
    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
      id: 'susp-4',
      status: 'LIFTED',
    });

    await expect(
      boardSuspensionService.liftBoardSuspension('susp-4', 'lifter', 'Pulih')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('shared Plh delegation dependencies', () => {
    const sharedAssignmentId = 'assign-shared';

    function suspension(id: string, created: boolean) {
      return {
        id,
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: created,
        plhAssignmentId: sharedAssignmentId,
        plhAssignmentRestore: null,
        signingKeyLocks: null,
        accountStateSnapshot: { isActiveBefore: true },
      };
    }

    it('keeps a shared Plh assignment alive until the last ACTIVE dependent is lifted (creator first)', async () => {
      // Suspension A minted the assignment; B reused the same effective
      // delegate+role. Lifting A must not delete what B still relies on.
      const a = suspension('susp-a', true);
      const b = suspension('susp-b', false);

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      // B is still ACTIVE and depends on the same assignment.
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(1);
      // B's dependency row is the heir that must inherit the `created` flag.
      (prisma.boardSuspensionPlhAssignment.findFirst as any).mockResolvedValue({
        id: 'dep-b',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      // Provenance is handed to the surviving dependent *before* A's row is
      // deleted, so B still knows it must ultimately delete the assignment.
      expect(prisma.boardSuspensionPlhAssignment.update).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
        data: { created: true },
      });
      expect(prisma.boardSuspensionPlhAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dep-a' },
      });
      // The shared assignment survives: the last dependent has not lifted yet.
      expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the suspension-minted assignment when the last dependent lifts after the creator (creator first)', async () => {
      // Follow-on to the test above: A minted it and transferred `created` to
      // B on the way out; B is now the last dependent and must delete it. This
      // is the regression the old code failed — B lifted with `created: false`
      // and left the assignment active forever.
      const b = suspension('susp-b', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(b);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...b,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      // B inherited provenance, so its row now carries `created: true`.
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-b', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-b', 'lifter', 'Pulih');

      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: sharedAssignmentId },
      });
    });

    it('transfers the reactivation restore payload to the surviving dependent', async () => {
      // The creator had *reactivated* an expired pre-existing row, so its
      // provenance is a restore payload rather than `created`. Lifting it while
      // a dependent remains must move the payload, or the last dependent would
      // leave the reactivated row active instead of restoring it.
      const a = suspension('susp-a', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      const restore = { isActive: false, expiresAt: null };
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: false, restore },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(1);
      (prisma.boardSuspensionPlhAssignment.findFirst as any).mockResolvedValue({
        id: 'dep-b',
        created: false,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      expect(prisma.boardSuspensionPlhAssignment.update).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
        data: { created: false, restore },
      });
      expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userRoleAssignment.updateMany).not.toHaveBeenCalled();
    });

    it('releases the shared assignment when the last dependent lifts (creator first)', async () => {
      const b = suspension('susp-b', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(b);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...b,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-b', assignmentId: sharedAssignmentId, created: false, restore: null },
      ]);
      // No other ACTIVE suspension needs it anymore.
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-b', 'lifter', 'Pulih');

      // `created: false` + no restore ⇒ the pre-existing assignment is left
      // alone, but the dependency row is gone.
      expect(prisma.boardSuspensionPlhAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
      });
    });

    it('deletes the shared assignment only when the minting suspension lifts last', async () => {
      // Reverse order: B lifts first and leaves the assignment for A; then A
      // lifts and — as the creator — removes it.
      const a = suspension('susp-a', true);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: sharedAssignmentId },
      });
    });
  });

  describe('privilege-escalation and snapshot guards', () => {
    it.each(['YAYASAN_PEMBINA', 'YAYASAN_SEKRETARIS', 'SDIT_ADMIN'])(
      'rejects issuance by a role outside the issue policy (%s) even when the route would not run',
      async (roleCode) => {
        // Service-level re-enforcement: the route guards PASS this role for
        // read/lift, so the only thing stopping an internal caller is the
        // service check. The target is a valid Pengurus — the rejection must
        // come from the actor's role, not the target.
        (prisma.user.findUnique as any).mockResolvedValue({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });

        await expect(
          boardSuspensionService.suspendBoardMember(
            { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
            'issuer-x',
            roleCode
          )
        ).rejects.toMatchObject({ statusCode: 403 });

        expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
      }
    );

    it('rejects a missing actor role — fail closed, not a trusted system caller', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-internal',
          undefined
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it.each(['SUPER_ADMIN', 'YAYASAN_PENGAWAS'])(
      'allows issuance by an authorized role (%s)',
      async (roleCode) => {
        (prisma.user.findUnique as any).mockResolvedValue({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });
        (prisma.boardMemberSuspension.create as any).mockResolvedValue({
          id: 'susp-1',
          status: 'ACTIVE',
          plhAssignmentId: null,
        });
        (prisma.$transaction as any).mockImplementation((cb: any) => cb(prisma));

        await expect(
          boardSuspensionService.suspendBoardMember(
            { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
            'issuer-ok',
            roleCode
          )
        ).resolves.toBeDefined();
      }
    );

    it('refuses to name the suspended officer as their own Plh', async () => {
      // Self-appointment undoes the suspension: the frozen account would hold
      // the very office it was removed from.
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-pengurus',
            plhRoleCode: 'YAYASAN_KETUA',
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it('refuses an inactive or deleted Plh delegate', async () => {
      (prisma.user.findUnique as any)
        // The target is a live Pengurus…
        .mockResolvedValueOnce({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        })
        // …but the named replacement is a deactivated account.
        .mockResolvedValueOnce({ id: 'user-sekretaris', isActive: false, deletedAt: null });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-sekretaris',
            plhRoleCode: 'YAYASAN_KETUA',
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses a Plh role that is not a Pengurus role (SUPER_ADMIN)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-pengurus',
        isActive: true,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-accomplice',
            // The type now forbids this too; the runtime guard is what the
            // test is exercising, so the cast is deliberate.
            plhRoleCode: 'SUPER_ADMIN' as any,
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'SDIT_ADMIN'])(
      'refuses a Plh role outside the Pengurus organ (%s)',
      async (code) => {
        (prisma.user.findUnique as any).mockResolvedValue({
          id: 'user-pengurus',
          isActive: true,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });

        await expect(
          boardSuspensionService.suspendBoardMember(
            {
              userId: 'user-pengurus',
              skNumber: 'SK/1',
              auditReason: 'alasan audit yang panjang',
              plhUserId: 'user-x',
              // Deliberately outside the legal set — the service guard is the
              // behaviour under test.
              plhRoleCode: code as any,
            },
            'issuer-pengawas',
            'YAYASAN_PENGAWAS'
          )
        ).rejects.toMatchObject({ statusCode: 400 });
      }
    );

    it('does not treat an expired Pengurus assignment as a current Pengurus', async () => {
      // The filter is applied in the query, so a returned empty set is exactly
      // what a lapsed assignment yields.
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-x',
        isActive: true,
        userRoles: [],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-x', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      // The guard asks the DB to exclude inactive/expired assignments rather
      // than filtering after the fact.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            userRoles: {
              where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
              },
              include: { role: { select: { code: true } } },
            },
          },
        })
      );
    });

    it('reactivates an account that is still off after a mere profile edit bumped its updatedAt', async () => {
      // The old lift compared `updatedAt` against the suspension's own write,
      // so any name/email change moved the timestamp and the lift refused to
      // restore an account the suspension itself had switched off. State is
      // what matters: off now, and on before the suspension → put it back on.
      const mockSuspension = {
        id: 'susp-9',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      // An unrelated profile edit moved `updatedAt` past the suspension.
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-9', 'lifter', 'Pulih');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-pengurus',
          isActive: false,
          deletedAt: null,
          accountStateWriter: 'asw_test',
        },
        data: {
        isActive: true,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
      });
    });

    it('does not re-activate an account that the snapshot says was already off before suspension', async () => {
      const mockSuspension = {
        id: 'susp-10',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          // Read inside the transaction, immediately before the suspension's
          // own write: `false` means someone else had already deactivated the
          // account, so a lift must leave it off rather than resurrect it.
          isActiveBefore: false,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-10', 'lifter', 'Pulih');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('leaves a soft-deleted account deleted on lift', async () => {
      const mockSuspension = {
        id: 'susp-del',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      // A soft-deleted row can never match the conditional activation, which
      // requires `deletedAt: null`, so the database returns zero rows.
      (prisma.user.updateMany as any).mockResolvedValue({ count: 0 });

      await boardSuspensionService.liftBoardSuspension('susp-del', 'lifter', 'Pulih');

      // The activation is scoped to a non-deleted row, so the delete survives.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-pengurus',
          isActive: false,
          deletedAt: null,
          accountStateWriter: 'asw_test',
        },
        data: {
        isActive: true,
        accountStateWriter: expect.stringMatching(/^asw_/),
        accountStateVersion: { increment: 1 },
      },
      });
    });

    it('refuses a lift that loses the race and reports the conflict', async () => {
      // Two lifters can both read ACTIVE at READ COMMITTED. The conditional
      // `updateMany` decides inside the write statement, so the loser sees a
      // rowcount of 0 and must not overwrite the winner's attribution.
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
        id: 'susp-race',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: null,
      });
      (prisma.boardMemberSuspension.updateMany as any).mockResolvedValue({ count: 0 });

      await expect(
        boardSuspensionService.liftBoardSuspension('susp-race', 'loser', 'Pulih')
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('invalidates the suspension cache on lift instead of writing false', async () => {
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
        id: 'susp-11',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      });
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        id: 'susp-11',
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        accountStateWriter: 'asw_test',
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-11', 'lifter', 'Pulih');

      expect(invalidateUserSuspensionCache).toHaveBeenCalledWith('user-pengurus', expect.any(Number));
    });
  });

  describe('Plh/Plt organ-exclusivity (cross-organ delegation)', () => {
    /**
     * The candidate query and the service used to answer "may this account be
     * Plh?" differently. The picker excluded only SUPER_ADMIN and the legacy
     * STUDENT/PARENT enum values, so a Pembina or Pengawas was offered and then
     * reached the grant, where the `trg_yayasan_organ_exclusive` trigger
     * rejected the insert with SQLSTATE 23514 — a 500, after the target had been
     * switched off. Both now read `isPlhEligible` from `@cipansor/shared`.
     */
    it('filters ineligible roles out of the candidate query', async () => {
      (prisma.user.findMany as any).mockResolvedValue([]);

      await boardSuspensionService.listPlhCandidates();

      const where = (prisma.user.findMany as any).mock.calls[0][0].where;
      const ineligible = where.userRoles.none.role.code.in;
      // Both non-Pengurus organs are excluded, as is the system administrator.
      expect(ineligible).toContain('YAYASAN_PEMBINA');
      expect(ineligible).toContain('YAYASAN_PENGAWAS');
      expect(ineligible).toContain('SUPER_ADMIN');
      // The legacy enum is expressed as an OR with `role: null`, because
      // `notIn` alone evaluates NULL and silently dropped accounts without a
      // legacy role.
      expect(where.OR).toEqual([
        { role: null },
        { role: { notIn: ['STUDENT', 'PARENT'] } },
      ]);
    });

    it('marks each candidate with its resolved plhEligible flag', async () => {
      (prisma.user.findMany as any).mockResolvedValue([
        {
          id: 'u-ok',
          name: 'Bendahara',
          email: 'b@e.com',
          unit: null,
          userRoles: [{ role: { code: 'YAYASAN_BENDAHARA' } }],
        },
        {
          id: 'u-pembina',
          name: 'Pembina',
          email: 'p@e.com',
          unit: null,
          userRoles: [{ role: { code: 'YAYASAN_PEMBINA' } }],
        },
      ]);

      const candidates = await boardSuspensionService.listPlhCandidates();

      expect(candidates.find((c) => c.id === 'u-ok')?.plhEligible).toBe(true);
      expect(candidates.find((c) => c.id === 'u-pembina')?.plhEligible).toBe(false);
    });

    it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'SUPER_ADMIN'])(
      'refuses %s as a delegate even when the service is called directly',
      async (roleCode) => {
        // Preflight sees an otherwise-valid candidate holding the ineligible
        // role. The rejection must come from eligibility, before any write.
        (prisma.user.findUnique as any)
          .mockResolvedValueOnce({
            id: 'user-pengurus',
            isActive: true,
            deletedAt: null,
            userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
          })
          .mockResolvedValueOnce({
            id: 'user-delegate',
            isActive: true,
            deletedAt: null,
            userRoles: [{ role: { code: roleCode } }],
          });

        await expect(
          boardSuspensionService.suspendBoardMember(
            {
              userId: 'user-pengurus',
              skNumber: 'SK/1',
              auditReason: 'alasan audit yang panjang',
              plhUserId: 'user-delegate',
              plhRoleCode: 'YAYASAN_ANGGOTA',
            },
            'issuer-pengawas',
            'YAYASAN_PENGAWAS'
          )
        ).rejects.toMatchObject({ statusCode: 400 });

        // The whole transaction must be untouched: no account deactivation, no
        // suspension row, no refresh-token purge, no E-Sign lock, no Plh grant.
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
        expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
        expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
        expect(prisma.userSigningKey.updateMany).not.toHaveBeenCalled();
        expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      }
    );

    it('re-checks eligibility inside the transaction when a role change lands after preflight', async () => {
      // Preflight read an eligible delegate, then an admin granted them a
      // Pembina assignment before the grant ran. The locked re-read sees it and
      // aborts, so no cross-organ grant is attempted.
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        })
        .mockResolvedValueOnce({
          id: 'user-delegate',
          isActive: true,
          deletedAt: null,
          userRoles: [{ role: { code: 'YAYASAN_SEKRETARIS' } }],
        })
        .mockResolvedValueOnce({
          isActive: true,
          accountStateWriter: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });
      (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
      (prisma.$queryRaw as any).mockResolvedValue([{ is_active: true, deleted_at: null }]);
      (prisma.userRoleAssignment.findMany as any).mockResolvedValue([
        { role: { code: 'YAYASAN_PEMBINA' } },
      ]);

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-delegate',
            plhRoleCode: 'YAYASAN_ANGGOTA',
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it('maps a database organ-exclusivity violation to a stable 4xx, not a 500', async () => {
      // The trigger is the final guarantee; a concurrent insert it refuses
      // surfaces through the driver adapter as code P2039 (originalCode 23514).
      // A real `PrismaClientKnownRequestError` is constructed so the service's
      // `instanceof` mapping is exercised for real.
      const { Prisma } = await import('@prisma/client');
      const triggerError = new Prisma.PrismaClientKnownRequestError(
        'Database error. Code: `23514`. Message: `Yayasan organ conflict`',
        {
          code: 'P2039',
          clientVersion: '7.10.0',
          meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
        }
      );

      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        })
        .mockResolvedValueOnce({
          id: 'user-delegate',
          isActive: true,
          deletedAt: null,
          userRoles: [{ role: { code: 'YAYASAN_SEKRETARIS' } }],
        })
        .mockResolvedValueOnce({
          isActive: true,
          accountStateWriter: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });
      (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
      (prisma.$queryRaw as any).mockResolvedValue([{ is_active: true, deleted_at: null }]);
      (prisma.userRoleAssignment.findMany as any).mockResolvedValue([]);
      (prisma.role.findFirst as any).mockResolvedValue({ id: 'role-anggota', code: 'YAYASAN_ANGGOTA' });
      (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
      (prisma.userRoleAssignment.create as any).mockRejectedValue(triggerError);

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-delegate',
            plhRoleCode: 'YAYASAN_ANGGOTA',
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    });

    it('aborts when a named Plh role no longer exists (fail closed, not a silent no-grant)', async () => {
      // The old `if (role) { … }` skipped the grant but still created the
      // suspension with plh metadata — a deactivated target and no replacement.
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        })
        .mockResolvedValueOnce({
          id: 'user-delegate',
          isActive: true,
          deletedAt: null,
          userRoles: [{ role: { code: 'YAYASAN_SEKRETARIS' } }],
        })
        .mockResolvedValueOnce({
          isActive: true,
          accountStateWriter: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });
      (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
      (prisma.$queryRaw as any).mockResolvedValue([{ is_active: true, deleted_at: null }]);
      (prisma.userRoleAssignment.findMany as any).mockResolvedValue([]);
      (prisma.role.findFirst as any).mockResolvedValue(null);

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-delegate',
            plhRoleCode: 'YAYASAN_ANGGOTA',
          },
          'issuer-pengawas',
          'YAYASAN_PENGAWAS'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userSigningKey.updateMany).not.toHaveBeenCalled();
    });
  });
});
