import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  admissionFeeTotals,
  replaceAdmissionFeesSchema,
  type AdmissionFeeItemInput,
} from '@cipansor/shared';

// An intake's fee table, as the yayasan's 2027/2028 brochure prints it
// ("Rincian Biaya TA 2027-2028"). The totals are computed from the lines,
// never typed, so the "Jumlah" rows cannot disagree with the lines above them.

const { prismaMock } = vi.hoisted(() => {
  const tx = {
    admissionFeeItem: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  };
  return {
    prismaMock: {
      tx,
      admissionPeriod: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { replaceAdmissionFees } from '../admissions.service';

const line = (
  label: string,
  male: number,
  female = male,
  residency: AdmissionFeeItemInput['residency'] = 'ALL',
  isMonthly = false
): AdmissionFeeItemInput => ({
  label,
  maleAmount: male,
  femaleAmount: female,
  residency,
  isMonthly,
});

/** The brochure's lines, per unit, in thousands of rupiah. */
const k = 1000;
const BROCHURE = {
  TK_QURAN: [
    line('Infaq Bangunan', 500 * k),
    line('Seragam', 500 * k),
    line('Buku Pelajaran Umum dan Kepesantrenan', 200 * k),
    line('Pendaftaran', 200 * k),
    line('SPP Bulanan (Non Boarding)', 200 * k, 200 * k, 'NON_BOARDING', true),
  ],
  SD_IT: [
    line('Infaq Bangunan', 1500 * k),
    line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k, 1750 * k, 'BOARDING'),
    line('Seragam', 500 * k),
    line('Buku Pelajaran Umum dan Kepesantrenan', 600 * k),
    line('Infaq Pendidikan 1 Tahun', 500 * k),
    line('Pendaftaran', 200 * k),
    line('SPP Bulanan (Boarding)', 800 * k, 800 * k, 'BOARDING', true),
    line('SPP Bulanan (Non Boarding)', 350 * k, 350 * k, 'NON_BOARDING', true),
  ],
  SMP_IT: [
    line('Infaq Bangunan', 3000 * k),
    line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k),
    line('Seragam', 1250 * k, 1500 * k),
    line('Buku Pelajaran Umum dan Kepesantrenan', 800 * k),
    line('Infaq Pendidikan 1 Tahun', 600 * k),
    line('Pendaftaran', 200 * k),
    line('SPP Bulanan (Boarding)', 950 * k, 950 * k, 'BOARDING', true),
  ],
  SMA_QURAN: [
    line('Infaq Bangunan', 3000 * k),
    line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k),
    line('Seragam', 1250 * k, 1500 * k),
    line('Buku Pelajaran Umum dan Kepesantrenan', 1000 * k),
    line('Infaq Pendidikan 1 Tahun', 850 * k),
    line('Pendaftaran', 200 * k),
    line('SPP Bulanan (Boarding)', 950 * k, 950 * k, 'BOARDING', true),
  ],
};

describe("the brochure's totals, from its lines", () => {
  it.each([
    // unit, residency, ikhwan, akhwat, monthly — the brochure's "Jumlah" rows
    ['TK_QURAN', 'NON_BOARDING', 1_600_000, 1_600_000, 200_000],
    ['SD_IT', 'BOARDING', 5_850_000, 5_850_000, 800_000],
    ['SD_IT', 'NON_BOARDING', 3_650_000, 3_650_000, 350_000],
    ['SMP_IT', 'BOARDING', 8_550_000, 8_800_000, 950_000],
    ['SMA_QURAN', 'BOARDING', 9_000_000, 9_250_000, 950_000],
  ] as const)('%s %s: Rp%d / Rp%d', (unit, residency, male, female, monthly) => {
    const totals = admissionFeeTotals(BROCHURE[unit]);
    expect(totals.find((t) => t.residency === residency)).toEqual({
      residency,
      male,
      female,
      monthlyMale: monthly,
      monthlyFemale: monthly,
    });
  });

  it('offers only the residencies the table has lines for', () => {
    expect(admissionFeeTotals(BROCHURE.SD_IT).map((t) => t.residency)).toEqual([
      'BOARDING',
      'NON_BOARDING',
    ]);
    expect(admissionFeeTotals(BROCHURE.SMP_IT).map((t) => t.residency)).toEqual(['BOARDING']);
    expect(admissionFeeTotals([line('Pendaftaran', 200 * k)])).toEqual([
      { residency: 'ALL', male: 200 * k, female: 200 * k, monthlyMale: 0, monthlyFemale: 0 },
    ]);
  });

  it('reads the amounts as the API sends them, as decimal strings', () => {
    const [total] = admissionFeeTotals([
      { maleAmount: '1500000.00', femaleAmount: '1500000.00', residency: 'ALL', isMonthly: false },
      { maleAmount: '200000.00', femaleAmount: '200000.00', residency: 'ALL', isMonthly: false },
    ]);
    expect(total.male).toBe(1_700_000);
  });
});

describe('the fee table contract', () => {
  it.each([
    ['a negative amount', { maleAmount: -1 }],
    ['cents', { femaleAmount: 1500.5 }],
    ['an empty label', { label: '  ' }],
    ['an unknown residency', { residency: 'ASRAMA' }],
  ])('refuses %s', (_label, change) => {
    expect(
      replaceAdmissionFeesSchema.safeParse({ items: [{ ...line('Seragam', 500 * k), ...change }] })
        .success
    ).toBe(false);
  });

  it('takes an empty table: a unit with no fees published yet', () => {
    expect(replaceAdmissionFeesSchema.parse({ items: [] })).toEqual({ items: [] });
  });
});

describe('saving a fee table', () => {
  const SMP = '11111111-1111-4111-8111-111111111111';
  const smpAdmin = { id: 'u1', role: 'UNIT_ADMIN', roleCode: 'SMPIT_ADMIN', unitId: SMP };

  beforeEach(() => vi.clearAllMocks());

  it('replaces the whole table in one transaction, in the order shown', async () => {
    prismaMock.admissionPeriod.findUnique.mockResolvedValue({ unitId: SMP });

    await replaceAdmissionFees('p1', { items: BROCHURE.SMP_IT }, smpAdmin);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.tx.admissionFeeItem.deleteMany).toHaveBeenCalledWith({
      where: { periodId: 'p1' },
    });
    const rows = prismaMock.tx.admissionFeeItem.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(7);
    expect(rows[2]).toMatchObject({
      periodId: 'p1',
      sortOrder: 2,
      label: 'Seragam',
      maleAmount: new Prisma.Decimal(1_250_000),
      femaleAmount: new Prisma.Decimal(1_500_000),
      residency: 'ALL',
      isMonthly: false,
    });
  });

  it("refuses another unit's table, and a period that does not exist", async () => {
    prismaMock.admissionPeriod.findUnique.mockResolvedValueOnce({ unitId: 'other-unit' });
    await expect(replaceAdmissionFees('p1', { items: [] }, smpAdmin)).rejects.toThrow();

    prismaMock.admissionPeriod.findUnique.mockResolvedValueOnce(null);
    await expect(replaceAdmissionFees('nope', { items: [] }, smpAdmin)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('the migration', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../../../prisma/migrations/20261003010000_spmb_fees/migration.sql'),
    'utf8'
  );

  it('refuses a negative amount and a blank label in the database too', () => {
    expect(sql).toMatch(/"male_amount" >= 0 AND "female_amount" >= 0/);
    expect(sql).toMatch(/btrim\("label"\) <> ''/);
  });

  it('goes with the period it belongs to', () => {
    expect(sql).toMatch(/REFERENCES "admission_periods"\("id"\)\s+ON DELETE CASCADE/);
  });
});
