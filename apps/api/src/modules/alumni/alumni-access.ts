import { ALUMNI_PERSONAL_DATA_ROLE_CODES, ALUMNI_WRITE_ROLE_CODES } from '@cipansor/shared';
import { authorize } from '@/middleware/auth';
import { Errors } from '@/middleware/error';
import { seesAllUnits } from '@/utils/resolve-unit-id';

/**
 * Siapa boleh apa di modul alumni.
 *
 * Sampai 2026-09-14 modul ini hanya memasang `authenticate`: akun santri SD IT
 * membaca alumni SMP IT lengkap dengan email, telepon, dan alamat, membuat dan
 * menghapus alumni, dan meluluskan santri unit lain lewat
 * `POST /alumni/from-student/:id` (terbukti di rig). Tiga tingkat:
 *
 * - **Direktori** — setiap akun yang masuk. Beranda peran alumni adalah
 *   "Direktori Alumni", dan santri/guru punya menu Alumni; mereka melihat nama,
 *   unit, angkatan, karier, dan pendidikan — tanpa kontak dan data diri.
 * - **Baca data diri** — pengelola ditambah kepala sekolah dan organ yayasan
 *   (pengawasan), hanya untuk alumni di lingkup unitnya.
 * - **Kelola** — admin dan tata usaha, hanya di lingkup unitnya.
 */

/** Daftar perannya di `@cipansor/shared` — web memakai daftar yang sama. */
export const ALUMNI_WRITE_ROLES = ALUMNI_WRITE_ROLE_CODES;
export const ALUMNI_PERSONAL_DATA_ROLES = ALUMNI_PERSONAL_DATA_ROLE_CODES;

export const manageAlumni = authorize(...ALUMNI_WRITE_ROLES);

/** Rute yang mengembalikan data diri per alumni (mis. nilai rata-rata per nama). */
export const readAlumniPersonalData = authorize(...ALUMNI_PERSONAL_DATA_ROLES);

export interface AlumniActor {
  role?: string | null;
  roleCode?: string | null;
  unitId?: string | null;
}

/** `null` = semua unit; selain itu satu-satunya unit yang boleh disentuh. */
export function alumniUnitScope(actor: AlumniActor): string | null {
  return seesAllUnits(actor) ? null : actor.unitId || 'none';
}

function inScope(actor: AlumniActor, unitId: string | null | undefined): boolean {
  const scope = alumniUnitScope(actor);
  return scope === null || unitId === scope;
}

/** Boleh membaca data diri alumni di unit ini? */
export function canReadAlumniPersonalData(actor: AlumniActor, unitId: string | null | undefined) {
  return (
    !!actor.roleCode &&
    ALUMNI_PERSONAL_DATA_ROLES.includes(actor.roleCode) &&
    inScope(actor, unitId)
  );
}

/**
 * Tolak menulis ke unit di luar lingkup. Rekaman yang sudah ada dijawab 404
 * (keberadaannya bukan urusan pemanggil); unit yang diminta di badan permintaan
 * dijawab 403.
 */
export function assertAlumniRecordInScope(
  actor: AlumniActor,
  unitId: string | null | undefined,
  what: string
) {
  if (!inScope(actor, unitId)) throw Errors.notFound(what);
}

export function assertAlumniTargetUnitInScope(
  actor: AlumniActor,
  unitId: string | null | undefined
) {
  if (!inScope(actor, unitId)) {
    throw Errors.forbidden('Unit ini di luar lingkup Anda');
  }
}

/** Kolom yang hanya untuk pembaca data diri. */
const DATA_DIRI = ['email', 'phone', 'address', 'birthPlace', 'birthDate', 'notes'] as const;

/**
 * Buang kontak, data diri, tautan santri (NIS/NISN), dan donasi dari satu
 * baris alumni bila pembacanya tidak berhak. Bentuk objeknya tetap — kolomnya
 * `null`, larik donasinya kosong — supaya layar yang sudah menampilkan "-"
 * untuk nilai kosong tidak perlu diubah.
 */
export function redactAlumniFor<T extends { unitId: string }>(actor: AlumniActor, alumni: T): T {
  if (canReadAlumniPersonalData(actor, alumni.unitId)) return alumni;
  const salinan: Record<string, unknown> = { ...alumni };
  for (const kolom of DATA_DIRI) if (kolom in salinan) salinan[kolom] = null;
  if ('student' in salinan) salinan.student = null;
  if ('studentId' in salinan) salinan.studentId = null;
  if ('donations' in salinan) salinan.donations = [];
  return salinan as T;
}
