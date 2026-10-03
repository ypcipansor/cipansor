import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { demoIntakeName, ensureDemoIntake } from '../../../../prisma/seeds/spmb-demo';
import { loadSpmb20272028 } from '../../../../prisma/seeds/spmb-2027-2028';
import { BROCHURE_INTAKES } from '../../../../prisma/seeds/spmb-2027-2028.data';

// The base seed and the presentation pack make each unit's intake through one
// helper: the module's shape (one period, its waves, the fee table), dates
// around today so the seed never expires, and a name the brochure loader does
// not mistake for its own.

// The fake stands in for Prisma's generated shapes, which vary per call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Periods with nested waves and fees, as `admissionPeriod.create` writes them. */
function fakeDb(units: Row[] = []) {
  let n = 0;
  const id = () => `id-${++n}`;
  const years: Row[] = [];
  const periods: Row[] = [];
  const waves: Row[] = [];
  const fees: Row[] = [];
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(row[k]);
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
      return row[k] === v;
    });
  const withWaves = (p: Row) => ({
    ...p,
    waves: waves.filter((w) => w.periodId === p.id).sort((a, b) => a.waveNumber - b.waveNumber),
  });
  const db = {
    academicYear: {
      findUnique: async ({ where }: Row) => years.find((y) => y.name === where.name) ?? null,
      create: async ({ data }: Row) => (years.push({ id: id(), ...data }), years.at(-1)),
    },
    unit: {
      findMany: async ({ where }: Row) => units.filter((u) => where.type.in.includes(u.type)),
    },
    admissionPeriod: {
      findFirst: async ({ where, include }: Row) => {
        const p = periods.find((p) => matches(p, where));
        return p ? (include ? withWaves(p) : p) : null;
      },
      findMany: async ({ where }: Row) => periods.filter((p) => matches(p, where)),
      create: async ({ data }: Row) => {
        const { waves: w, feeItems: f, ...fields } = data;
        const period = { id: id(), ...fields };
        periods.push(period);
        for (const wave of w?.create ?? []) waves.push({ id: id(), periodId: period.id, ...wave });
        for (const fee of f?.create ?? []) fees.push({ periodId: period.id, ...fee });
        return withWaves(period);
      },
      update: async ({ where, data }: Row) =>
        Object.assign(periods.find((p) => p.id === where.id) ?? {}, data),
      updateMany: async ({ where, data }: Row) => {
        for (const p of periods.filter((p) => matches(p, where))) Object.assign(p, data);
      },
    },
    admissionWave: {
      findUnique: async () => null,
      create: async ({ data }: Row) => (waves.push({ id: id(), ...data }), waves.at(-1)),
    },
    admissionFeeItem: {
      deleteMany: async () => undefined,
      createMany: async ({ data }: Row) => void fees.push(...data),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as unknown as PrismaClient, years, periods, waves, fees };
}

const NOW = new Date('2026-10-03T05:00:00Z'); // 12.00 WIB
const YEAR = { id: 'ay-2027', name: '2027/2028' };

describe('a demo intake', () => {
  it('is one period with wave 1 open today and wave 2 ahead, on WIB day bounds', async () => {
    const { db } = fakeDb();

    const period = await ensureDemoIntake(db, {
      unit: 'SMP_IT',
      unitId: 'smp',
      academicYear: YEAR,
      quotas: [50, 20],
      now: NOW,
    });

    expect(period.name).toBe('SPMB 2027/2028 SMP IT (contoh)');
    expect(period.waves.map((w) => [w.name, w.status, w.quota])).toEqual([
      ['Gelombang 1', 'OPEN', 50],
      ['Gelombang 2', 'UPCOMING', 20],
    ]);
    const [w1, w2] = period.waves;
    expect(w1.startDate < NOW && NOW < w1.endDate).toBe(true);
    // 45 days back and 45 ahead; wave 2 opens the next WIB day.
    expect(w1.startDate.toISOString()).toBe('2026-08-18T17:00:00.000Z');
    expect(w1.endDate.toISOString()).toBe('2026-11-17T16:59:59.999Z');
    expect(w2.startDate.toISOString()).toBe('2026-11-17T17:00:00.000Z');
    // The period spans its waves exactly.
    expect(period.startDate).toEqual(w1.startDate);
    expect(period.endDate).toEqual(w2.endDate);
    expect(period.quota).toBe(70);
    // Sessions after the close, as the brochure's wave 1 has them.
    expect(w1.testStartDate?.toISOString().slice(0, 10)).toBe('2026-11-17');
    expect(w1.reRegistrationEndDate?.toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it("carries the brochure's fees, requirements and discounts, never a contact", async () => {
    const { db, periods, fees } = fakeDb();

    const sd = await ensureDemoIntake(db, {
      unit: 'SD_IT',
      unitId: 'sd',
      academicYear: YEAR,
      quotas: [28, 12],
      now: NOW,
    });
    const tk = await ensureDemoIntake(db, {
      unit: 'TK_QURAN',
      unitId: 'tk',
      academicYear: YEAR,
      quotas: [20, 10],
      now: NOW,
    });

    expect(sd.requirements).toEqual(BROCHURE_INTAKES.SD_IT.requirements);
    expect(sd.minAgeMonths).toBe(84);
    expect(Number(sd.registrationFee)).toBe(200_000);
    expect(
      fees
        .filter((f) => f.periodId === sd.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => f.label)
    ).toEqual(BROCHURE_INTAKES.SD_IT.fees.map((f) => f.label));
    expect(sd.waves.map((w) => Number(w.fullPaymentDiscount))).toEqual([1_000_000, 750_000]);
    expect(tk.waves.map((w) => w.fullPaymentDiscount)).toEqual([null, null]);
    expect(periods.every((p) => !('contactName' in p))).toBe(true);
  });

  it('is made once: a second call returns the one there, untouched', async () => {
    const { db, periods, waves } = fakeDb();
    const args = {
      unit: 'SMP_IT' as const,
      unitId: 'smp',
      academicYear: YEAR,
      quotas: [50, 20] as [number, number],
    };
    const first = await ensureDemoIntake(db, { ...args, now: NOW });

    const again = await ensureDemoIntake(db, {
      ...args,
      now: new Date('2027-01-15T05:00:00Z'),
    });

    expect(again.id).toBe(first.id);
    expect(again.waves.map((w) => w.status)).toEqual(['OPEN', 'UPCOMING']);
    expect(periods).toHaveLength(1);
    expect(waves).toHaveLength(2);
  });

  it('is set aside by the brochure loader, not mistaken for its period', async () => {
    const units = [
      { id: 'tk', type: 'TK_QURAN' },
      { id: 'sd', type: 'SD_IT' },
      { id: 'smp', type: 'SMP_IT' },
      { id: 'sma', type: 'SMA_QURAN' },
    ];
    const { db, years, periods } = fakeDb(units);
    years.push({ ...YEAR });
    const demo = await ensureDemoIntake(db, {
      unit: 'SMP_IT',
      unitId: 'smp',
      academicYear: YEAR,
      quotas: [50, 20],
      now: NOW,
    });
    expect(demoIntakeName(YEAR.name, 'SMP_IT')).not.toBe('SPMB 2027/2028 SMP IT');

    const results = await loadSpmb20272028(db, { now: NOW });

    const smp = results.find((r) => r.unit === 'SMP_IT');
    expect([smp?.action, smp?.deactivated]).toEqual([
      'created',
      ['SPMB 2027/2028 SMP IT (contoh)'],
    ]);
    expect(periods.find((p) => p.id === demo.id)?.isActive).toBe(false);
  });
});
