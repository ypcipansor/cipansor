/**
 * Derives the academic calendar from the current date instead of hardcoding it.
 *
 * The seed used to write `2024/2025` and a PSB window of 1 Mar – 31 May 2024 as
 * literals. Those are facts about the day the seed was written, not facts about
 * the school, so every reseed faithfully reproduced them. By July 2026 the
 * public SPMB page told visitors that admissions had closed on 31 May 2024 and
 * rendered no registration form at all — the record was not wrong about its own
 * dates, it was just two years old.
 *
 * Deriving from `now` means a reseed is current whenever it runs, and the data
 * cannot rot simply by time passing.
 *
 * Note the division of labour: `isActive` stays an administrative flag (an
 * admin closing a wave early), while *whether registration is open* is derived
 * from the window. Callers must consult both — see `findPublicIntakes` in the
 * admissions service, which also lets the waves decide.
 */

/** Indonesian academic years run from mid-July to the end of June. */
const YEAR_START_MONTH = 6; // July, 0-indexed
const YEAR_START_DAY = 15;
const YEAR_END_MONTH = 5; // June, 0-indexed
const YEAR_END_DAY = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AcademicYearSpec {
  /** The calendar year the academic year begins in — 2026 for "2026/2027". */
  startYear: number;
  /** Display name, e.g. "2026/2027". Unique in the database. */
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface AdmissionWindowSpec {
  name: string;
  startDate: Date;
  endDate: Date;
}

/** Build dates in UTC so results never depend on the container's timezone. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Midnight UTC `days` away from `from`, so seeded windows land on whole days. */
function midnightOffset(from: Date, days: number): Date {
  const shifted = new Date(from.getTime() + days * DAY_MS);
  return utc(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

export function academicYearStarting(startYear: number): AcademicYearSpec {
  return {
    startYear,
    name: `${startYear}/${startYear + 1}`,
    startDate: utc(startYear, YEAR_START_MONTH, YEAR_START_DAY),
    endDate: utc(startYear + 1, YEAR_END_MONTH, YEAR_END_DAY),
  };
}

/**
 * The academic year containing `now`. 15 July is the boundary: 14 July 2026 is
 * still 2025/2026, 15 July 2026 is already 2026/2027.
 */
export function currentAcademicYear(now: Date = new Date()): AcademicYearSpec {
  const year = now.getUTCFullYear();
  const alreadyStarted = now >= utc(year, YEAR_START_MONTH, YEAR_START_DAY);
  return academicYearStarting(alreadyStarted ? year : year - 1);
}

/** The intake a registration opened today is recruiting for. */
export function nextAcademicYear(now: Date = new Date()): AcademicYearSpec {
  return academicYearStarting(currentAcademicYear(now).startYear + 1);
}

/**
 * Two admission waves for the upcoming intake, positioned relative to `now`:
 * wave 1 is always open today, wave 2 always still ahead of it. Anchoring to
 * `now` rather than to fixed dates is the whole point — it is what stops the
 * seeded intake from expiring.
 */
export function admissionWindows(now: Date = new Date()): AdmissionWindowSpec[] {
  const intake = nextAcademicYear(now);
  return [
    {
      name: `SPMB ${intake.name} Gelombang 1`,
      startDate: midnightOffset(now, -45),
      endDate: midnightOffset(now, 45),
    },
    {
      name: `SPMB ${intake.name} Gelombang 2`,
      startDate: midnightOffset(now, 46),
      endDate: midnightOffset(now, 105),
    },
  ];
}
