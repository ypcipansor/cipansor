import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Errors } from '@/middleware/error';
import { Realm } from '@prisma/client';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema';
import { findOrganConflict } from '@/utils/role-eligibility';
import { isParentRole } from '@/utils/parent-scope';

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
  async assignRoleToUser(userId: string, roleId: string, unitId?: string, isPrimary = false) {
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
  async removeRoleAssignment(assignmentId: string) {
    const assignment = await prisma.userRoleAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

    const deleted = await prisma.userRoleAssignment.delete({
      where: { id: assignmentId },
    });

    return deleted;
  }

  /**
   * Set primary role for user
   */
  async setPrimaryRole(userId: string, assignmentId: string) {
    // Check if assignment exists and belongs to user
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId },
    });

    if (!assignment) {
      throw Errors.notFound('Role assignment');
    }

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
