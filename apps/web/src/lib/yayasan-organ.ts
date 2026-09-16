/**
 * The three organs of a yayasan, mirrored for the UI.
 *
 * UU 16/2001 jo. UU 28/2004 Pasal 29: an anggota Pembina may not concurrently
 * be Pengurus and/or Pengawas. The separation is the point of the structure —
 * the organ that appoints cannot also be the one that executes, nor the one
 * that audits.
 *
 * THIS FILE IS NOT THE RULE. It is a copy kept for the sake of the person
 * filling in the form, so the conflict is visible before they submit rather
 * than as a red toast afterwards. Enforcement lives in two places that cannot
 * be bypassed:
 *
 *   - `apps/api/src/utils/role-eligibility.ts`, checked in RolesService, and
 *   - a BEFORE INSERT/UPDATE trigger on `user_role_assignments`, which also
 *     catches bulk imports, restores and manual SQL — the route by which the
 *     seed originally gave ketua@cipansor.or.id both Ketua and Pembina.
 *
 * If this copy ever drifts, the server still refuses; the cost of drift is a
 * confusing form, not a bad record.
 */

export type YayasanOrgan = "PEMBINA" | "PENGURUS" | "PENGAWAS";

export const YAYASAN_ORGAN_BY_ROLE: Record<string, YayasanOrgan> = {
  YAYASAN_PEMBINA: "PEMBINA",
  YAYASAN_KETUA: "PENGURUS",
  YAYASAN_SEKRETARIS: "PENGURUS",
  YAYASAN_BENDAHARA: "PENGURUS",
  YAYASAN_ANGGOTA: "PENGURUS",
  YAYASAN_PENGAWAS: "PENGAWAS",
};

const ORGAN_LABEL: Record<YayasanOrgan, string> = {
  PEMBINA: "Pembina",
  PENGURUS: "Pengurus",
  PENGAWAS: "Pengawas",
};

export function yayasanOrganOf(roleCode: string): YayasanOrgan | undefined {
  return YAYASAN_ORGAN_BY_ROLE[roleCode];
}

/**
 * Why `roleCode` cannot be added to someone already holding `heldRoleCodes`,
 * or null when there is no conflict.
 *
 * Two roles *within* one organ stay allowed: a small yayasan may well have one
 * person as both ketua and bendahara.
 */
export function yayasanOrganConflict(
  roleCode: string,
  heldRoleCodes: string[],
): string | null {
  const incoming = yayasanOrganOf(roleCode);
  if (!incoming) return null;

  for (const held of heldRoleCodes) {
    const existing = yayasanOrganOf(held);
    if (existing && existing !== incoming) {
      return `Tidak dapat merangkap: ${ORGAN_LABEL[incoming]} tidak boleh sekaligus menjadi ${ORGAN_LABEL[existing]} (UU 16/2001 Pasal 29).`;
    }
  }

  return null;
}

/**
 * Peran yang boleh MENULIS keputusan organ: membuat, finalisasi, dan (untuk
 * aturan kuorum) mengubah konfigurasi.
 *
 * Cermin dari `WRITE` di
 * `apps/api/src/modules/foundation-decisions/foundation-decisions.routes.ts`.
 * Halaman daftar/detail dulu merender tombol "Buat Keputusan"/"Finalisasi" ke
 * SEMUA pembaca, termasuk Bendahara dan Anggota yang hanya boleh membaca —
 * klik mereka berakhir 403. UI tidak boleh menjanjikan aksi yang peladen pasti
 * tolak.
 *
 * Ini salinan, bukan aturannya: yang mengikat tetap `authorize(...WRITE)` di
 * rute, dan `foundation-decision-write-gate.test.ts` memaku kedua daftar agar
 * tidak menyimpang.
 */
export const FOUNDATION_DECISION_WRITE_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PEMBINA",
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
];

export function canManageFoundationDecisions(
  roleCode: string | null | undefined,
): boolean {
  return !!roleCode && FOUNDATION_DECISION_WRITE_ROLES.includes(roleCode);
}
