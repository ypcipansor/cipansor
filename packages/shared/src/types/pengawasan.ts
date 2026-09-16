/**
 * Whistleblowing System (WBS) & Board Suspension contracts.
 *
 * Single source for the values both apps must agree on. They were previously
 * spelled out three times — the API's Zod schema, the public submission page's
 * `<SelectItem value=…>` list, and the handler UI — so a category could be
 * added on the API and silently never become selectable, or the reverse.
 *
 * The database enums (`WbsCategory`, `WbsTargetLevel`, `WbsStatus` in
 * `schema.prisma`) remain the source of truth for storage; the literal lists
 * here must stay in step with them, and `pengawasan.validation.ts` asserts that
 * by building its Zod schemas from these same arrays.
 */

export const WBS_CATEGORIES = [
  "KEUANGAN_ASET",
  "SOP_TATA_KELOLA",
  "ETIKA_PERILAKU",
  "PELAYANAN_AKADEMIK_PENGASUHAN",
  "LAINNYA",
] as const;

export type WbsCategoryCode = (typeof WBS_CATEGORIES)[number];

export const WBS_CATEGORY_LABELS: Record<WbsCategoryCode, string> = {
  KEUANGAN_ASET:
    "Keuangan & Aset (Penyalahgunaan Anggaran, Pungli, Penggelapan)",
  SOP_TATA_KELOLA:
    "SOP & Tata Kelola (Pelanggaran Prosedur, Penyalahgunaan Wewenang)",
  ETIKA_PERILAKU:
    "Etika, Kesusilaan & Perilaku (Pelecehan, Perundungan/Bullying)",
  PELAYANAN_AKADEMIK_PENGASUHAN:
    "Pelayanan Akademik & Pengasuhan (Keluhan Layanan, Keasramaan)",
  LAINNYA: "Lain-lain",
};

export const WBS_TARGET_LEVELS = [
  "PENGURUS_YAYASAN",
  "PENGAWAS_YAYASAN",
  "KEPALA_UNIT",
  "STAF_PEGAWAI",
  "SISWA_SANTRI",
] as const;

export type WbsTargetLevelCode = (typeof WBS_TARGET_LEVELS)[number];

export const WBS_TARGET_LEVEL_LABELS: Record<WbsTargetLevelCode, string> = {
  PENGURUS_YAYASAN: "Pengurus Yayasan (Ditangani Pengawas, CC Pembina)",
  PENGAWAS_YAYASAN: "Pengawas Yayasan (Ditangani Pembina)",
  KEPALA_UNIT:
    "Kepala Unit Organisasi / Kepsek / Pengasuh (Ditangani Pengurus, CC Pengawas)",
  STAF_PEGAWAI:
    "Staf / Guru / Pegawai Unit (Ditangani Kepsek/Kepala Unit, CC Pengurus & Pengawas)",
  SISWA_SANTRI:
    "Siswa / Santri / Murid (Ditangani Kepala Unit/BK, CC Pengurus & Pengawas)",
};

export const WBS_STATUSES = [
  "DIAJUKAN",
  "DALAM_PENYELIDIKAN",
  "DITINDAKLANJUTI",
  "SELESAI",
  "TIDAK_DAPAT_DITINDAKLANJUTI",
] as const;

export type WbsStatusCode = (typeof WBS_STATUSES)[number];

/**
 * The only roles a *Pelaksana Harian / Pelaksana Tugas* (Plh/Plt) delegation
 * may carry.
 *
 * `suspendBoardMember` used to accept whatever `plhRoleCode` the caller sent
 * and mint a `UserRoleAssignment` for it, so a Pengawas — whose whole job is
 * to audit the Pengurus — could issue `plhRoleCode: "SUPER_ADMIN"` and promote
 * an accomplice past the very oversight that suspended the incumbent. A Plh
 * stands in for a Pengurus organ, nothing else: not the Pembina that appoints
 * it, not the Pengawas that audits it, and certainly not the system
 * administrator. Kept in shared so the API's Zod schema, the service guard and
 * the web form cannot disagree about which codes are legal.
 */
export const PLH_ROLE_CODES = [
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
  "YAYASAN_BENDAHARA",
  "YAYASAN_ANGGOTA",
] as const;

export type PlhRoleCode = (typeof PLH_ROLE_CODES)[number];
