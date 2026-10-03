import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { admissionFeeTotals } from '@cipansor/shared';
import {
  BROCHURE_WAVE_NOTE,
  BROCHURE_WAVE_QUOTA,
  checkBrochure,
  loadSpmb20272028,
} from '../../../../prisma/seeds/spmb-2027-2028';
import { BROCHURE_INTAKES } from '../../../../prisma/seeds/spmb-2027-2028.data';

// SPMB 2027/2028 is loaded from the brochure by a script (decided 2026-10-03),
// on staging now and on production with a release. What it must do: write the
// brochure as the portal's own form would, once per environment, and leave one
// intake per unit for the year — the demo package's per-wave periods set aside.

// The fake stands in for Prisma's generated shapes, which vary per call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** The row, or a failed test saying which one was missing. */
function must<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`missing: ${what}`);
  return row;
}

/** The few Prisma calls the loader makes, over arrays. */
function fakeDb(units: Row[], seed: { periods?: Row[]; waves?: Row[] } = {}) {
  let n = 0;
  const id = () => `id-${++n}`;
  const years: Row[] = [];
  const periods: Row[] = seed.periods ?? [];
  const waves: Row[] = seed.waves ?? [];
  const fees: Row[] = [];
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(row[k]);
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
      return row[k] === v;
    });
  const db = {
    academicYear: {
      findUnique: async ({ where }: Row) => years.find((y) => y.name === where.name) ?? null,
      create: async ({ data }: Row) => (years.push({ id: id(), ...data }), years.at(-1)),
    },
    unit: {
      findMany: async ({ where }: Row) =>
        units.filter((u) => where.type.in.includes(u.type) && !u.deletedAt),
    },
    admissionPeriod: {
      findFirst: async ({ where }: Row) => periods.find((p) => matches(p, where)) ?? null,
      findMany: async ({ where }: Row) => periods.filter((p) => matches(p, where)),
      create: async ({ data }: Row) => (periods.push({ id: id(), ...data }), periods.at(-1)),
      update: async ({ where, data }: Row) =>
        Object.assign(
          must(
            periods.find((p) => p.id === where.id),
            where.id
          ),
          data
        ),
      updateMany: async ({ where, data }: Row) => {
        for (const p of periods.filter((p) => matches(p, where))) Object.assign(p, data);
      },
    },
    admissionWave: {
      findUnique: async ({ where }: Row) =>
        waves.find(
          (w) =>
            w.periodId === where.periodId_waveNumber.periodId &&
            w.waveNumber === where.periodId_waveNumber.waveNumber
        ) ?? null,
      create: async ({ data }: Row) => (waves.push({ id: id(), ...data }), waves.at(-1)),
      update: async ({ where, data }: Row) =>
        Object.assign(
          must(
            waves.find((w) => w.id === where.id),
            where.id
          ),
          data
        ),
    },
    admissionFeeItem: {
      deleteMany: async ({ where }: Row) => {
        for (let i = fees.length - 1; i >= 0; i--)
          if (fees[i].periodId === where.periodId) fees.splice(i, 1);
      },
      createMany: async ({ data }: Row) => void fees.push(...data),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as unknown as PrismaClient, years, periods, waves, fees };
}

const UNITS = [
  { id: 'tk', type: 'TK_QURAN' },
  { id: 'sd', type: 'SD_IT' },
  { id: 'smp', type: 'SMP_IT' },
  { id: 'sma', type: 'SMA_QURAN' },
  { id: 'pst', type: 'PESANTREN' },
];
const NOW = new Date('2026-10-03T05:00:00Z');

describe('the brochure, as data', () => {
  it("passes the checks the portal's own forms make", () => {
    expect(() => checkBrochure()).not.toThrow();
  });
});

describe('loading SPMB 2027/2028', () => {
  it('writes one intake per unit: the period, four waves and the fee table', async () => {
    const { db, years, periods, waves, fees } = fakeDb(UNITS);

    const results = await loadSpmb20272028(db, { now: NOW });

    expect(years.map((y) => y.name)).toEqual(['2027/2028']);
    expect(results.map((r) => [r.unit, r.period, r.action])).toEqual([
      ['TK_QURAN', "SPMB 2027/2028 TK Qur'an", 'created'],
      ['SD_IT', 'SPMB 2027/2028 SD IT', 'created'],
      ['SMP_IT', 'SPMB 2027/2028 SMP IT', 'created'],
      ['SMA_QURAN', "SPMB 2027/2028 SMA Qur'an", 'created'],
    ]);
    // Registration opens at 00.00 WIB on 1 October and closes at 24.00 WIB on 10 July.
    const sd = must(
      periods.find((p) => p.unitId === 'sd'),
      'sd'
    );
    expect(sd.startDate.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(sd.endDate.toISOString()).toBe('2027-07-10T16:59:59.999Z');
    expect(sd.requirements).toEqual(BROCHURE_INTAKES.SD_IT.requirements);
    expect(sd.minAgeMonths).toBe(84);
    expect(Number(sd.registrationFee)).toBe(200_000);
    // Never a contact: the unit's admin enters it.
    expect(sd).not.toHaveProperty('contactName');

    const sdWaves = waves.filter((w) => w.periodId === sd.id);
    expect(sdWaves.map((w) => [w.name, w.status, Number(w.fullPaymentDiscount)])).toEqual([
      ['Gelombang 1', 'OPEN', 1_000_000],
      ['Gelombang 2', 'UPCOMING', 750_000],
      ['Gelombang 3', 'UPCOMING', 500_000],
      ['Gelombang 4', 'UPCOMING', 0],
    ]);
    expect(sdWaves[0].testStartDate.toISOString()).toBe('2026-12-20T00:00:00.000Z');
    expect(sdWaves[0].endDate.toISOString()).toBe('2026-12-20T16:59:59.999Z');
    expect(
      sdWaves.every((w) => w.quota === BROCHURE_WAVE_QUOTA && w.notes === BROCHURE_WAVE_NOTE)
    ).toBe(true);
    // TK Qur'an has no pay-in-full discount.
    const tk = must(
      periods.find((p) => p.unitId === 'tk'),
      'tk'
    );
    expect(waves.filter((w) => w.periodId === tk.id).map((w) => w.fullPaymentDiscount)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    // The fee table, in the brochure's order, adds up to its "Jumlah".
    const sdFees = fees
      .filter((f) => f.periodId === sd.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sdFees.map((f) => f.label)).toEqual(BROCHURE_INTAKES.SD_IT.fees.map((f) => f.label));
    expect(
      admissionFeeTotals(
        sdFees.map((f) => ({
          residency: f.residency,
          isMonthly: f.isMonthly,
          maleAmount: Number(f.maleAmount),
          femaleAmount: Number(f.femaleAmount),
        }))
      ).map((t) => [t.residency, t.male])
    ).toEqual([
      ['BOARDING', 5_850_000],
      ['NON_BOARDING', 3_650_000],
    ]);
    // Only the brochure's four units.
    expect(periods.some((p) => p.unitId === 'pst')).toBe(false);
  });

  it("sets the demo package's per-wave periods of the same year aside, keeping them", async () => {
    const { db, periods } = fakeDb(UNITS);
    await loadSpmb20272028(db, { now: NOW });
    const yearId = periods[0].academicYearId;
    periods.push(
      {
        id: 'demo-1',
        unitId: 'smp',
        academicYearId: yearId,
        name: 'SPMB 2027/2028 Gelombang 1',
        isActive: true,
      },
      {
        id: 'demo-2',
        unitId: 'smp',
        academicYearId: yearId,
        name: 'SPMB 2027/2028 Gelombang 2',
        isActive: true,
      },
      {
        id: 'other-year',
        unitId: 'smp',
        academicYearId: 'older',
        name: 'SPMB 2026/2027',
        isActive: true,
      }
    );

    const results = await loadSpmb20272028(db, { now: NOW, update: true });

    expect(
      must(
        results.find((r) => r.unit === 'SMP_IT'),
        'SMP_IT'
      ).deactivated
    ).toEqual(['SPMB 2027/2028 Gelombang 1', 'SPMB 2027/2028 Gelombang 2']);
    expect(periods.filter((p) => p.id.startsWith('demo')).map((p) => p.isActive)).toEqual([
      false,
      false,
    ]);
    // Another year is not this script's business.
    expect(
      must(
        periods.find((p) => p.id === 'other-year'),
        'other-year'
      ).isActive
    ).toBe(true);
  });

  it("leaves a loaded unit alone, so an admin's edit is never overwritten", async () => {
    const { db, periods, waves } = fakeDb(UNITS);
    await loadSpmb20272028(db, { now: NOW });
    const smp = must(
      periods.find((p) => p.unitId === 'smp'),
      'smp'
    );
    smp.requirements = ['Diubah admin'];
    smp.contactName = 'Panitia SMP IT';
    const count = waves.length;

    const again = await loadSpmb20272028(db, { now: NOW });

    expect(again.map((r) => r.action)).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
    expect(smp.requirements).toEqual(['Diubah admin']);
    expect(waves).toHaveLength(count);
  });

  it("on update, lays the brochure over again but keeps the contact, the quotas and an admin's close", async () => {
    const { db, periods, waves } = fakeDb(UNITS);
    await loadSpmb20272028(db, { now: NOW });
    const smp = must(
      periods.find((p) => p.unitId === 'smp'),
      'smp'
    );
    smp.requirements = ['Diubah admin'];
    smp.contactName = 'Panitia SMP IT';
    const [w1, w2] = waves.filter((w) => w.periodId === smp.id);
    w1.status = 'FULL';
    w1.quota = 60;
    w2.status = 'OPEN'; // stale: wave 2 has not opened yet

    const again = await loadSpmb20272028(db, { now: NOW, update: true });

    expect(again.map((r) => r.action)).toEqual(['updated', 'updated', 'updated', 'updated']);
    expect(smp.requirements).toEqual(BROCHURE_INTAKES.SMP_IT.requirements);
    expect(smp.contactName).toBe('Panitia SMP IT');
    expect([w1.status, w1.quota]).toEqual(['FULL', 60]);
    expect(w2.status).toBe('UPCOMING');
    expect(waves.filter((w) => w.periodId === smp.id)).toHaveLength(4);
  });

  it('refuses when a unit is missing or doubled, before writing anything', async () => {
    const missing = fakeDb(UNITS.filter((u) => u.type !== 'SMA_QURAN'));
    await expect(loadSpmb20272028(missing.db, { now: NOW })).rejects.toThrow(
      'Expected one active SMA_QURAN unit, found 0'
    );
    expect(missing.periods).toHaveLength(0);

    const doubled = fakeDb([...UNITS, { id: 'sd2', type: 'SD_IT' }]);
    await expect(loadSpmb20272028(doubled.db, { now: NOW })).rejects.toThrow(
      'Expected one active SD_IT unit, found 2'
    );
    expect(doubled.periods).toHaveLength(0);
  });
});
