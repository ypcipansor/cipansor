import { ADMIN_ROLE_CODES } from "@cipansor/shared";
import { getActiveRoleCode, type RbacUser } from "@/lib/rbac";

/**
 * Who enters an intake: Super Admin and a unit's admin, as the API's write
 * routes allow. The yayasan's organs read SPMB; they do not run it.
 */
export function canManageIntake(user: RbacUser | null | undefined): boolean {
  const code = getActiveRoleCode(user);
  return !!code && ADMIN_ROLE_CODES.includes(code);
}
