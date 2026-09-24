import { RoleCode } from '@prisma/client';
import { authorizeOrPermission } from '../../middleware/auth';
import { PERMISSIONS } from '../roles/permissions';
import { isFoundationScopedRole } from '@/utils/resolve-unit-id';

/**
 * Guard for the SPMB read routes: whoever the route admitted before, or a
 * holder of ADMISSION_VIEW.
 *
 * The yayasan decision of 2026-09-23 is that the panitia prepares and the
 * KEPALA UNIT decides, with the yayasan board reading along. Kepala Sekolah,
 * Wakasek and the board hold ADMISSION_VIEW, but the legacy lists here
 * (SUPER_ADMIN, UNIT_ADMIN, STAFF) left the Kepala out altogether, so the SPMB
 * summary read 0 for exactly the people who decide. Writes are unchanged.
 */
export function viewAdmissions(...allowedRoleCodes: string[]) {
  return authorizeOrPermission(allowedRoleCodes, PERMISSIONS.ADMISSION_VIEW);
}

/**
 * Whether an actor READS every unit's SPMB data: Super Admin, and the yayasan
 * board, which has no unit of its own. The read paths used to allow only
 * Super Admin and refused any other user without a unitId with a 403, so the
 * Ketua's summary was 0.
 *
 * Deliberately narrower than seesAllUnits(): cross-unit service roles (the
 * nurse, security) reach these routes through the legacy STAFF bucket, and
 * seesAllUnits() would widen them from their own unit to every unit.
 * Writes never use this: the board reads SPMB, it does not run it.
 */
export function readsAllUnits(actor: { role?: string; roleCode?: string | null }): boolean {
  return (
    actor.roleCode === RoleCode.SUPER_ADMIN ||
    actor.role === RoleCode.SUPER_ADMIN ||
    isFoundationScopedRole(actor.roleCode)
  );
}
