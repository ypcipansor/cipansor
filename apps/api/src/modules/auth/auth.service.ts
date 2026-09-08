import { prisma } from '@/lib/prisma';
import { hashPassword, comparePassword } from '@/lib/password';
import { generateTokenPair, verifyToken, getExpirationDate, generateAccessToken } from '@/lib/jwt';
import { Errors } from '@/middleware/error';
import { isAdminRoleCode, isGovernanceRoleCode, deriveLegacyRole } from '@/middleware/auth';
import { config } from '@/config';
import type { LoginInput, RegisterInput, ChangePasswordInput } from './auth.schema';
import { RoleCode, UnitType } from '@prisma/client';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import * as qrcode from 'qrcode';
import crypto from 'crypto';

/**
 * Resolve a legacy UserRole value (e.g. 'TEACHER', 'STAFF') into the correct
 * per-unit RoleCode (e.g. 'TKQ_GURU', 'SDIT_GURU') based on the target Unit's
 * type. For SUPER_ADMIN and UNIT_ADMIN the mapping is unit-agnostic.
 *
 * Returns null if the legacy value cannot be mapped — in that case the caller
 * should reject with a helpful error message.
 */
export function resolveLegacyRoleToRoleCode(
  legacyRole: string,
  unitType: UnitType | null | undefined,
): RoleCode | null {
  // Unit-agnostic mappings
  if (legacyRole === 'SUPER_ADMIN') return RoleCode.SUPER_ADMIN;
  if (legacyRole === 'UNIT_ADMIN') {
    switch (unitType) {
      case UnitType.TK_QURAN: return RoleCode.TKQ_ADMIN;
      case UnitType.SD_IT: return RoleCode.SDIT_ADMIN;
      case UnitType.SMP_IT: return RoleCode.SMPIT_ADMIN;
      case UnitType.SMA_QURAN: return RoleCode.SMAQ_ADMIN;
      // PESANTREN / OTHER / unknown: no dedicated per-unit admin RoleCode exists.
      // Do NOT silently fall back to a foundation-level role — that would be a privilege
      // escalation (foundation-level governance) for a unit-level admin.
      // Caller must supply `roleCode` explicitly for these unit types.
      default: return null;
    }
  }

  // Per-unit mappings — require a known unit type.
  //
  // NOTE on PESANTREN/OTHER units:
  //   - TEACHER maps to MUSYRIF (the generic pesantren teacher role) to preserve
  //     backward compatibility for legacy API clients registering pesantren teachers.
  //     More specific pesantren roles (MUHAFIDZ, MURABBI, WALI_KAMAR) must be
  //     selected explicitly via `roleCode` since they are distinct responsibilities.
  //   - STAFF/STUDENT/PARENT have NO dedicated pesantren RoleCode. Legacy clients
  //     registering these against PESANTREN/OTHER units must migrate to send
  //     `roleCode` explicitly. Do NOT silently fall back to a school-unit RoleCode
  //     — that would cross-assign a student/parent to the wrong unit type.
  const perUnit: Record<string, Partial<Record<UnitType, RoleCode>>> = {
    TEACHER: {
      [UnitType.TK_QURAN]: RoleCode.TKQ_GURU,
      [UnitType.SD_IT]: RoleCode.SDIT_GURU,
      [UnitType.SMP_IT]: RoleCode.SMPIT_GURU,
      [UnitType.SMA_QURAN]: RoleCode.SMAQ_GURU,
      [UnitType.PESANTREN]: RoleCode.MUSYRIF,
    },
    STAFF: {
      [UnitType.TK_QURAN]: RoleCode.TKQ_TATA_USAHA,
      [UnitType.SD_IT]: RoleCode.SDIT_TATA_USAHA,
      [UnitType.SMP_IT]: RoleCode.SMPIT_TATA_USAHA,
      [UnitType.SMA_QURAN]: RoleCode.SMAQ_TATA_USAHA,
    },
    STUDENT: {
      // No TK_QURAN entry: children of that age do not hold logins, so there is
      // no student RoleCode to map to and this returns null — the caller then
      // rejects with "send roleCode instead", which is the correct answer.
      // Creating the *record* for a TK santri is unaffected: `student.service.ts`
      // creates the User with the legacy STUDENT role and no RoleCode
      // assignment, satisfying the NOT NULL `students.user_id`.
      [UnitType.SD_IT]: RoleCode.SDIT_SISWA,
      [UnitType.SMP_IT]: RoleCode.SMPIT_SISWA,
      [UnitType.SMA_QURAN]: RoleCode.SMAQ_SISWA,
    },
    PARENT: {
      [UnitType.TK_QURAN]: RoleCode.TKQ_ORANG_TUA,
      [UnitType.SD_IT]: RoleCode.SDIT_ORANG_TUA,
      [UnitType.SMP_IT]: RoleCode.SMPIT_ORANG_TUA,
      [UnitType.SMA_QURAN]: RoleCode.SMAQ_ORANG_TUA,
    },
  };

  if (!unitType) return null;
  return perUnit[legacyRole]?.[unitType] ?? null;
}

/** Build a Prisma `where` clause to select only active, non-expired role assignments */
function activeRoleWhere() {
  return {
    isActive: true,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  };
}

export class AuthService {
  /**
   * Login user
   */
  async login(input: LoginInput) {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
      },
      include: {
        unit: true,
        userRoles: {
          where: activeRoleWhere(),
          include: {
            role: true,
            unit: true,
          },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });

    if (!user) {
      throw Errors.unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      throw Errors.unauthorized('Account is deactivated');
    }

    // An identity row, not a login: no credential was ever issued for it (TK
    // Qur'an pupils, and the SYSTEM placeholder). Refused here rather than
    // passed to bcrypt, whose behaviour on a null hash is a library detail and
    // not something authentication should depend on. The message stays generic
    // so it cannot be used to tell identities apart from real accounts.
    if (!user.passwordHash) {
      throw Errors.unauthorized('Invalid email or password');
    }

    const isValid = await comparePassword(input.password, user.passwordHash);

    if (!isValid) {
      throw Errors.unauthorized('Invalid email or password');
    }

    // Determine active role (primary or first role). Every account must have
    // a UserRoleAssignment (the seeds create them); accounts without one
    // cannot log in — assign a role via /users/:id/roles first.
    const primaryAssignment = user.userRoles.find((r) => r.isPrimary) || user.userRoles[0];
    if (!primaryAssignment) {
      throw Errors.forbidden('No active role assignment found for this user');
    }

    const roleCode = primaryAssignment.role.code;
    const permissions = (primaryAssignment.role.permissions as string[]) || [];
    const roleId = primaryAssignment.roleId;
    const assignmentUnitId = primaryAssignment.unitId;

    const isUserAdmin = isAdminRoleCode(roleCode);

    // Build the payload used for all token generation in this method
    const basePayload = {
      id: user.id,
      sub: user.id,
      email: user.email,
      roleId: roleId || '',
      roleCode,
      unitId: assignmentUnitId || user.unitId,
      permissions,
      role: deriveLegacyRole(roleCode),
    };

    // A demo deployment is exempt from 2FA: without it the privileged roles
    // cannot be opened at all, since no seeded account has an authenticator
    // enrolled. DEMO_MODE is the whole condition.
    //
    // It used to also require the address to end in `@demo.cipansor.or.id`.
    // That made an email address load-bearing for security, which is why the
    // accounts could not be renamed onto the institution's own domain without
    // silently locking every privileged login out behind a 2FA wall it has no
    // authenticator for. A deployment is a demo or it is not; the address of
    // the person signing in does not decide that.
    //
    // This is a LOOSENING while DEMO_MODE=true: accounts that were outside the
    // old suffix — the seeded staff and student logins — are now exempt too.
    // Acceptable only because the flag marks the entire deployment as demo, and
    // production has no real accounts yet. `DEMO_MODE=false` restores the wall
    // for everyone, and that is the switch to throw at launch.
    const isDemoAccount = process.env.DEMO_MODE === 'true';

    // Check for 2FA
    if (user.isTwoFactorEnabled && !isDemoAccount) {
      const tempToken = generateAccessToken(
        { ...basePayload, isTemp: true },
        '5m'
      );

      return {
        requiresTwoFactor: true,
        tempToken,
      };
    }

    // Force 2FA setup for Admin/Super Admin
    if (isUserAdmin && !user.isTwoFactorEnabled && !isDemoAccount) {
      const tempToken = generateAccessToken(
        { ...basePayload, isTemp: true },
        '10m'
      );

      return {
        requiresTwoFactorSetup: true,
        tempToken,
      };
    }

    // Generate tokens
    const tokens = generateTokenPair(basePayload);

    // Store refresh token & update last login in parallel
    const [, , activeAcademicYearId] = await Promise.all([
      prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.getActiveAcademicYearId(),
    ]);

    // Return user without sensitive fields
    const userWithoutPassword = this.stripSensitiveFields(user);

    return {
      user: {
        ...userWithoutPassword,
        academicYearId: activeAcademicYearId,
        permissions,
      },
      ...tokens,
    };
  }

  /**
   * Register new user (by admin)
   */
  async register(input: RegisterInput, creatorRoleCode: string) {
    // Resolve legacy `role` field to a concrete RoleCode when roleCode is not supplied.
    // This is deferred from schema validation because the correct per-unit RoleCode
    // depends on the target Unit's type (TKQ_GURU vs SDIT_GURU vs SMPIT_GURU vs SMAQ_GURU).
    let resolvedRoleCode: RoleCode;

    // Validate the target unit exists whenever unitId is provided, regardless
    // of whether the caller used the new `roleCode` field or the legacy `role`
    // field. Without this, the `roleCode` path would skip validation and fail
    // later at user.create() with an opaque Prisma FK constraint error instead
    // of a clean 400 response.
    let unitType: UnitType | null = null;
    if (input.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: input.unitId },
        select: { type: true },
      });
      if (!unit) {
        throw Errors.badRequest(`Unit '${input.unitId}' not found`);
      }
      unitType = unit.type;
    }

    if (input.roleCode) {
      resolvedRoleCode = input.roleCode;
    } else if (input.role) {
      const mapped = resolveLegacyRoleToRoleCode(input.role, unitType);
      if (!mapped) {
        throw Errors.badRequest(
          `Cannot resolve legacy role '${input.role}' for unit type '${unitType ?? 'unknown'}'. ` +
          `Please send 'roleCode' instead.`
        );
      }
      resolvedRoleCode = mapped;
    } else {
      // Should be unreachable due to schema .refine(), but be defensive.
      throw Errors.badRequest('Either roleCode or role is required');
    }

    // Validate the requested role exists
    const role = await prisma.role.findFirst({
      where: { code: resolvedRoleCode, isActive: true },
    });

    if (!role) {
      throw Errors.badRequest(`Role code '${resolvedRoleCode}' not found or inactive`);
    }

    // Only Super Admin can create Super Admin
    if (resolvedRoleCode === RoleCode.SUPER_ADMIN && creatorRoleCode !== RoleCode.SUPER_ADMIN) {
      throw Errors.forbidden('Only Super Admin can create Super Admin');
    }

    // Privilege escalation guard: only SUPER_ADMIN can create ANY admin-level
    // role. Without this, a unit-admin (e.g. TKQ_ADMIN) could create an admin
    // for a different unit (e.g. SMAQ_ADMIN) or a foundation-level SUPER_ADMIN,
    // bypassing organizational boundaries.
    //
    // NOTE: SUPER_ADMIN creating SUPER_ADMIN falls through the earlier guard
    // (line 284) because both sides of the condition are SUPER_ADMIN. This
    // second check still correctly allows SUPER_ADMIN creators through via
    // the `creatorRoleCode !== RoleCode.SUPER_ADMIN` term.
    //
    // BEHAVIOR CHANGE: Previously a UNIT_ADMIN could create other UNIT_ADMINs.
    // That is no longer allowed — admin account creation is now restricted to
    // SUPER_ADMIN only. Foundations needing delegated admin creation must
    // promote the delegate to SUPER_ADMIN or create the accounts centrally.
    if (isAdminRoleCode(resolvedRoleCode) && creatorRoleCode !== RoleCode.SUPER_ADMIN) {
      throw Errors.forbidden('Only Super Admin can create admin-level accounts');
    }

    // Privilege escalation guard: only SUPER_ADMIN can create Yayasan-level
    // governance roles (PEMBINA, KETUA, SEKRETARIS, BENDAHARA, ANGGOTA,
    // PENGAWAS). These are not classified as admin in ADMIN_ROLE_CODES (by
    // design — they are organizational governance, not system administration),
    // but they DO carry elevated privileges: cross-unit counseling read
    // access (see FOUNDATION_LEVEL_ROLES in counseling.service.ts) and
    // legacy UNIT_ADMIN expansion via LEGACY_ROLE_EXPANSION.
    //
    // Without this guard, a unit-level admin (e.g. SDIT_ADMIN) could
    // register a user with YAYASAN_PEMBINA by bypassing both the
    // SUPER_ADMIN-only and the isAdminRoleCode guards above.
    if (isGovernanceRoleCode(resolvedRoleCode) && creatorRoleCode !== RoleCode.SUPER_ADMIN) {
      throw Errors.forbidden('Only Super Admin can create governance-level accounts');
    }

    // Check if email exists
    const existing = await prisma.user.findFirst({
      where: { email: input.email },
    });

    if (existing) {
      throw Errors.conflict('Email already registered');
    }

    // Validate unit for non-super-admin roles
    if (resolvedRoleCode !== RoleCode.SUPER_ADMIN && !input.unitId) {
      throw Errors.badRequest('Unit is required for this role');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user + role assignment in a transaction.
    // The legacy `role` column is populated for backward compatibility so that
    // external tools, reports, and raw SQL queries that depend on it continue
    // to work during the migration period.
    //
    // IMPORTANT: We deliberately refuse to write NULL to the legacy column.
    // Although the Prisma schema was made nullable (`UserRole?`) to support
    // pre-existing data during migration, introducing NEW rows with
    // `role = NULL` would break any downstream consumer (BI tools, audit
    // queries, raw SQL reports) that assumes `role IS NOT NULL`. We would
    // rather fail loudly here than silently create unmapped rows.
    const VALID_LEGACY_ROLES = ['SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'];
    const legacyRole = deriveLegacyRole(resolvedRoleCode);
    if (!VALID_LEGACY_ROLES.includes(legacyRole)) {
      throw Errors.badRequest(
        `RoleCode '${resolvedRoleCode}' has no legacy UserRole mapping. ` +
        `Add a mapping to LEGACY_ROLE_EXPANSION in middleware/auth.ts or use an existing mapped role.`
      );
    }
    const legacyRoleValue = legacyRole;
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: legacyRoleValue as any, // Populate legacy column (always non-null for new users)
          unitId: input.unitId,
          isActive: true,
        },
      });

      await tx.userRoleAssignment.create({
        data: {
          userId: newUser.id,
          roleId: role.id,
          unitId: input.unitId,
          isPrimary: true,
          isActive: true,
        },
      });

      return newUser;
    });

    // Return without sensitive fields
    const userWithoutPassword = this.stripSensitiveFields(user);

    const activeAcademicYearId = await this.getActiveAcademicYearId();

    return {
      ...userWithoutPassword,
      roleCode: resolvedRoleCode,
      academicYearId: activeAcademicYearId,
    };
  }

  /**
   * Refresh tokens
   */
  async refreshToken(refreshToken: string) {
    // Verify token
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      throw Errors.unauthorized('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw Errors.unauthorized('Invalid token type');
    }

    // Check if token exists in database
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            userRoles: {
              where: activeRoleWhere(),
              include: { role: true },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
    });

    if (!storedToken) {
      throw Errors.unauthorized('Refresh token not found or expired');
    }

    if (!storedToken.user.isActive) {
      throw Errors.unauthorized('Account is deactivated');
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Get primary role — with legacy fallback for unmigrated users
    const primaryAssignment =
      storedToken.user.userRoles.find((r) => r.isPrimary) || storedToken.user.userRoles[0];

    let refreshRoleCode: string;
    let permissions: string[];
    let refreshRoleId: string | undefined;
    let refreshUnitId: string | null | undefined;

    if (primaryAssignment) {
      refreshRoleCode = primaryAssignment.role.code;
      permissions = (primaryAssignment.role.permissions as string[]) || [];
      refreshRoleId = primaryAssignment.roleId;
      refreshUnitId = primaryAssignment.unitId;
    } else if (storedToken.user.role) {
      refreshRoleCode = storedToken.user.role;
      permissions = [];
      refreshRoleId = undefined;
      refreshUnitId = undefined;
    } else {
      throw Errors.forbidden('No active role assignment found');
    }

    // Generate new tokens
    const tokens = generateTokenPair({
      id: storedToken.user.id,
      sub: storedToken.user.id,
      email: storedToken.user.email,
      roleId: refreshRoleId || '',
      roleCode: refreshRoleCode,
      unitId: refreshUnitId || storedToken.user.unitId,
      permissions,
      role: deriveLegacyRole(refreshRoleCode),
    });

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: storedToken.user.id,
        expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
      },
    });

    return tokens;
  }

  /**
   * Logout (invalidate refresh token)
   */
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Delete specific token
      await prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });
    } else {
      // Delete all refresh tokens for user
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string) {
    const [user, activeAcademicYearId] = await Promise.all([
      prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        include: {
          unit: true,
          student: true,
          userRoles: {
            where: activeRoleWhere(),
            include: {
              role: true,
              unit: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
        },
      }),
      this.getActiveAcademicYearId(),
    ]);

    if (!user) {
      throw Errors.notFound('User');
    }

    // Get active role permissions
    const primaryAssignment = user.userRoles.find((r) => r.isPrimary) || user.userRoles[0];
    const permissions = (primaryAssignment?.role.permissions as string[]) || [];

    const userWithoutPassword = this.stripSensitiveFields(user);

    return {
      ...userWithoutPassword,
      academicYearId: activeAcademicYearId,
      permissions,
    };
  }

  /**
   * Helper to get active academic year ID
   */
  private async getActiveAcademicYearId(): Promise<string | undefined> {
    const activeAcademicYear = await prisma.academicYear.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    return activeAcademicYear?.id;
  }

  /**
   * Change password
   */
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    // No credential to change. Unreachable through the UI — an identity row
    // cannot sign in, so it cannot hold a token to reach this route — but the
    // check belongs here rather than resting on that being true forever.
    if (!user.passwordHash) {
      throw Errors.badRequest('This record has no login to change');
    }

    const isValid = await comparePassword(input.currentPassword, user.passwordHash);

    if (!isValid) {
      throw Errors.badRequest('Current password is incorrect');
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { message: 'Password changed successfully' };
  }

  // ==========================================
  // Password reset (the "lupa password" flow)
  // ==========================================
  //
  // `resetTokenHash` and `resetTokenExpiresAt` have been on `users` since the
  // onboarding orchestrator started minting tokens for new santri and wali
  // accounts. Nothing could redeem them: there was no endpoint and no page, so
  // every "set your password" e-mail led to the login wall. These two methods
  // are the missing half.
  //
  // The token itself is never stored — only its SHA-256 — so a database dump
  // does not hand anyone a working reset link.

  /**
   * Mint a reset token for one account, for an admin to have e-mailed.
   *
   * Admin-only by design (see `sendPasswordResetSchema`), which is why this
   * takes a user id and reports real errors: there is no anonymous caller to
   * hide the account's existence from, and an admin who mistypes deserves to be
   * told rather than left watching nothing happen.
   */
  async issuePasswordResetToken(userId: string): Promise<{
    userId: string;
    email: string;
    name: string;
    token: string;
    expiresInHours: number;
  }> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, name: true, passwordHash: true, isActive: true },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    if (!user.isActive) {
      throw Errors.badRequest('Akun ini nonaktif — aktifkan lebih dulu sebelum mengirim tautan reset');
    }

    // An identity row with no login cannot have its password reset.
    if (!user.passwordHash) {
      throw Errors.badRequest('Data ini tidak memiliki akun login');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresInHours = 1;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        resetTokenExpiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      },
    });

    return { userId: user.id, email: user.email, name: user.name, token, expiresInHours };
  }

  /**
   * Redeem a reset token and set the new password.
   *
   * Deliberately gives one undifferentiated error for "no such token",
   * "already used" and "expired": telling them apart only helps someone
   * guessing.
   */
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: { gt: new Date() },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!user) {
      throw Errors.badRequest('Link reset tidak valid atau sudah kedaluwarsa');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Single use. Without this the same link keeps working until it
        // expires, which is an hour of anyone who read the inbox being able to
        // take the account back.
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });

    // Whoever asked for this reset may be locking someone else out on purpose.
    // Ending every existing session is the point.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return { message: 'Password berhasil diperbarui. Silakan masuk dengan password baru Anda.' };
  }

  // ==========================================
  // 2FA Methods
  // ==========================================

  /**
   * Generate 2FA Secret
   */
  async generateTwoFactorSecret(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound('User');

    if (user.isTwoFactorEnabled) {
      throw Errors.badRequest('2FA is already enabled');
    }

    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'Cipansor App', label: user.email, secret });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    // BUG FIX: Store pending secret server-side
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecretPending: secret },
    });

    return {
      secret, // Still return for manual entry if needed, but verification uses DB
      qrCodeUrl,
    };
  }

  /**
   * Enable 2FA
   */
  async enableTwoFactor(userId: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound('User');

    if (user.isTwoFactorEnabled) {
      throw Errors.badRequest('2FA is already enabled');
    }

    // BUG FIX: Verify against pending secret
    if (!user.twoFactorSecretPending) {
      throw Errors.badRequest('No pending 2FA setup found. Please generate a new code.');
    }

    const isValid = (await verifyOtp({ token, secret: user.twoFactorSecretPending })).valid;

    if (!isValid) {
      throw Errors.badRequest('Invalid OTP code');
    }

    const recoveryCodes = this.generateRecoveryCodes();

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: user.twoFactorSecretPending,
        twoFactorSecretPending: null, // Clear pending
        twoFactorRecoveryCodes: recoveryCodes,
      },
    });

    return { recoveryCodes };
  }

  /**
   * Verify 2FA Login
   */
  async verifyTwoFactorLogin(userId: string, token: string, isTemp?: boolean) {
    // Enforce 2FA flow: Must use a temporary token
    if (!isTemp) {
      throw Errors.unauthorized('Invalid authentication flow');
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        unit: true,
        userRoles: {
          where: activeRoleWhere(),
          include: {
            role: true,
            unit: true,
          },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });

    if (!user || !user.isActive) {
      throw Errors.unauthorized('Account is deactivated or not found');
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw Errors.unauthorized('2FA is not enabled for this user');
    }

    let isValid = (await verifyOtp({ token, secret: user.twoFactorSecret })).valid;

    // Check recovery codes if OTP failed (with atomic update to prevent race conditions)
    if (!isValid) {
      const result = await prisma.$executeRaw`
        UPDATE "users"
        SET "two_factor_recovery_codes" = array_remove("two_factor_recovery_codes", ${token})
        WHERE "id" = ${userId}
        AND ${token} = ANY("two_factor_recovery_codes")
      `;

      if (Number(result) > 0) {
        isValid = true;
      }
    }

    if (!isValid) {
      throw Errors.unauthorized('Invalid OTP code');
    }

    // Generate tokens — with legacy fallback for unmigrated users
    const primaryAssignment = user.userRoles.find((r) => r.isPrimary) || user.userRoles[0];

    let twoFaRoleCode: string;
    let permissions: string[];
    let twoFaRoleId: string | undefined;
    let twoFaUnitId: string | null | undefined;

    if (primaryAssignment) {
      twoFaRoleCode = primaryAssignment.role.code;
      permissions = (primaryAssignment.role.permissions as string[]) || [];
      twoFaRoleId = primaryAssignment.roleId;
      twoFaUnitId = primaryAssignment.unitId;
    } else if (user.role) {
      twoFaRoleCode = user.role;
      permissions = [];
      twoFaRoleId = undefined;
      twoFaUnitId = undefined;
    } else {
      throw Errors.forbidden('No active role assignment found');
    }

    const tokens = generateTokenPair({
      id: user.id,
      sub: user.id,
      email: user.email,
      roleId: twoFaRoleId || '',
      roleCode: twoFaRoleCode,
      unitId: twoFaUnitId || user.unitId,
      permissions,
      role: deriveLegacyRole(twoFaRoleCode),
    });

    const [, , activeAcademicYearId] = await Promise.all([
      prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.getActiveAcademicYearId(),
    ]);

    const userWithoutPassword = this.stripSensitiveFields(user);

    return {
      user: {
        ...userWithoutPassword,
        academicYearId: activeAcademicYearId,
        permissions,
      },
      ...tokens,
    };
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(userId: string, token: string, adminId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          where: activeRoleWhere(),
          include: { role: true },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });
    if (!user) throw Errors.notFound('User');

    const primaryTargetRole = user.userRoles.find((r) => r.isPrimary) || user.userRoles[0];
    // Fall back to the legacy User.role column for unmigrated users, consistent
    // with the login flow. Without this, a legacy SUPER_ADMIN with no
    // UserRoleAssignment would have targetRoleCode = '' and isTargetAdmin = false,
    // allowing non-SUPER_ADMIN admins to disable their 2FA.
    const targetRoleCode = primaryTargetRole?.role.code || user.role || '';
    const isTargetAdmin = isAdminRoleCode(targetRoleCode);

    if (adminId) {
      // Admin disabling for another user (Reset flow)
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            where: activeRoleWhere(),
            include: { role: true },
            orderBy: { isPrimary: 'desc' },
          },
        },
      });
      if (!admin || !admin.isTwoFactorEnabled || !admin.twoFactorSecret) {
        throw Errors.unauthorized('Admin must have 2FA enabled to perform this action');
      }

      const adminPrimaryRole = admin.userRoles.find((r) => r.isPrimary) || admin.userRoles[0];
      // Fall back to legacy User.role for unmigrated admin users
      const adminRoleCode = adminPrimaryRole?.role.code || admin.role || '';

      // Check Admin privileges
      if (!isAdminRoleCode(adminRoleCode)) {
        throw Errors.forbidden('Only Admins can disable 2FA for other users');
      }

      // Prevent non-SUPER_ADMIN from disabling 2FA for SUPER_ADMIN
      if (adminRoleCode !== RoleCode.SUPER_ADMIN && targetRoleCode === RoleCode.SUPER_ADMIN) {
        throw Errors.forbidden('Only SUPER_ADMIN can disable 2FA for SUPER_ADMIN');
      }

      // Non-SUPER_ADMIN admins can only manage users in same unit
      if (adminRoleCode !== RoleCode.SUPER_ADMIN) {
        if (admin.unitId !== user.unitId) {
          throw Errors.forbidden('Admin can only disable 2FA for users in their own unit');
        }
        // Peer protection: non-SUPER_ADMIN admin cannot disable other admins
        if (isTargetAdmin) {
          throw Errors.forbidden('Admin cannot disable 2FA for other admin accounts');
        }
      }

      // Check if target user actually has 2FA enabled
      if (!user.isTwoFactorEnabled) {
        throw Errors.badRequest('2FA is not enabled for this user');
      }

      // Verify ADMIN's OTP
      const isValid = (await verifyOtp({ token, secret: admin.twoFactorSecret })).valid;
      if (!isValid) throw Errors.unauthorized('Invalid Admin OTP');
    } else {
      // User disabling their own
      if (isTargetAdmin) {
        throw Errors.forbidden('2FA cannot be disabled for Admin accounts');
      }

      if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
        throw Errors.badRequest('2FA is not enabled');
      }
      // Verify USER's OTP
      const isValid = (await verifyOtp({ token, secret: user.twoFactorSecret })).valid;
      if (!isValid) throw Errors.unauthorized('Invalid OTP');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorSecretPending: null,
        twoFactorRecoveryCodes: [],
      },
    });

    return { message: '2FA disabled successfully' };
  }

  /**
   * Get 2FA Status
   */
  async getTwoFactorStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isTwoFactorEnabled: true },
    });

    if (!user) throw Errors.notFound('User');

    return { isEnabled: user.isTwoFactorEnabled };
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  }

  /**
   * Strip every sensitive field from a user record before returning it to a
   * client. Covers the password hash, the 2FA secrets/recovery codes, and the
   * password-reset token hash + expiry (these must never leave the server).
   */
  private stripSensitiveFields<
    T extends {
      passwordHash?: unknown;
      twoFactorSecret?: unknown;
      twoFactorSecretPending?: unknown;
      twoFactorRecoveryCodes?: unknown;
      resetTokenHash?: unknown;
      resetTokenExpiresAt?: unknown;
    },
  >(user: T) {
    const {
      passwordHash: _ph,
      twoFactorSecret: _ts,
      twoFactorSecretPending: _tsp,
      twoFactorRecoveryCodes: _trc,
      resetTokenHash: _rth,
      resetTokenExpiresAt: _rte,
      ...safe
    } = user;
    return safe;
  }


}

export const authService = new AuthService();
