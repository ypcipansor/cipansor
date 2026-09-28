import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Errors } from '@/middleware/error';
import { Realm, RoleCode } from '@prisma/client';
import { SUPPORT_ROLE_CODES } from '@cipansor/shared';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema';
import { findOrganConflict } from '@/utils/role-eligibility';
import { isParentRole } from '@/utils/parent-scope';
import { isAdminRoleCode, isGovernanceRoleCode, requiresSecondFactor } from '@/middleware/auth';

/** Who is changing someone's roles: the verified token, never the request body. */
export interface RoleActor {
  sub: string;
  roleCode: string;
  unitId?: string | null;
}

/**
 * Roles only Super Admin may hand out or take away: Super Admin itself, the
 * per-school admins, and the yayasan organs. Register already refuses these
 * to anyone but Super Admin (auth.service); assignment has to agree with it,
 * or register's rule is one request away from meaningless.
 */
function isSuperAdminOnlyRole(code: string): boolean {
  return code === RoleCode.SUPER_ADMIN || isAdminRoleCode(code) || isGovernanceRoleCode(code);
}

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
   * A unit admin manages the roles of THEIR OWN unit, below their own level,
   * and never their own. Super Admin is unrestricted.
   *
   * Until this check, any admin-bucket account (the unit admins and, through
   * the legacy UNIT_ADMIN bucket, every yayasan organ) could assign any role,
   * SUPER_ADMIN included, to any user at any unit: themselves too.
   */
  private async assertMayManage(
    actor: RoleActor,
    target: { userId: string; roleCode: string; roleRealm: Realm; unitId: string | null }
  ) {
    if (actor.roleCode === RoleCode.SUPER_ADMIN) return;

    if (!isAdminRoleCode(actor.roleCode) || !actor.unitId) {
      throw Errors.forbidden('Hanya admin yang dapat mengatur peran pengguna');
    }
    if (target.userId === actor.sub) {
      throw Errors.forbidden('Peran Anda sendiri hanya dapat diubah oleh Super Admin');
    }
    if (isSuperAdminOnlyRole(target.roleCode)) {
      throw Errors.forbidden('Peran ini hanya dapat diatur oleh Super Admin');
    }
    if (target.unitId !== actor.unitId) {
      throw Errors.forbidden('Anda hanya dapat mengatur peran di unit Anda sendiri');
    }

    // The school's own roles, plus the support staff (librarian, nurse,
    // security, lab) who serve a school but are defined once for all of them.
    const actorRole = await prisma.role.findUnique({
      where: { code: actor.roleCode },
      select: { realm: true },
    });
    if (
      !actorRole ||
      (target.roleRealm !== actorRole.realm && !SUPPORT_ROLE_CODES.includes(target.roleCode))
    ) {
      throw Errors.forbidden('Peran ini bukan peran unit Anda');
    }
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(
    actor: RoleActor,
    userId: string,
    roleId: string,
    unitId?: string,
    isPrimary = false
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

    // A unit admin's assignment lands in their own unit unless they say so;
    // anything else is refused by assertMayManage.
    if (!unitId && actor.roleCode !== RoleCode.SUPER_ADMIN && actor.unitId) {
      unitId = actor.unitId;
    }
    await this.assertMayManage(actor, {
      userId,
      roleCode: role.code,
      roleRealm: role.realm,
      unitId: unitId ?? null,
    });

    // Check if assignment already exists
    const existing = await prisma.userRoleAssignment.findFirst({
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
    // a rule.
    const heldRoles = await prisma.userRoleAssignment.findMany({
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

    // If this is primary, unset other primary roles
    if (isPrimary) {
      await prisma.userRoleAssignment.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const assignment = await prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId,
        unitId,
        isPrimary,
        isActive: true,
        // Who granted it. The column existed but was never filled: all 429
        // assignments in production (2026-09-24) had no author.
        assignedBy: actor.sub,
      },
      include: {
        role: true,
        unit: true,
      },
    });

    return assignment;
  }

  /**
   * Remove role assignment
   */
  async removeRoleAssignment(actor: RoleActor, assignmentId: string) {
    const assignment = await prisma.userRoleAssignment.findUnique({
      where: { id: assignmentId },
      include: { role: { select: { code: true, realm: true } } },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

    await this.assertMayManage(actor, {
      userId: assignment.userId,
      roleCode: assignment.role.code,
      roleRealm: assignment.role.realm,
      unitId: assignment.unitId,
    });

    const deleted = await prisma.userRoleAssignment.delete({
      where: { id: assignmentId },
    });

    return deleted;
  }

  /**
   * Set primary role for user
   */
  async setPrimaryRole(actor: RoleActor, userId: string, assignmentId: string) {
    // Check if assignment exists and belongs to user
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId },
      include: { role: { select: { code: true, realm: true } } },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

    await this.assertMayManage(actor, {
      userId,
      roleCode: assignment.role.code,
      roleRealm: assignment.role.realm,
      unitId: assignment.unitId,
    });

    // Unset all primary roles for user
    await prisma.userRoleAssignment.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set new primary role
    const updated = await prisma.userRoleAssignment.update({
      where: { id: assignmentId },
      data: { isPrimary: true },
      include: {
        role: true,
        unit: true,
      },
    });

    return updated;
  }

  /**
   * Switch active role (for frontend role switcher)
   * This sets the primary role and returns new tokens
   */
  async switchRole(userId: string, roleAssignmentId: string) {
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        id: roleAssignmentId,
        userId,
        isActive: true,
      },
      include: {
        role: true,
        unit: true,
        user: true,
      },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

    // Assignment yang sudah kedaluwarsa tidak boleh dipakai untuk berpindah
    // peran — `isActive` saja tidak cukup, karena baterai peran bisa dibiarkan
    // aktif setelah tanggal akhirnya lewat.
    if (assignment.expiresAt && assignment.expiresAt < new Date()) {
      throw Errors.badRequest('Role assignment has expired');
    }

    // Login already demands 2FA from anyone holding such a role; this covers
    // a role granted after the session signed in.
    if (requiresSecondFactor([assignment.role.code]) && !assignment.user.isTwoFactorEnabled) {
      throw Errors.forbidden('Enable 2FA before switching to this role');
    }

    // Update primary role
    await prisma.userRoleAssignment.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });

    await prisma.userRoleAssignment.update({
      where: { id: roleAssignmentId },
      data: { isPrimary: true },
    });

    return {
      activeRole: assignment,
      user: assignment.user,
    };
  }
}

export const rolesService = new RolesService();
