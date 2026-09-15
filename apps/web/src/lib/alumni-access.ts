import {
  ALUMNI_PERSONAL_DATA_ROLE_CODES,
  ALUMNI_WRITE_ROLE_CODES,
} from "@cipansor/shared";
import { getPrimaryRoleCode, type RbacUser } from "@/lib/rbac";

/**
 * Apa yang boleh dilakukan akun ini di halaman Alumni. Daftar perannya sama
 * dengan yang dipakai API (`apps/api/src/modules/alumni/alumni-access.ts`),
 * jadi tombol yang tampil adalah tombol yang tidak akan dijawab 403.
 *
 * Lingkup UNIT tetap diperiksa API: admin SD IT melihat tombol Edit pada alumni
 * SMP IT, dan API menjawabnya 404.
 */
export function alumniAccessOf(user: RbacUser | null | undefined) {
  const roleCode = getPrimaryRoleCode(user) ?? user?.role ?? "";
  return {
    canManage: ALUMNI_WRITE_ROLE_CODES.includes(roleCode),
    canReadPersonalData: ALUMNI_PERSONAL_DATA_ROLE_CODES.includes(roleCode),
  };
}
