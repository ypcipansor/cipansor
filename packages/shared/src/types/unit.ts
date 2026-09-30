/**
 * A unit's NPSN (Nomor Pokok Sekolah Nasional): eight digits, issued through
 * Dapodik. The public accreditation section tells visitors to check a rating
 * by it, and the EMIS and Dapodik exports and the SKHUN print it. The
 * pesantren itself has none; its units that are schools each have one.
 */
export const NPSN_PATTERN = /^\d{8}$/;
export const NPSN_MESSAGE = "NPSN terdiri dari 8 angka";

/** GET /units/:id/summary — what the unit's profile counts. */
export interface UnitSummary {
  /** Santri whose status is `active` — not alumni, dropped or transferred. */
  activeStudents: number;
  /** Teachers of the unit whose account is active. */
  teachers: number;
  /** Classes (rombel) of the active academic year; last year's stay for old report cards. */
  classes: number;
}
