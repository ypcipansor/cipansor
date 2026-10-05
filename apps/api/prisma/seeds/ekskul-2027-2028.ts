/**
 * The extracurriculars the 2027/2028 brochure lists, loaded into the portal's
 * Ekstrakurikuler module of each unit that runs them — the record the public
 * site's *Kegiatan* page reads (decided 2026-10-04,
 * decisions/fasilitas-dan-kegiatan-situs-publik.md).
 *
 * - **Which units.** The brochure marks SAPALA and Paskibra as SMA Qur'an's.
 *   The seven it leaves unmarked go to SD IT, SMP IT and SMA Qur'an:
 *   extracurriculars are a matter of primary and secondary schooling
 *   (Permendikbud 62/2014), not of TK, and Takhosus is a pesantren programme.
 * - **Names.** As the brochure prints them, in standard spelling ("Volly ball"
 *   is Bola Voli), with the English and Arabic names the public site shows.
 * - **Same rules as the portal.** Each row is checked with the schema the
 *   API checks the form with.
 * - **Once per environment.** A unit that already has one by this code or
 *   name — even one an admin since deleted — is left alone, so an edit or a
 *   removal is never undone. From then on the unit's admin owns the list.
 */
import type { PrismaClient, UnitType } from '@prisma/client';
import {
  createExtracurricularSchema,
  type ExtracurricularCategory,
} from '../../../../packages/shared/src/schemas/extracurricular';

const SCHOOLS: UnitType[] = ['SD_IT', 'SMP_IT', 'SMA_QURAN'];

export interface BrochureExtracurricular {
  code: string;
  name: string;
  nameEn: string;
  nameAr: string;
  category: ExtracurricularCategory;
  units: UnitType[];
}

export const BROCHURE_EXTRACURRICULARS: BrochureExtracurricular[] = [
  {
    code: 'TAEKWONDO',
    name: 'Taekwondo',
    nameEn: 'Taekwondo',
    nameAr: 'التايكوندو',
    category: 'SPORTS',
    units: SCHOOLS,
  },
  {
    code: 'ENGLISH-CLUB',
    name: 'English Club',
    nameEn: 'English Club',
    nameAr: 'نادي اللغة الإنجليزية',
    category: 'LANGUAGE',
    units: SCHOOLS,
  },
  {
    code: 'MEMANAH',
    name: 'Memanah',
    nameEn: 'Archery',
    nameAr: 'الرماية',
    category: 'SPORTS',
    units: SCHOOLS,
  },
  {
    code: 'PENCAK-SILAT',
    name: 'Pencak Silat',
    nameEn: 'Pencak Silat (Indonesian martial art)',
    nameAr: 'بنتشاك سيلات (فن قتالي إندونيسي)',
    category: 'SPORTS',
    units: SCHOOLS,
  },
  {
    code: 'FUTSAL',
    name: 'Futsal',
    nameEn: 'Futsal',
    nameAr: 'كرة القدم داخل الصالات',
    category: 'SPORTS',
    units: SCHOOLS,
  },
  {
    code: 'BOLA-VOLI',
    name: 'Bola Voli',
    nameEn: 'Volleyball',
    nameAr: 'الكرة الطائرة',
    category: 'SPORTS',
    units: SCHOOLS,
  },
  {
    code: 'PRAMUKA',
    name: 'Pramuka',
    nameEn: 'Scouting (Pramuka)',
    nameAr: 'الكشافة',
    category: 'SCOUTING',
    units: SCHOOLS,
  },
  {
    code: 'SAPALA',
    name: 'SAPALA (Santri Pecinta Alam)',
    nameEn: 'SAPALA (santri nature lovers)',
    nameAr: 'سابالا (الطلاب محبّو الطبيعة)',
    category: 'OTHER',
    units: ['SMA_QURAN'],
  },
  {
    code: 'PASKIBRA',
    name: 'Paskibra',
    nameEn: 'Paskibra (flag-raising troop)',
    nameAr: 'فرقة رفع العلم (باسكيبرا)',
    category: 'LEADERSHIP',
    units: ['SMA_QURAN'],
  },
];

/** A placeholder id, only so the create schema can check the other fields. */
const SOME_ID = '00000000-0000-4000-8000-000000000000';

/** Every row passes the portal's own create schema. Throws on the first that does not. */
export function checkBrochureExtracurriculars(): void {
  for (const e of BROCHURE_EXTRACURRICULARS) {
    createExtracurricularSchema.parse({
      unitId: SOME_ID,
      academicYearId: SOME_ID,
      name: e.name,
      nameEn: e.nameEn,
      nameAr: e.nameAr,
      code: e.code,
      category: e.category,
    });
  }
}

export interface ExtracurricularLoadResult {
  unit: UnitType;
  name: string;
  action: 'created' | 'skipped';
}

export async function loadBrochureExtracurriculars(
  db: PrismaClient
): Promise<ExtracurricularLoadResult[]> {
  checkBrochureExtracurriculars();

  const year = await db.academicYear.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!year) throw new Error('No active academic year: set one before loading extracurriculars');

  const types = [...new Set(BROCHURE_EXTRACURRICULARS.flatMap((e) => e.units))];
  const units = await db.unit.findMany({
    where: { type: { in: types }, deletedAt: null },
    select: { id: true, type: true },
  });
  for (const type of types) {
    const count = units.filter((u) => u.type === type).length;
    if (count !== 1) throw new Error(`Expected one active ${type} unit, found ${count}`);
  }

  const results: ExtracurricularLoadResult[] = [];
  for (const e of BROCHURE_EXTRACURRICULARS) {
    for (const type of e.units) {
      const unitId = units.find((u) => u.type === type)!.id;
      // Deleted rows count: an admin's removal stays a removal, and the
      // (unit, code) pair is unique across deleted rows too.
      const existing = await db.extracurricular.findFirst({
        where: {
          unitId,
          OR: [{ code: e.code }, { name: { equals: e.name, mode: 'insensitive' } }],
        },
        select: { id: true },
      });
      if (existing) {
        results.push({ unit: type, name: e.name, action: 'skipped' });
        continue;
      }
      await db.extracurricular.create({
        data: {
          unitId,
          academicYearId: year.id,
          code: e.code,
          name: e.name,
          nameEn: e.nameEn,
          nameAr: e.nameAr,
          category: e.category,
          status: 'ACTIVE',
        },
      });
      results.push({ unit: type, name: e.name, action: 'created' });
    }
  }
  return results;
}
