import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { assertPasswordAllowed } from '@/lib/password-policy';
import { Errors } from '@/middleware/error';
import {
  assertMayManageAccount,
  activeAssignmentWhere,
  type AccountActor,
} from '@/utils/account-scope';
import { UserRole, Prisma, type Unit } from '@prisma/client';
import { resolveLegacyRoleToRoleCode } from '@/modules/auth/auth.service';
import type { ListUsersQuery, CreateUserInput, UpdateUserInput } from './user.schema';

export class UserService {
  /**
   * Get all users with pagination and filters
   */
  async findAll(query: ListUsersQuery, currentUser: { roleCode: string; unitId: string | null }) {
    const { page, limit, search, role, unitId, realm } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    // Unit admins are scoped to their own unit; only SUPER_ADMIN sees across
    // units (foundation-level administration is a SUPER_ADMIN concern — there
    // is no separate YAYASAN_ADMIN role).
    const foundationWide = currentUser.roleCode === 'SUPER_ADMIN';
    if (!foundationWide) {
      where.unitId = currentUser.unitId;
    } else if (unitId) {
      where.unitId = unitId;
    }

    if (role) {
      where.role = role as UserRole;
    }

    if (realm) {
      where.userRoles = { some: { ...activeAssignmentWhere(), role: { realm } } };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute queries
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          unitId: true,
          isActive: true,
          // The users page offers "turn off 2FA" only where it is on; without
          // the flag the action never appeared.
          isTwoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          unit: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          userRoles: {
            where: { isActive: true },
            orderBy: { isPrimary: 'desc' },
            select: {
              id: true,
              isPrimary: true,
              role: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  realm: true,
                  description: true,
                },
              },
              unit: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID
   */
  async findById(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        unit: true,
        student: true,
        userRoles: {
          where: { isActive: true },
          orderBy: { isPrimary: 'desc' },
          include: {
            role: {
              select: {
                id: true,
                code: true,
                name: true,
                realm: true,
                description: true,
              },
            },
            unit: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    // No credential column is loaded: the client omits them (lib/prisma.ts).
    return user;
  }

  /**
   * Create new user
   */
  async create(input: CreateUserInput, creator: { roleCode: string; unitId: string | null }) {
    // Admin accounts (super admin AND unit admins) are provisioned by
    // SUPER_ADMIN only — the intended flow for a new unit is: super admin
    // creates the unit, then creates that unit's single admin user.
    if (
      (input.role === 'SUPER_ADMIN' || input.role === 'UNIT_ADMIN') &&
      creator.roleCode !== 'SUPER_ADMIN'
    ) {
      throw Errors.forbidden('Only Super Admin can create admin accounts');
    }

    // Unit admins operate inside exactly one unit: they may only create
    // users for their own unit. Only SUPER_ADMIN is foundation-scoped.
    if (creator.roleCode !== 'SUPER_ADMIN' && input.unitId !== creator.unitId) {
      throw Errors.forbidden('Unit admins can only create users in their own unit');
    }

    // Check if email exists
    const existing = await prisma.user.findFirst({
      where: { email: input.email },
    });

    if (existing) {
      throw Errors.conflict('Email already registered');
    }

    // Validate unit for non-super-admin
    if (input.role !== 'SUPER_ADMIN' && !input.unitId) {
      throw Errors.badRequest('Unit is required for this role');
    }

    // If unit provided, check it exists
    let unit: Unit | null = null;
    if (input.unitId) {
      unit = await prisma.unit.findFirst({
        where: { id: input.unitId, deletedAt: null },
      });
      if (!unit) {
        throw Errors.notFound('Unit');
      }
    }

    // Login requires a UserRoleAssignment, so resolve the concrete RoleCode
    // up front and refuse to create an account that could never log in.
    const roleCode = resolveLegacyRoleToRoleCode(input.role, unit?.type);
    if (!roleCode) {
      throw Errors.badRequest(
        `Cannot map role ${input.role} for this unit type — assign a specific role code instead`
      );
    }
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw Errors.badRequest(`Role ${roleCode} is not seeded in the roles table`);
    }

    // A new account has no 2FA yet: the single-factor rules apply.
    assertPasswordAllowed(input.password, {
      twoFactorEnabled: false,
      email: input.email,
      name: input.name,
    });
    const passwordHash = await hashPassword(input.password);

    // Create user + primary role assignment together
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        // Someone else chose it: replaced at the first sign-in (also the
        // column default, stated here so the rule is read where it applies).
        mustChangePassword: true,
        role: input.role as UserRole,
        unitId: input.unitId || null,
        isActive: true,
        userRoles: {
          create: {
            roleId: role.id,
            unitId: input.unitId || null,
            isPrimary: true,
            isActive: true,
          },
        },
      },
      include: { unit: true },
    });

    // No credential column is loaded: the client omits them (lib/prisma.ts).
    return user;
  }

  /**
   * Update user
   */
  async update(id: string, input: UpdateUserInput, currentUser: AccountActor) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        userRoles: { where: activeAssignmentWhere(), include: { role: true } },
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    const isSuper = currentUser.roleCode === 'SUPER_ADMIN';
    const foundationWide = isSuper;

    // Unit admins may only touch users of their own unit.
    if (!foundationWide && user.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Unit admins can only manage users in their own unit');
    }

    // A new email is where the next reset link goes, and switching an account
    // off locks its holder out: on someone else's account both follow the
    // delete rule. A name can still be corrected within the unit.
    const changesAccess =
      (input.email !== undefined && input.email !== user.email) ||
      (input.isActive !== undefined && input.isActive !== user.isActive);
    if (changesAccess && id !== currentUser.sub) {
      assertMayManageAccount(
        { unitId: user.unitId, roleCodes: user.userRoles.map((r) => r.role.code) },
        currentUser
      );
    }

    // Only Super Admin can change roles or move users between units.
    if (input.role && !isSuper) {
      throw Errors.forbidden('Only Super Admin can change roles');
    }
    if (input.unitId && input.unitId !== user.unitId && !isSuper) {
      throw Errors.forbidden('Only Super Admin can move users between units');
    }

    // Check email uniqueness if changing
    if (input.email && input.email !== user.email) {
      const existing = await prisma.user.findFirst({
        where: { email: input.email, id: { not: id } },
      });
      if (existing) {
        throw Errors.conflict('Email already in use');
      }
    }

    // Update user
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        role: input.role as UserRole | undefined,
        unitId: input.unitId,
        isActive: input.isActive,
      },
      include: { unit: true },
    });

    // No credential column is loaded: the client omits them (lib/prisma.ts).
    return updated;
  }

  /**
   * Mark an account's password as leaked (decisions/autentikasi-2fa-dan-sandi.md):
   * every session ends now, and the next sign-in asks for a new password.
   *
   * Super Admin: any account. A unit admin: accounts of their own unit, and not
   * one that must use 2FA (another admin, a kepala, an organ of the yayasan) —
   * the line the admin path of turning 2FA off already draws. Ending someone's
   * sessions is not a thing a peer should be able to do to a peer.
   */
  async requirePasswordChange(id: string, currentUser: AccountActor) {
    if (id === currentUser.sub) {
      throw Errors.badRequest('Untuk akun Anda sendiri, ganti kata sandi di Profil → Keamanan.');
    }

    const user = await prisma.user.findFirst({
      // The client omits credentials by default (lib/prisma.ts); this check needs it.
      omit: { passwordHash: false },
      where: { id, deletedAt: null },
      include: {
        userRoles: { where: activeAssignmentWhere(), include: { role: true } },
      },
    });
    if (!user) {
      throw Errors.notFound('User');
    }
    if (!user.passwordHash) {
      throw Errors.badRequest('Data ini tidak memiliki akun login.');
    }
    assertMayManageAccount(
      { unitId: user.unitId, roleCodes: user.userRoles.map((r) => r.role.code) },
      currentUser
    );

    await prisma.user.update({ where: { id }, data: { mustChangePassword: true } });
    await prisma.refreshToken.deleteMany({ where: { userId: id } });

    return {
      // An access token already issued stays valid until it expires (15 minutes);
      // the refresh that would extend it is refused from now on.
      message: `Kata sandi ${user.name} wajib diganti. Sesinya berakhir paling lama 15 menit lagi, dan saat masuk berikutnya ia harus membuat kata sandi baru.`,
    };
  }

  /**
   * Delete user (soft delete), within the admin's scope (`assertMayManageAccount`).
   */
  async delete(id: string, currentUser: AccountActor) {
    if (id === currentUser.sub) {
      throw Errors.badRequest('Akun Anda sendiri tidak dapat dihapus.');
    }

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        userRoles: { where: activeAssignmentWhere(), include: { role: true } },
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }
    assertMayManageAccount(
      { unitId: user.unitId, roleCodes: user.userRoles.map((r) => r.role.code) },
      currentUser
    );

    // Soft delete
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Also delete refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: id },
    });

    return { message: 'User deleted successfully' };
  }
}

export const userService = new UserService();
