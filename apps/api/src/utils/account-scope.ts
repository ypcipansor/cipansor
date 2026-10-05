import { RoleCode } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { requiresSecondFactor } from '@/middleware/auth';

/** The admin making the request, as `req.user` carries it. */
export interface AccountActor {
  roleCode: string;
  unitId: string | null;
  sub: string;
}

/**
 * Whether an admin may act on another person's account: delete it, mark its
 * password leaked, send it a reset link, change its email or switch it off.
 *
 * Super Admin may act on anyone. A unit admin acts only inside their own unit,
 * and never on an account that must use 2FA — admins, the yayasan's organs,
 * unit heads: those are Super Admin's, the same peer rule as turning someone's
 * 2FA off (`authService.disableTwoFactor`). Whether one may act on one's own
 * account differs per action, so that is the caller's to decide.
 *
 * `roleCodes` are the target's active assignments (`activeAssignmentWhere`).
 */
export function assertMayManageAccount(
  target: { unitId: string | null; roleCodes: ReadonlyArray<string> },
  actor: AccountActor
): void {
  if (actor.roleCode === RoleCode.SUPER_ADMIN) return;
  // An admin without a unit would otherwise match every account without one.
  if (!actor.unitId || target.unitId !== actor.unitId) {
    throw Errors.forbidden('Admin unit hanya dapat mengelola pengguna di unitnya sendiri.');
  }
  if (requiresSecondFactor([...target.roleCodes])) {
    throw Errors.forbidden(
      'Hanya Super Admin yang dapat mengelola akun yang wajib memakai verifikasi dua langkah.'
    );
  }
}

/** Role assignments that count: switched on and not expired. */
export function activeAssignmentWhere() {
  return {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}
