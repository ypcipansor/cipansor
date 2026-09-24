import { prisma } from '@/lib/prisma';
import { tokenUnitId } from '@/utils/resolve-unit-id';
import { hashPassword, comparePassword } from '@/lib/password';
import { generateTokenPair, verifyToken, getExpirationDate, generateAccessToken } from '@/lib/jwt';
import { Errors } from '@/middleware/error';
import { isAdminRoleCode, isGovernanceRoleCode, deriveLegacyRole } from '@/middleware/auth';
import { config } from '@/config';
import type { LoginInput, RegisterInput, ChangePasswordInput } from './auth.schema';
import { BoardSuspensionStatus, RoleCode, UnitType } from '@prisma/client';
import { lockUserAssignmentRows } from '@/utils/role-assignment-lock';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import * as qrcode from 'qrcode';
import crypto from 'crypto';

/**
 * Lifetime of the 2FA temporary token, in one place.
 *
 * The cookie that carries the token is set for exactly this long. They used to
 * be independent literals — a 5-minute cookie default against a 10-minute token
 * for the mandatory-setup flow — so an admin part-way through enrolling an
 * authenticator had the cookie vanish under a token the server still accepted.
 * The token TTL is the source of truth; the cookie is derived from it.
 */
const TWO_FACTOR_TEMP_TTL = '5m';
const TWO_FACTOR_SETUP_TTL = '10m';

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
  unitType: UnitType | null | undefined
): RoleCode | null {
  // Unit-agnostic mappings
  if (legacyRole === 'SUPER_ADMIN') return RoleCode.SUPER_ADMIN;
  if (legacyRole === 'UNIT_ADMIN') {
    switch (unitType) {
      case UnitType.TK_QURAN:
        return RoleCode.TKQ_ADMIN;
      case UnitType.SD_IT:
        return RoleCode.SDIT_ADMIN;
      case UnitType.SMP_IT:
        return RoleCode.SMPIT_ADMIN;
      case UnitType.SMA_QURAN:
        return RoleCode.SMAQ_ADMIN;
      // PESANTREN / OTHER / unknown: no dedicated per-unit admin RoleCode exists.
      // Do NOT silently fall back to a foundation-level role — that would be a privilege
      // escalation (foundation-level governance) for a unit-level admin.
      // Caller must supply `roleCode` explicitly for these unit types.
      default:
        return null;
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
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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
    //
    // This snapshot decides whether 2FA is demanded and feeds the temporary
    // token. It is *indicative* only: the authoritative claims for the session
    // itself are re-derived under the row lock at issuance below, because a
    // revocation or role change can land between the two.
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
      unitId: tokenUnitId(assignmentUnitId, roleCode, user.unitId),
      permissions,
      role: deriveLegacyRole(roleCode),
    };

    // There is no demo exemption from 2FA any more (DEMO_MODE was removed
    // 2026-09-23): it waived the second factor for every account, Super Admin
    // included, on a deployment whose seeded passwords are published in the
    // repository. Test environments pre-enrol admins with a fixed TOTP secret
    // instead (seed.ts, E2E_FIXED_2FA=1).

    // Check for 2FA
    if (user.isTwoFactorEnabled) {
      const tempToken = generateAccessToken({ ...basePayload, isTemp: true }, TWO_FACTOR_TEMP_TTL);

      return {
        requiresTwoFactor: true,
        tempToken,
        // The cookie that carries this token must not outlive it, nor expire
        // before it. Both are derived from the one constant, so the two cannot
        // disagree: the mandatory-setup token used to be minted for 10 minutes
        // while its cookie was capped at 5, and the user hit a "session
        // expired" wall with a token still valid in the browser.
        tempTokenExpiresIn: TWO_FACTOR_TEMP_TTL,
      };
    }

    // Force 2FA setup for Admin/Super Admin
    if (isUserAdmin && !user.isTwoFactorEnabled) {
      const tempToken = generateAccessToken({ ...basePayload, isTemp: true }, TWO_FACTOR_SETUP_TTL);

      return {
        requiresTwoFactorSetup: true,
        tempToken,
        tempTokenExpiresIn: TWO_FACTOR_SETUP_TTL,
      };
    }

    // Issue the refresh token inside a transaction that re-asserts the account
    // state under a row lock, then writes the token in the same commit.
    //
    // The password check above and the insert below are separated by a round
    // trip; a suspension that commits in between switches the account off and
    // deletes the refresh tokens it can see — but a token created *after* that
    // delete survives it and would authenticate away the suspension. Locking
    // the user row for the re-check and the insert serialises the two: a
    // suspension cannot commit between them, and one that already committed is
    // visible to the locked re-read. The lock order (user row first) matches
    // `refreshToken`, the 2FA completion, and `BoardSuspensionService`, so the
    // paths are compatible rather than a new cycle.
    //
    // The session's claims are re-derived here, not from the pre-lock snapshot:
    // the assignment rows are locked too, and the effective assignment is read
    // through `tx`. A revocation or role change that lands between the password
    // check and this commit must not produce a token carrying the old role — the
    // very escalation the reviewer flagged. An account left with no qualifying
    // assignment is refused (403) rather than issued a legacy-role token.
    const activeAcademicYearId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "users"
        WHERE id = ${user.id} AND is_active = true AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (claimed.length !== 1) {
        throw Errors.unauthorized('Account is deactivated');
      }

      await lockUserAssignmentRows(tx, [user.id]);

      const blockingSuspension = await tx.boardMemberSuspension.findFirst({
        where: { userId: user.id, status: BoardSuspensionStatus.ACTIVE },
        select: { id: true },
      });
      if (blockingSuspension) {
        throw Errors.unauthorized('Account is deactivated');
      }

      // Re-read the effective assignment under the lock. Primary wins; else the
      // first active, non-expired assignment on an active role.
      const assignments = await tx.userRoleAssignment.findMany({
        where: {
          userId: user.id,
          ...activeRoleWhere(),
          role: { isActive: true },
        },
        include: { role: true },
        orderBy: { isPrimary: 'desc' },
      });
      const effective = assignments.find((r) => r.isPrimary) || assignments[0];

      if (!effective) {
        // No qualifying assignment. The legacy `user.role` fallback is only for
        // an account that never had an assignment at all; a revoked assignment
        // must not fall back to the coarse legacy role, which is exactly the
        // stale-privilege hole this guard closes.
        if (user.userRoles.length > 0) {
          throw Errors.forbidden('No active role assignment found');
        }
        throw Errors.forbidden('No active role assignment found for this user');
      }

      const freshRoleCode = effective.role.code;
      const freshPermissions = (effective.role.permissions as string[]) || [];

      // Re-check the second factor against the *locked* account row, and refuse
      // a session whose role is not the one the password step authenticated.
      //
      // The 2FA decision above is taken from the pre-lock snapshot: whether the
      // account must present a second factor is derived from
      // `user.isTwoFactorEnabled`, and the account is only challenged when the
      // snapshot role is an admin without 2FA. Both facts can move between the
      // password check and this commit — an admin assignment can become primary,
      // or 2FA can be switched off. Without this re-read, an account whose
      // snapshot role was an ordinary one reaches this branch, sees a freshly
      // *admin* `effective`, and is handed an admin session with no second
      // factor at all (CWE-287). Reading the flag through `tx` under the user
      // lock makes it the value that holds at commit.
      //
      // A role that differs from the snapshot is refused as well, for every
      // role and not only admin ones: the password step was answered against
      // the snapshot's role, so a change in between means this request's
      // authentication no longer describes the session it is about to mint. The
      // user is asked to authenticate again against the current role — safer
      // than minting a token for a role that was never password-verified.
      const freshAccount = await tx.user.findUnique({
        where: { id: user.id },
        select: { isTwoFactorEnabled: true },
      });
      if (!freshAccount) {
        throw Errors.unauthorized('Account is deactivated');
      }

      if (effective.roleId !== roleId) {
        throw Errors.conflict(
          'Peran akun berubah saat login. Silakan login ulang untuk memakai peran terbaru.'
        );
      }

      if (isAdminRoleCode(freshRoleCode) && !freshAccount.isTwoFactorEnabled) {
        throw Errors.conflict(
          'Peran admin memerlukan verifikasi dua faktor. Silakan login ulang untuk menyiapkan 2FA.'
        );
      }

      const tokens = generateTokenPair({
        id: user.id,
        sub: user.id,
        email: user.email,
        roleId: effective.roleId || '',
        roleCode: freshRoleCode,
        unitId: tokenUnitId(effective.unitId, freshRoleCode, user.unitId),
        permissions: freshPermissions,
        role: deriveLegacyRole(freshRoleCode),
      });

      await tx.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        tokens,
        permissions: freshPermissions,
        academicYearId: await this.getActiveAcademicYearId(),
        // The live assignment rows, so the response's `userRoles` describes the
        // same role the token just minted rather than the pre-lock snapshot.
        userRoles: assignments,
      };
    });

    // Return user without sensitive fields. `userRoles` is overridden with the
    // assignments read under the lock: the snapshot was taken before the
    // password check, so a role change in between left the response advertising
    // a role the token no longer carried — and the web derives its primary role
    // from exactly this field (`getPrimaryRoleCode`), so it would render the
    // wrong controls. `stripSensitiveFields` still runs over the whole user.
    const { userRoles: _staleUserRoles, ...userWithoutPassword } = this.stripSensitiveFields(user);

    return {
      user: {
        ...userWithoutPassword,
        userRoles: activeAcademicYearId.userRoles,
        academicYearId: activeAcademicYearId.academicYearId,
        permissions: activeAcademicYearId.permissions,
      },
      ...activeAcademicYearId.tokens,
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
    const VALID_LEGACY_ROLES = [
      'SUPER_ADMIN',
      'UNIT_ADMIN',
      'TEACHER',
      'STAFF',
      'STUDENT',
      'PARENT',
    ];
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

    // Locate the token row cheaply, without its role graph.
    //
    // The role snapshot that becomes the new token's claims must be read under
    // the same lock the writers take (see `utils/role-assignment-lock.ts`), not
    // here: a revocation that commits between this read and token issuance would
    // otherwise leave the replacement token stamped with a role the user no
    // longer holds. This read only proves the presented token exists so a
    // missing/expired token stays a 401 before the transaction opens.
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true, role: true, unitId: true } } },
    });

    if (!storedToken) {
      throw Errors.unauthorized('Refresh token not found or expired');
    }

    // Re-validate the persistent state, not just `isActive`. A suspension
    // deletes the refresh tokens it can see, but a token issued after that
    // delete — or one whose row survived a partial failure — must still be
    // refused here. A soft delete is checked for the same reason `authenticate`
    // checks it: `deletedAt` leaves `isActive` untouched. (Re-checked under the
    // lock below; this is the fast fail.)
    if (await this.isAccountUnusable(payload.sub)) {
      throw Errors.unauthorized('Account is deactivated');
    }

    // Rotate the token inside a transaction that re-asserts the account state
    // under a row lock, then mints the replacement in the same commit.
    //
    // The check above and the rotation below are separated by a round trip; a
    // suspension that commits in between deletes the refresh tokens it can see
    // and switches the account off — but a token *created* after that delete
    // survives it and would authenticate away the suspension. Locking the user
    // row for the check and the insert serialises the two: a suspension cannot
    // commit between them, and a suspension that already committed is visible
    // to the locked re-read. The loser gets a plain 401 rather than a token.
    //
    // The assignment rows are locked too, and the effective assignment is
    // re-read through `tx` — so a revocation or a role change that lands between
    // the fast-fail above and this commit cannot be baked into the new token.
    // Lock order matches every other writer: user row, then assignments.
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "users"
        WHERE id = ${payload.sub} AND is_active = true AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (claimed.length !== 1) {
        throw Errors.unauthorized('Account is deactivated');
      }

      await lockUserAssignmentRows(tx, [payload.sub]);

      const blockingSuspension = await tx.boardMemberSuspension.findFirst({
        where: { userId: payload.sub, status: BoardSuspensionStatus.ACTIVE },
        select: { id: true },
      });
      if (blockingSuspension) {
        throw Errors.unauthorized('Account is deactivated');
      }

      // Re-read the effective assignment under the lock. Only active, non-expired
      // assignments on an active role count; the primary wins, else the first.
      const assignments = await tx.userRoleAssignment.findMany({
        where: {
          userId: payload.sub,
          ...activeRoleWhere(),
          role: { isActive: true },
        },
        include: { role: true },
        orderBy: { isPrimary: 'desc' },
      });
      const primaryAssignment = assignments.find((r) => r.isPrimary) || assignments[0];

      // The legacy fallback below is for an account that *never* held an
      // assignment — an unmigrated user, or one whose module was decommissioned
      // and whose `users.role` was nulled. An account whose assignments all
      // expired, went inactive, or were revoked is *not* that: counting every
      // row (not just the active ones) is what separates the two, so a revoked
      // or expired assignment can never reinstate `users.role`'s coarse
      // privilege — the exact escalation this guard closes.
      const totalAssignments = await tx.userRoleAssignment.count({
        where: { userId: payload.sub },
      });

      let refreshRoleCode: string;
      let permissions: string[];
      let refreshRoleId: string | undefined;
      let refreshUnitId: string | null | undefined;

      if (primaryAssignment) {
        refreshRoleCode = primaryAssignment.role.code;
        permissions = (primaryAssignment.role.permissions as string[]) || [];
        refreshRoleId = primaryAssignment.roleId;
        refreshUnitId = primaryAssignment.unitId;
      } else if (storedToken.user.role && totalAssignments === 0) {
        // Legacy fallback — only when the user holds no assignment row at all,
        // never as a substitute for one that was just revoked or has expired.
        refreshRoleCode = storedToken.user.role;
        permissions = [];
        refreshRoleId = undefined;
        refreshUnitId = undefined;
      } else {
        throw Errors.forbidden('No active role assignment found');
      }

      // Consume the presented token with a conditional delete, not `delete`.
      //
      // `delete({ where: { id } })` throws Prisma `P2025` when the row is gone,
      // which the error handler maps to 500. Two parallel refreshes with the
      // same token both pass the read above; the first deletes the row and mints
      // a replacement, and the second then hit P2025 — so a perfectly ordinary
      // concurrent refresh surfaced as an internal error instead of the 401 that
      // means "this token is already spent". `deleteMany` reports a rowcount, so
      // the loser is identified rather than crashing: zero rows affected means
      // someone else rotated first, and that is a replay, which fails closed.
      //
      // Rotation and replay protection are unchanged: exactly one caller
      // consumes the row, and every later use of the same token is refused.
      const consumed = await tx.refreshToken.deleteMany({
        where: { id: storedToken.id, token: refreshToken },
      });
      if (consumed.count !== 1) {
        throw Errors.refreshRace();
      }

      const tokens = generateTokenPair({
        id: storedToken.user.id,
        sub: storedToken.user.id,
        email: storedToken.user.email,
        roleId: refreshRoleId || '',
        roleCode: refreshRoleCode,
        unitId: tokenUnitId(refreshUnitId, refreshRoleCode, storedToken.user.unitId),
        permissions,
        role: deriveLegacyRole(refreshRoleCode),
      });

      await tx.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: storedToken.user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      });

      return tokens;
    });
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
   * True when the account may not hold a session at all: soft-deleted,
   * inactive, or under an ACTIVE board suspension.
   *
   * Reads the same three persistent facts `utils/user-suspension.ts` does, but
   * directly rather than through the Redis-cached helper: a token-issuing path
   * must not be answered from a cache that can lag the database. The cache is
   * there to answer "is this *existing* token still usable" quickly; the
   * question here is "may a *new* one exist", and a stale permissive answer to
   * that is exactly the failure this guards.
   */
  private async isAccountUnusable(userId: string): Promise<boolean> {
    const [user, activeSuspension] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true, deletedAt: true },
      }),
      prisma.boardMemberSuspension.findFirst({
        where: { userId, status: BoardSuspensionStatus.ACTIVE },
        select: { id: true },
      }),
    ]);
    return !user || !user.isActive || !!user.deletedAt || !!activeSuspension;
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
      throw Errors.badRequest(
        'Akun ini nonaktif — aktifkan lebih dulu sebelum mengirim tautan reset'
      );
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

    if (await this.isAccountUnusable(userId)) {
      throw Errors.unauthorized('Account is deactivated or not found');
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

    // A recovery code is not a 6-digit TOTP, and otplib v13 *throws*
    // (`TokenLengthError`) rather than answering `{ valid: false }` for one.
    // Letting that bubble meant a recovery code surfaced as a 500 and never
    // reached the fallback below — the codes were unreachable through the very
    // endpoint meant to redeem them. A malformed OTP is simply not a valid
    // TOTP, so it falls through to the recovery-code path.
    let isTotpValid = false;
    try {
      isTotpValid = (await verifyOtp({ token, secret: user.twoFactorSecret })).valid;
    } catch {
      isTotpValid = false;
    }

    // Re-validate the persistent account state immediately before the tokens
    // exist, and create them in the same transaction that asserts it.
    //
    // The check at the top of this method and the token issuance below are
    // separated by an OTP verification — plenty of time for a suspension to
    // commit. Without this second read, the exact race the caller asked about
    // survives: a temporary token minted before the suspension, a suspension
    // that commits while the operator types the code, and a brand-new
    // access+refresh pair for an account that was switched off a moment
    // earlier. The suspension deletes the refresh tokens it can see; this one
    // would be created after that delete and outlive it.
    //
    // A recovery code is both *validated* and *consumed* here, not before it,
    // and in the same transaction that takes the row lock. The previous version
    // removed the code with a raw `UPDATE` ahead of this transaction, so a
    // suspension or deactivation that landed in the gap refused the login but
    // destroyed the code — the operator was permanently locked out of the
    // account by a login that never succeeded. Consuming it only after the
    // account-state checks pass, under the same `FOR UPDATE` lock that
    // serialises two parallel redemptions, means a failed login leaves the code
    // intact and the same code cannot be redeemed twice.
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "users"
        WHERE id = ${userId} AND is_active = true AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (claimed.length !== 1) {
        throw Errors.unauthorized('Account is deactivated or not found');
      }

      await lockUserAssignmentRows(tx, [userId]);

      const blockingSuspension = await tx.boardMemberSuspension.findFirst({
        where: {
          userId,
          status: BoardSuspensionStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (blockingSuspension) {
        throw Errors.unauthorized('Account is deactivated or not found');
      }

      // Resolve the effective assignment *before* consuming a recovery code.
      //
      // The code is a one-shot credential: consuming it for a login that is
      // then refused locks the operator out permanently. So the assignment the
      // session will carry is resolved first — under the lock, from `tx` — and
      // a user left with no qualifying assignment is refused (403) with the
      // code untouched. Only then is a recovery code compared-and-removed.
      const assignments = await tx.userRoleAssignment.findMany({
        where: {
          userId,
          ...activeRoleWhere(),
          role: { isActive: true },
        },
        include: { role: true },
        orderBy: { isPrimary: 'desc' },
      });
      const primaryAssignment = assignments.find((r) => r.isPrimary) || assignments[0];

      // Distinguish "never held an assignment" (unmigrated legacy account) from
      // "every assignment expired, went inactive, or was revoked". The legacy
      // column must only rescue the former; counting all rows, not just the
      // active ones, is what makes the check meaningful.
      const totalAssignments = await tx.userRoleAssignment.count({ where: { userId } });

      let twoFaRoleCode: string;
      let permissions: string[];
      let twoFaRoleId: string | undefined;
      let twoFaUnitId: string | null | undefined;

      if (primaryAssignment) {
        twoFaRoleCode = primaryAssignment.role.code;
        permissions = (primaryAssignment.role.permissions as string[]) || [];
        twoFaRoleId = primaryAssignment.roleId;
        twoFaUnitId = primaryAssignment.unitId;
      } else if (totalAssignments === 0 && user.role) {
        // Legacy fallback only for an account that never held an assignment.
        // A revoked or expired assignment must not fall back to the coarse
        // legacy role.
        twoFaRoleCode = user.role;
        permissions = [];
        twoFaRoleId = undefined;
        twoFaUnitId = undefined;
      } else {
        throw Errors.forbidden('No active role assignment found');
      }

      // Recovery-code path. The row is locked above, so the matching UPDATE and
      // the rowcount together are an atomic compare-and-remove: the first
      // parallel request to reach this point removes the code and sees one row
      // affected; a second request with the same code blocks on the lock, then
      // re-evaluates `ANY` against the now-removed code and sees none. Only a
      // positive rowcount may authorise the login — an unknown code never does.
      //
      // This runs *after* the account-state and assignment checks on purpose: a
      // code is consumed only once the login is otherwise permitted, so a
      // suspension, deactivation or revoked role cannot destroy a code for a
      // login that was refused.
      let isValid = isTotpValid;
      if (!isValid) {
        const consumed = await tx.$executeRaw`
          UPDATE "users"
          SET "two_factor_recovery_codes" = array_remove("two_factor_recovery_codes", ${token})
          WHERE "id" = ${userId}
          AND ${token} = ANY("two_factor_recovery_codes")
        `;
        if (Number(consumed) > 0) {
          isValid = true;
        }
      }

      if (!isValid) {
        throw Errors.unauthorized('Invalid OTP code');
      }

      const tokens = generateTokenPair({
        id: user.id,
        sub: user.id,
        email: user.email,
        roleId: twoFaRoleId || '',
        roleCode: twoFaRoleCode,
        unitId: tokenUnitId(twoFaUnitId, twoFaRoleCode, user.unitId),
        permissions,
        role: deriveLegacyRole(twoFaRoleCode),
      });

      const [, , activeAcademicYearId] = await Promise.all([
        tx.refreshToken.create({
          data: {
            token: tokens.refreshToken,
            userId: user.id,
            expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
          },
        }),
        tx.user.update({
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
    });
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
   * Strip every field that must not reach a client from a user record.
   *
   * Secrets: the password hash, the 2FA secrets/recovery codes, and the
   * password-reset token hash + expiry.
   *
   * Internal bookkeeping: `accountStateWriter` is the write-ownership marker
   * the suspension lift compares to prove it, and not a later admin, owns the
   * current `isActive`. No client reads it and it is not part of the shared
   * `User` DTO — and since the web mirrors the whole `/auth/me` payload into
   * the `auth-storage` cookie, shipping it spent bytes that cookie does not
   * have (see `apps/web/src/lib/auth-cookie.ts`).
   */
  private stripSensitiveFields<
    T extends {
      passwordHash?: unknown;
      twoFactorSecret?: unknown;
      twoFactorSecretPending?: unknown;
      twoFactorRecoveryCodes?: unknown;
      resetTokenHash?: unknown;
      resetTokenExpiresAt?: unknown;
      accountStateWriter?: unknown;
    },
  >(user: T) {
    const {
      passwordHash: _ph,
      twoFactorSecret: _ts,
      twoFactorSecretPending: _tsp,
      twoFactorRecoveryCodes: _trc,
      resetTokenHash: _rth,
      resetTokenExpiresAt: _rte,
      accountStateWriter: _asw,
      ...safe
    } = user;
    return safe;
  }
}

export const authService = new AuthService();
