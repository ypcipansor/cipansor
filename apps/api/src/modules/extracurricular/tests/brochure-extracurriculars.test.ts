import { describe, it, expect, vi } from 'vitest';
import {
  BROCHURE_EXTRACURRICULARS,
  checkBrochureExtracurriculars,
  loadBrochureExtracurriculars,
} from '../../../../prisma/seeds/ekskul-2027-2028';

// The brochure's extracurriculars as the loader writes them
// (decisions/fasilitas-dan-kegiatan-situs-publik.md). Run against Postgres by
// the demo seed, which every e2e run starts from.

const UNITS = [
  { id: 'u-sd', type: 'SD_IT' },
  { id: 'u-smp', type: 'SMP_IT' },
  { id: 'u-sma', type: 'SMA_QURAN' },
];

const fakeDb = (existing: (where: { unitId: string; OR: unknown[] }) => boolean) => {
  const created: Array<Record<string, unknown>> = [];
  const db = {
    academicYear: { findFirst: vi.fn(async () => ({ id: 'year-1' })) },
    unit: { findMany: vi.fn(async () => UNITS) },
    extracurricular: {
      findFirst: vi.fn(async ({ where }) => (existing(where) ? { id: 'x' } : null)),
      create: vi.fn(async ({ data }) => {
        created.push(data);
        return data;
      }),
    },
  };
  return { db: db as never, created, raw: db };
};

describe('the brochure list', () => {
  it('passes the portal form schema, with short unique codes', () => {
    expect(() => checkBrochureExtracurriculars()).not.toThrow();
    const codes = BROCHURE_EXTRACURRICULARS.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(BROCHURE_EXTRACURRICULARS).toHaveLength(9);
  });

  it("gives SAPALA and Paskibra to SMA Qur'an only, the rest to SD IT, SMP IT and SMA Qur'an", () => {
    for (const e of BROCHURE_EXTRACURRICULARS) {
      const expected = ['SAPALA', 'PASKIBRA'].includes(e.code)
        ? ['SMA_QURAN']
        : ['SD_IT', 'SMP_IT', 'SMA_QURAN'];
      expect(e.units, e.code).toEqual(expected);
    }
  });
});

describe('loadBrochureExtracurriculars', () => {
  it('creates each in its units, active, in the active year, with its translations', async () => {
    const { db, created } = fakeDb(() => false);

    const results = await loadBrochureExtracurriculars(db);

    expect(results.filter((r) => r.action === 'created')).toHaveLength(7 * 3 + 2);
    expect(created.find((c) => c.code === 'PASKIBRA')).toMatchObject({
      unitId: 'u-sma',
      academicYearId: 'year-1',
      status: 'ACTIVE',
      category: 'LEADERSHIP',
      nameEn: 'Paskibra (flag-raising troop)',
    });
  });

  it("leaves a unit's own alone — matched by code or name, deleted rows included", async () => {
    const { db, created, raw } = fakeDb((where) => where.unitId === 'u-smp');

    const results = await loadBrochureExtracurriculars(db);

    expect(created.some((c) => c.unitId === 'u-smp')).toBe(false);
    expect(results.filter((r) => r.unit === 'SMP_IT').every((r) => r.action === 'skipped')).toBe(
      true
    );
    const where = raw.extracurricular.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('deletedAt');
    expect(where.OR).toEqual([
      { code: 'TAEKWONDO' },
      { name: { equals: 'Taekwondo', mode: 'insensitive' } },
    ]);
  });

  it('refuses without an active academic year, or with a unit missing', async () => {
    const noYear = fakeDb(() => false);
    noYear.raw.academicYear.findFirst.mockResolvedValue(null as never);
    await expect(loadBrochureExtracurriculars(noYear.db)).rejects.toThrow(/academic year/);

    const noSma = fakeDb(() => false);
    noSma.raw.unit.findMany.mockResolvedValue(UNITS.slice(0, 2) as never);
    await expect(loadBrochureExtracurriculars(noSma.db)).rejects.toThrow(/SMA_QURAN/);
  });
});
