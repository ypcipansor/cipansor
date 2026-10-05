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

/**
 * A unit's official identity (decided 2026-10-02, decisions/spmb-2027-2028.md
 * item 6): the name on its operating permit and in the national reference
 * data, and the permit itself. Documents print it — the naskah dinas
 * letterhead, rapor, certificates, cards, the Dapodik export — while menus and
 * screens keep the short `name`.
 */
export interface UnitOfficialIdentity {
  officialName: string | null;
  operatingPermitNumber: string | null;
  /** As the API serialises a `@db.Date`: ISO, midnight UTC. */
  operatingPermitDate: string | null;
}

/** The unit's name as a document prints it: the official one, else the short one. */
export function unitDocumentName(unit: {
  name: string;
  officialName?: string | null;
}): string {
  return unit.officialName?.trim() || unit.name;
}

/**
 * The line a unit's letterhead prints under its name, as the units' own
 * letterheads do ("Izin Operasional No. 503/0671/… NPSN: 69988558"); null when
 * the unit has recorded neither.
 */
export function unitPermitLine(unit: {
  npsn?: string | null;
  operatingPermitNumber?: string | null;
}): string | null {
  const parts = [
    unit.operatingPermitNumber?.trim() &&
      `Izin Operasional No. ${unit.operatingPermitNumber.trim()}`,
    unit.npsn && `NPSN ${unit.npsn}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Who signs for a unit: its head, as the active role assignments name them —
 * the kepala sekolah, or the Pimpinan Pesantren. `GET /units/:id/head`
 * answers null when the unit has none, or more than one, so a document leaves
 * the line blank to sign by hand rather than print a guess.
 */
export interface UnitHead {
  name: string;
  /** Nomor Induk Pegawai from the head's teacher record, when one is kept. */
  nip: string | null;
  /** "Kepala SMP IT Pesantren Cipansor", "Pimpinan Pesantren". */
  title: string;
}
