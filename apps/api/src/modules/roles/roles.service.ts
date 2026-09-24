import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus, Realm, RoleCode } from '@prisma/client';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema';
import { findOrganConflict } from '@/utils/role-eligibility';
import { isParentRole } from '@/utils/parent-scope';
import { isAdminRoleCode, isGovernanceRoleCode } from '@/middleware/auth';
import { generateTokenPair, getExpirationDate } from '@/lib/jwt';
import { config } from '@/config';
import { tokenUnitId } from '@/utils/resolve-unit-id';
import { lockUserAndAssignments, lockUserRows } from '@/utils/role-assignment-lock';
import { disconnectUserSockets } from '@/lib/realtime';

export class RolesService {
  /**
   * Get all roles
   */
  async getAllRoles(realm?: Realm) {
    const where = realm ? { realm, isActive: true } : { isActive: true };

    return prisma.role.findMany({
      where,
      orderBy: [{ realm: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: string) {
    const role = await prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw Errors.notFound('Role');
    }

    return role;
  }

  /**
   * Get role by code
   */
  async getRoleByCode(code: string) {
    const role = await prisma.role.findUnique({
      where: { code },
    });

    if (!role) {
      throw Errors.notFound('Role');
    }

    return role;
  }

  /**
   * Create a new role
   */
  async createRole(input: CreateRoleInput) {
    if (!input.code) {
      throw Errors.badRequest('Role code is required');
    }

    const existing = await prisma.role.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw Errors.conflict('Role with this code already exists');
    }

    // Determine realm: Use provided realm or infer from code prefix
    let realm: Realm;

    if (input.realm) {
      realm = input.realm as Realm;
    } else {
      realm = Realm.GLOBAL; // Default
      const codeStr = input.code.toString();
      if (codeStr.startsWith('YAYASAN')) realm = Realm.YAYASAN;
      else if (codeStr.startsWith('TKQ')) realm = Realm.TK_QURAN;
      else if (codeStr.startsWith('SDIT')) realm = Realm.SD_IT;
      else if (codeStr.startsWith('SMPIT')) realm = Realm.SMP_IT;
      else if (codeStr.startsWith('SMAQ')) realm = Realm.SMA_QURAN;
      else if (
        codeStr.startsWith('PESANTREN') ||
        ['MUSYRIF', 'MUHAFIDZ', 'MURABBI', 'WALI_KAMAR'].some((p) => codeStr.startsWith(p))
      )
        realm = Realm.PESANTREN;
    }

    return prisma.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        permissions: input.permissions ?? [],
        realm,
        isActive: true,
      },
    });
  }

  /**
   * Update role (name, description, permissions)
   */
  async updateRole(id: string, input: UpdateRoleInput) {
    const role = await prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw Errors.notFound('Role');
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissions ?? undefined, // Only update if provided
      },
    });

    // Invalidate permission cache
    try {
      await redis.del(`role:permissions:${id}`);
    } catch (error) {
      // Log error but continue since DB update succeeded
      // eslint-disable-next-line no-console
      console.error('Failed to invalidate role permissions cache:', error);
    }

    return updated;
  }

  /**
   * Get user's role assignments
   */
  async getUserRoles(userId: string) {
    return prisma.userRoleAssignment.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        role: true,
        unit: true,
      },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(
    userId: string,
    roleId: string,
    unitId?: string,
    isPrimary = false,
    actorRoleCode?: string
  ) {
    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw Errors.notFound('User');
    }

    // Check if role exists
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw Errors.notFound('Role');
    }

    // Privilege-escalation guard, mirroring `AuthService.createUser`.
    //
    // `POST /roles/assign` is guarded by `authorize(SUPER_ADMIN, UNIT_ADMIN)`,
    // so a unit admin can reach it — and without this check the only rule was
    // `findOrganConflict`, which stops a person holding two yayasan organs but
    // says nothing about *who may grant which role*. A unit admin could
    // therefore mint SUPER_ADMIN, another unit's admin, or a governance role
    // (PEMBINA, PENGAWAS, …) for any account, which is the same escalation the
    // create-account path already refuses. The two doors must agree: only a
    // Super Admin may grant an admin-level or governance-level role.
    if (
      actorRoleCode !== undefined &&
      actorRoleCode !== RoleCode.SUPER_ADMIN &&
      (isAdminRoleCode(role.code) || isGovernanceRoleCode(role.code))
    ) {
      throw Errors.forbidden(
        'Hanya Super Admin yang dapat memberikan peran admin atau governance.'
      );
    }

    // A guardian role without a child at that unit produces an account with an
    // empty parent portal, scoped to a school it has no business seeing.
    if (isParentRole(role.code)) {
      if (!unitId) {
        throw Errors.badRequest('Peran orang tua/wali harus disertai unit');
      }
      const hasChildThere = await prisma.studentParent.findFirst({
        where: { parentId: userId, student: { unitId } },
        select: { id: true },
      });
      if (!hasChildThere) {
        throw Errors.badRequest(
          'Tidak dapat memberikan peran orang tua/wali: pengguna ini belum ' +
            'terhubung dengan santri mana pun di unit tersebut. Tautkan anaknya ' +
            'terlebih dahulu.'
        );
      }
    }

    // The existence, eligibility and insert are one transaction under the
    // shared role-assignment lock protocol.
    //
    // The reads above the transaction are a fast fail. The decision is remade
    // here, holding the user row and its assignment rows: a grant that races a
    // suspension or a concurrent grant must be serialised, or two writers can
    // both read "no conflict" and both insert — and the organ-exclusivity rule
    // (a person holds at most one yayasan organ) is exactly a read-then-write
    // invariant. Lock order is the documented one: user row first, then the
    // assignment rows. See `utils/role-assignment-lock.ts`.
    return prisma.$transaction(async (tx) => {
      await lockUserAndAssignments(tx, userId);

      const existing = await tx.userRoleAssignment.findFirst({
        where: {
          userId,
          roleId,
          unitId: unitId || null,
        },
      });

      if (existing) {
        throw Errors.conflict('User already has this role');
      }

      // Eligibility. Checked here rather than only in the UI because this route
      // is reachable without the UI, and a rule that lives only in a form is not
      // a rule. Re-read under the lock so a concurrent grant is visible.
      const heldRoles = await tx.userRoleAssignment.findMany({
        where: { userId, isActive: true },
        select: { role: { select: { code: true } } },
      });

      // Yayasan organs are mutually exclusive by statute — see role-eligibility.
      const conflict = findOrganConflict(
        role.code,
        heldRoles.map((h) => h.role.code)
      );
      if (conflict) {
        throw Errors.badRequest(conflict.message);
      }

      // If this is primary, unset other primary roles
      if (isPrimary) {
        await tx.userRoleAssignment.updateMany({
          where: { userId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.userRoleAssignment.create({
        data: {
          userId,
          roleId,
          unitId,
          isPrimary,
          isActive: true,
        },
        include: {
          role: true,
          unit: true,
        },
      });
    });
  }

  /**
   * Remove role assignment
   */
  async removeRoleAssignment(assignmentId: string) {
    const assignment = await prisma.userRoleAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

    // Revoke under the shared protocol: the user row first, then the
    // assignment rows.
    //
    // The suspension service re-validates a Pengurus role under a lock on the
    // user row, so a revocation that does not take that same lock can delete the
    // assignment between the suspension's check and its commit — the suspension
    // then switches off an account whose Pengurus role no longer exists, and
    // mints a replacement for a vacancy that was already handled. Taking the
    // protocol's locks makes the two writers serialise. The `deleteMany` is
    // conditional on the row still existing so a concurrent revoke reports a
    // clean 404 rather than a Prisma P2025 that would surface as a 500.
    return prisma
      .$transaction(async (tx) => {
        await lockUserAndAssignments(tx, assignment.userId);

        // Refuse to delete a delegation an ACTIVE suspension still depends on.
        //
        // `board_suspension_plh_assignments.assignment_id` cascades on delete, so
        // revoking a Plh row that a live suspension is relying on would take the
        // dependency row with it — and with it the `created`/`restore` provenance
        // the eventual lift needs to decide whether to remove or restore the
        // assignment. The suspension would then lift against a missing
        // dependency, leaving the delegation active forever (or deleted when it
        // should have been restored). The row must outlive the suspension, so the
        // delete is refused while one is ACTIVE. The suspension's own release
        // path removes it at lift time, which is the one place that holds the
        // provenance.
        const activeDependency = await tx.boardSuspensionPlhAssignment.findFirst({
          where: {
            assignmentId,
            suspension: { status: BoardSuspensionStatus.ACTIVE },
          },
          select: { id: true },
        });
        if (activeDependency) {
          throw Errors.conflict(
            'Peran ini sedang dipakai sebagai delegasi Plh/Plt pada pembekuan pengurus yang masih aktif. ' +
              'Cabut pembekuannya terlebih dahulu sebelum menghapus penugasan ini.'
          );
        }

        const deleted = await tx.userRoleAssignment.deleteMany({
          where: { id: assignmentId },
        });
        if (deleted.count !== 1) {
          throw Errors.notFound('Role assignment');
        }
        return assignment;
      })
      .then((assignment) => {
        // The revocation changed this user's realtime scope (role rooms, unit
        // rooms, dashboard). A socket opened before it still holds those rooms and
        // would keep receiving their broadcasts; disconnect it across every
        // replica so the cut-off is immediate rather than waiting for the next
        // `join-*`. Published after the transaction commits, so a rollback cannot
        // disconnect a user whose assignment survived. The per-event scope
        // revalidation in `realtime.ts` is the backstop if Redis is down.
        disconnectUserSockets(assignment.userId);
        return assignment;
      });
  }

  /**
   * Set primary role for user
   */
  async setPrimaryRole(userId: string, assignmentId: string) {
    // "Exactly one primary" is a read-then-write invariant across two rows, so
    // the whole swap runs under the shared protocol rather than as two
    // independent statements that a concurrent writer can interleave.
    return prisma.$transaction(async (tx) => {
      await lockUserAndAssignments(tx, userId);

      // Check if assignment exists and belongs to user
      const assignment = await tx.userRoleAssignment.findFirst({
        where: { id: assignmentId, userId },
      });

      if (!assignment) {
        throw Errors.notFound('Role assignment');
      }

      // Unset all primary roles for user
      await tx.userRoleAssignment.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });

      // Set new primary role
      return tx.userRoleAssignment.update({
        where: { id: assignmentId },
        data: { isPrimary: true },
        include: {
          role: true,
          unit: true,
        },
      });
    });
  }

  /**
   * Switch the caller's active role and issue the replacement session in one
   * transaction.
   *
   * The old split — switch here, mint and store the refresh token in the
   * controller — had the same suspension race every other issuance path was
   * fixed for. The controller read the (already switched) user, generated a
   * token pair, and inserted the refresh token outside any lock. A suspension
   * committing in that window switched the account off and deleted the tokens
   * it could see, but the one created afterwards survived and authenticated
   * away the suspension — from the role switcher, which is reachable by any
   * signed-in user.
   *
   * So the whole thing is one transaction that takes the user row first (the
   * lock order `BoardSuspensionService`, `refreshToken`, login and 2FA all
   * use), re-asserts account state and the active suspension, re-reads the
   * assignment under that lock, then flips primary, mints the pair and stores
   * the refresh token in the same commit. A concurrent revocation of the
   * assignment cannot slip between the eligibility read and the flip, and a
   * suspension cannot commit between the state check and the token insert.
   */
  async switchRoleAndIssueSession(userId: string, roleAssignmentId: string) {
    return prisma.$transaction(async (tx) => {
      // User row first, then the assignment rows — the shared order. The
      // account-state read below is re-made against the locked row.
      await lockUserRows(tx, [userId]);
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "users"
        WHERE id = ${userId} AND is_active = true AND deleted_at IS NULL
      `;
      if (claimed.length !== 1) {
        throw Errors.unauthorized('Account is deactivated');
      }
      await lockUserAndAssignments(tx, userId);

      const blockingSuspension = await tx.boardMemberSuspension.findFirst({
        where: { userId, status: BoardSuspensionStatus.ACTIVE },
        select: { id: true },
      });
      if (blockingSuspension) {
        throw Errors.unauthorized('Account is deactivated');
      }

      // Re-read under the lock: `isActive`, `expiresAt` and the row's existence
      // are all checked against the state that holds at commit. The pre-flight
      // read in the controller was only a fast fail.
      const assignment = await tx.userRoleAssignment.findFirst({
        where: {
          id: roleAssignmentId,
          userId,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { role: true, unit: true, user: true },
      });

      if (!assignment) {
        throw Errors.notFound('Role assignment');
      }

      // An admin session must not be obtainable without the second factor.
      //
      // Login forces an admin account through 2FA setup before it will issue a
      // session-at-rest (`AuthService.login` → `requiresTwoFactorSetup`). Switch
      // is a second door to the same session and did not enforce it: an account
      // whose *primary* role is non-admin (so login never challenged it) could
      // hold an admin assignment and switch straight into it, minting an admin
      // access+refresh pair with 2FA never enabled — the very state login
      // refuses to produce. The check is the same set login enforces
      // (`isAdminRoleCode`); governance roles are not forced through 2FA at
      // login either, so switch stays consistent with login on that point.
      if (isAdminRoleCode(assignment.role.code) && !assignment.user.isTwoFactorEnabled) {
        throw Errors.forbidden(
          'Aktifkan autentikasi dua faktor (2FA) sebelum beralih ke peran admin.'
        );
      }

      // Update primary role
      await tx.userRoleAssignment.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });

      await tx.userRoleAssignment.update({
        where: { id: roleAssignmentId },
        data: { isPrimary: true },
      });

      const tokens = generateTokenPair({
        id: assignment.user.id,
        sub: assignment.user.id,
        email: assignment.user.email,
        role: assignment.user.role ?? '',
        roleCode: assignment.role.code,
        roleId: assignment.roleId,
        // Same rule as login, 2FA and refresh (tokenUnitId): only a foundation
        // role may carry no unit. Deciding it differently here gave a switched
        // role one scope until the next refresh and another after it.
        unitId: tokenUnitId(assignment.unitId, assignment.role.code, assignment.user.unitId),
        permissions: (assignment.role.permissions as string[]) ?? [],
      });

      await tx.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: assignment.user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      });

      return { activeRole: assignment, user: assignment.user, tokens };
    });
  }
}

export const rolesService = new RolesService();
