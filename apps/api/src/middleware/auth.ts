import { Request, Response, NextFunction } from 'express';
import { RoleCode } from '@prisma/client';
import {
  ADMIN_ROLE_CODES as SHARED_ADMIN_ROLE_CODES,
  GOVERNANCE_ROLE_CODES as SHARED_GOVERNANCE_ROLE_CODES,
  LEGACY_ROLE_EXPANSION as SHARED_LEGACY_ROLE_EXPANSION,
} from '@cipansor/shared';
import { verifyToken, JwtPayload } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { Errors } from './error';

// RoleCodes that are considered "admin" across the system.
//
// Scope: system-administration privileges only (forced 2FA, register route
// access, disableTwoFactor security guards, isAdmin middleware).
//
// NOTE: KEPALA_SEKOLAH roles (TKQ_KEPALA_SEKOLAH, SDIT_KEPALA_SEKOLAH, etc.)
// are intentionally NOT included here. They are classified as teacher-level
// (in TEACHER_OR_ABOVE_CODES) rather than admin-level. This separates
// educational leadership from system administration. Schools that previously
// gave principals UNIT_ADMIN access should assign them a per-unit admin
// RoleCode (e.g. SDIT_ADMIN) in addition to their KEPALA_SEKOLAH role.
//
// NOTE: Yayasan governance roles (PEMBINA, KETUA, SEKRETARIS, BENDAHARA,
// ANGGOTA, PENGAWAS) are intentionally EXCLUDED. These represent organizational
// governance (board members, secretaries, auditors) — NOT system
// administrators. A board member (YAYASAN_ANGGOTA) or internal auditor
// (YAYASAN_PENGAWAS) should NOT automatically bypass admin-only security
// guards just because they were historically bucketed under legacy UNIT_ADMIN.
// Users that need BOTH governance AND system-admin privileges must be
// explicitly assigned SUPER_ADMIN (foundation) or a per-unit admin RoleCode
// in addition to their governance role.
//
// Legacy compatibility: pre-migration tokens carrying `role: 'UNIT_ADMIN'`
// still pass isAdmin() via the 'UNIT_ADMIN' string below. Routes that use
// authorize(YAYASAN_PEMBINA, ...) still work because authorize() uses
// expandRoleCodes() for bidirectional legacy mapping, independent of this list.
const ADMIN_ROLE_CODES: string[] = [...SHARED_ADMIN_ROLE_CODES];

/**
 * Backward-compatible mapping from legacy UserRole enum values to RoleCode values.
 * authorize() expands these so that existing route files using UserRole.UNIT_ADMIN,
 * UserRole.TEACHER, UserRole.STAFF etc. continue to work until fully migrated.
 * The mapping itself lives in @cipansor/shared (packages/shared/src/roles.ts)
 * so web and API derive the buckets from one source; a sync test in
 * middleware/roles-sync.test.ts pins it against the Prisma RoleCode enum.
 * TODO: Remove once all route files are migrated to RoleCode.
 */
const LEGACY_ROLE_EXPANSION: Record<string, string[]> = SHARED_LEGACY_ROLE_EXPANSION;

/**
 * Expand a list of role identifiers: legacy bucket names ('UNIT_ADMIN',
 * 'TEACHER', ...) used by unmigrated `authorize(UserRole.X)` call sites are
 * expanded to their RoleCode lists; native RoleCodes pass through unchanged.
 * Tokens always carry a real RoleCode, so no reverse expansion exists.
 */
function expandRoleCodes(codes: string[]): string[] {
  const expanded = new Set<string>();
  for (const code of codes) {
    const mapping = LEGACY_ROLE_EXPANSION[code];
    if (mapping) {
      mapping.forEach((rc) => expanded.add(rc));
    }
    expanded.add(code);
  }
  return Array.from(expanded);
}

/**
 * Reverse mapping: RoleCode → legacy UserRole enum value.
 * Used to populate the deprecated `req.user.role` field so that unmigrated
 * controllers/services that still compare against UserRole.SUPER_ADMIN,
 * UserRole.UNIT_ADMIN, etc. continue to work at runtime.
 * Built by inverting LEGACY_ROLE_EXPANSION.
 *
 * NOTE: Yayasan governance roles (PEMBINA, KETUA, SEKRETARIS, BENDAHARA,
 * ANGGOTA, PENGAWAS) map to 'UNIT_ADMIN' via LEGACY_ROLE_EXPANSION.
 * RoleCodes that have NO mapping (e.g. future custom roles) fall back to
 * the roleCode itself via deriveLegacyRole(), which means they will NOT
 * match any legacy UserRole comparison in unmigrated modules. This is
 * acceptable for new roles; those modules must be migrated to use roleCode.
 *
 * TODO: Remove once all modules are migrated to use roleCode.
 */
const ROLE_CODE_TO_LEGACY_ROLE: Record<string, string> = {};
for (const [legacyRole, roleCodes] of Object.entries(LEGACY_ROLE_EXPANSION)) {
  for (const rc of roleCodes) {
    // First mapping wins (e.g. SUPER_ADMIN maps to 'SUPER_ADMIN')
    if (!ROLE_CODE_TO_LEGACY_ROLE[rc]) {
      ROLE_CODE_TO_LEGACY_ROLE[rc] = legacyRole;
    }
  }
}

/**
 * Derive the legacy UserRole value from a RoleCode.
 * Falls back to the roleCode itself if no mapping exists.
 */
export function deriveLegacyRole(roleCode: string): string {
  return ROLE_CODE_TO_LEGACY_ROLE[roleCode] || roleCode;
}

/**
 * Build a safe `req.user` object from a decoded JWT payload. Tokens always
 * carry `roleCode` + `permissions`; `req.user.role` is derived from the
 * roleCode for the modules that still branch on the coarse UserRole buckets.
 */
function buildReqUser(payload: JwtPayload): JwtPayload {
  return {
    ...payload,
    id: payload.sub,
    permissions: payload.permissions || [],
    role: deriveLegacyRole(payload.roleCode),
  };
}

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Returns the authenticated user attached by `authenticate`, throwing 401 if
 * absent. Lets controllers on authenticated routes read a non-optional,
 * fully-typed user instead of casting `req` to `any`.
 */
export function requireUser(req: Request): JwtPayload {
  if (!req.user) {
    throw Errors.unauthorized();
  }
  return req.user;
}

/**
 * Resolves the Student record linked to the authenticated user, or null when
 * the user has no student profile. JWTs deliberately do not embed studentId
 * (profiles can be linked/unlinked while a token is live), so controllers
 * must resolve it from the database.
 */
export async function findStudentIdForUser(userId: string): Promise<string | null> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  return student?.id ?? null;
}

/** Like {@link findStudentIdForUser} but throws 403 when no profile exists. */
export async function requireStudentId(req: Request): Promise<string> {
  const studentId = await findStudentIdForUser(requireUser(req).id);
  if (!studentId) {
    throw Errors.forbidden('User is not a student');
  }
  return studentId;
}

/** Resolves the Teacher record linked to the authenticated user, or null. */
export async function findTeacherIdForUser(userId: string): Promise<string | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });
  return teacher?.id ?? null;
}

/**
 * Authentication middleware - verifies JWT token
 * Rejects temporary 2FA tokens
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw Errors.unauthorized('No authorization header');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw Errors.unauthorized('Invalid authorization format');
    }

    const payload = verifyToken(token);

    if (payload.type !== 'access') {
      throw Errors.unauthorized('Invalid token type');
    }

    if (payload.isTemp) {
      throw Errors.unauthorized('2FA Verification Required');
    }

    req.user = buildReqUser(payload);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authentication middleware for 2FA routes
 * Accepts both regular and temporary 2FA tokens
 */
export function authenticate2FA(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw Errors.unauthorized('No authorization header');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw Errors.unauthorized('Invalid authorization format');
    }

    const payload = verifyToken(token);

    if (payload.type !== 'access') {
      throw Errors.unauthorized('Invalid token type');
    }

    req.user = buildReqUser(payload);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const [type, token] = authHeader.split(' ');

    if (type === 'Bearer' && token) {
      const payload = verifyToken(token);
      if (payload.type === 'access' && !payload.isTemp) {
        req.user = buildReqUser(payload);
      }
    }

    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
}

/**
 * Role-based access control middleware
 * Checks the user's active RoleCode against the allowed list.
 * Accepts both native RoleCode values and legacy UserRole values
 * (which are auto-expanded via LEGACY_ROLE_EXPANSION).
 */
export function authorize(...allowedRoleCodes: string[]) {
  const expanded = expandRoleCodes(allowedRoleCodes);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    if (!expanded.includes(req.user.roleCode)) {
      return next(Errors.forbidden('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Permission-based access control middleware.
 *
 * Permissions are normally embedded in the JWT token at login time for
 * performance (no DB/Redis lookup per request).
 *
 * TRADE-OFF: Permission changes (grant or revoke) do NOT take effect until
 * the user's access token expires and is refreshed (access tokens live 15
 * minutes), or the user re-logs in. For urgent revocations (e.g. security
 * incidents), invalidate the user's refresh tokens via AuthService.logout()
 * to force a re-login.
 */
export function hasPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    // Super Admin has all permissions implicitly
    if (req.user.roleCode === RoleCode.SUPER_ADMIN) {
      return next();
    }

    const permissions = req.user.permissions || [];
    if (!permissions.includes(permission)) {
      return next(Errors.forbidden(`Missing permission: ${permission}`));
    }

    next();
  };
}

/**
 * Check if user is Super Admin
 */
export function isSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(Errors.unauthorized());
  }

  if (req.user.roleCode !== RoleCode.SUPER_ADMIN) {
    return next(Errors.forbidden('Super Admin access required'));
  }

  next();
}

/**
 * Check if user is Admin (any admin-level RoleCode)
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(Errors.unauthorized());
  }

  if (!ADMIN_ROLE_CODES.includes(req.user.roleCode)) {
    return next(Errors.forbidden('Admin access required'));
  }

  next();
}

/**
 * Allow admins, or the authenticated user acting on their own record
 * (matched against the route param, default `:id`). Non-admins get 403 for
 * anyone else's record — this is what stops a student/parent account from
 * enumerating or reading other users via /api/users/:id.
 */
export function isAdminOrSelf(paramName: string = 'id') {
  return function isAdminOrSelfGuard(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    if (req.user.id === req.params[paramName]) {
      return next();
    }

    if (!ADMIN_ROLE_CODES.includes(req.user.roleCode)) {
      return next(Errors.forbidden('Admin access required'));
    }

    next();
  };
}

/**
 * RoleCodes that pass the isTeacherOrAbove check.
 * Computed once at module load (like ADMIN_ROLE_CODES) to avoid
 * re-creating the array on every request.
 */
const TEACHER_OR_ABOVE_CODES: string[] = [
  ...ADMIN_ROLE_CODES,
  ...SHARED_LEGACY_ROLE_EXPANSION.TEACHER,
];

/**
 * True when a RoleCode belongs to the canonical "teacher or above" group
 * (admins + educators). Shared by the middleware and by services that must
 * scope cross-unit educator access, so the judgement lives in ONE place rather
 * than being re-derived with `endsWith('_GURU')` string fragments.
 */
export function isTeacherOrAboveRoleCode(roleCode: string): boolean {
  return TEACHER_OR_ABOVE_CODES.includes(roleCode);
}

/**
 * Check if user is Teacher or above
 */
export function isTeacherOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(Errors.unauthorized());
  }

  if (!TEACHER_OR_ABOVE_CODES.includes(req.user.roleCode)) {
    return next(Errors.forbidden('Teacher or higher access required'));
  }

  next();
}

/**
 * Check if user belongs to the same unit
 */
export function sameUnit(paramName: string = 'unitId') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    // Super Admin can access all units
    if (req.user.roleCode === RoleCode.SUPER_ADMIN) {
      return next();
    }

    const requestedUnitId = req.params[paramName] || req.body.unitId || req.query.unitId;

    if (requestedUnitId && req.user.unitId !== requestedUnitId) {
      return next(Errors.forbidden('Access to this unit is not allowed'));
    }

    next();
  };
}

/**
 * Helper: check if a roleCode is an admin-level role
 */
export function isAdminRoleCode(roleCode: string): boolean {
  return ADMIN_ROLE_CODES.includes(roleCode);
}

/**
 * Yayasan-level governance RoleCodes. These are NOT classified as system
 * administrators (see ADMIN_ROLE_CODES comment), but they DO represent
 * elevated foundation-level privileges (board members, auditors, foundation
 * secretary, etc.) that should not be creatable by unit-level admins.
 *
 * Used by AuthService.register to prevent privilege escalation where a
 * unit-admin (e.g. SDIT_ADMIN) registers a user with a foundation governance
 * role (e.g. YAYASAN_PEMBINA), gaining cross-unit read access and legacy
 * UNIT_ADMIN-level permissions via LEGACY_ROLE_EXPANSION.
 */
const GOVERNANCE_ROLE_CODES: string[] = [...SHARED_GOVERNANCE_ROLE_CODES];

/**
 * Helper: check if a roleCode is a Yayasan-level governance role.
 */
export function isGovernanceRoleCode(roleCode: string): boolean {
  return GOVERNANCE_ROLE_CODES.includes(roleCode);
}
