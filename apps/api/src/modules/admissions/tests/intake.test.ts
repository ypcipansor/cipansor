import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  createAdmissionPeriodSchema,
  createAdmissionWaveSchema,
  updateAdmissionWaveSchema,
} from '@cipansor/shared';

// An SPMB intake as the yayasan's brochure prints it (decisions/spmb-2027-2028.md):
// one unit's period for a year, its waves with the sessions after registration
// and a discount for paying in full, and per unit the requirements, the
// minimum age and the contact person. The admin enters it in the portal; the
// public page and the chatbot read it.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    admissionPeriod: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    admissionWave: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { createAdmissionPeriod, updateAdmissionPeriod } from '../admissions.service';
import { waveService } from '../ppdb-wave.service';

const SMP = '11111111-1111-4111-8111-111111111111';
const SD = '22222222-2222-4222-8222-222222222222';
const YEAR = '33333333-3333-4333-8333-333333333333';
const PERIOD = '44444444-4444-4444-8444-444444444444';
const smpAdmin = { id: 'u1', role: 'UNIT_ADMIN', roleCode: 'SMPIT_ADMIN', unitId: SMP };

/** The brochure's SMP IT intake for 2027/2028. */
const brochurePeriod = {
  unitId: SMP,
  academicYearId: YEAR,
  name: 'SPMB 2027/2028 SMP IT',
  startDate: '2026-10-01',
  endDate: '2027-07-10',
  requirements: ['  Tes seleksi ', 'NISN', 'SKL', 'SKKB', 'Wakaf buku'],
  contactName: 'Panitia SPMB SMP IT',
  contactPhone: '0812 3456 7890',
};

/** Its first wave. */
const wave1 = {
  periodId: PERIOD,
  name: 'Gelombang 1',
  waveNumber: 1,
  startDate: '2026-10-01',
  endDate: '2026-12-20',
  quota: 60,
  testStartDate: '2026-12-20',
  testEndDate: '2026-12-25',
  resultsStartDate: '2026-12-26',
  resultsEndDate: '2026-12-27',
  reRegistrationStartDate: '2026-12-28',
  reRegistrationEndDate: '2027-01-03',
  fullPaymentDiscount: 1_000_000,
};

beforeEach(() => vi.clearAllMocks());

describe('the intake contract', () => {
  it("takes the brochure's period, trimming each requirement", () => {
    const parsed = createAdmissionPeriodSchema.parse(brochurePeriod);
    expect(parsed.requirements).toEqual(['Tes seleksi', 'NISN', 'SKL', 'SKKB', 'Wakaf buku']);
    expect(parsed).toMatchObject({ quota: 0, registrationFee: 0, isActive: true });
  });

  it.each([
    ['an end before the start', { endDate: '2026-09-30' }],
    ['an empty requirement', { requirements: ['NISN', '  '] }],
    ['a phone number that is not one', { contactPhone: 'hubungi TU' }],
    ['a minimum age of 31 years', { minAgeMonths: 372 }],
    ['a date-time instead of a day', { startDate: '2026-10-01T00:00:00.000Z' }],
  ])('refuses %s', (_label, change) => {
    expect(createAdmissionPeriodSchema.safeParse({ ...brochurePeriod, ...change }).success).toBe(
      false
    );
  });

  it("takes the brochure's first wave, and the fourth, which has registration only", () => {
    expect(createAdmissionWaveSchema.parse(wave1).fullPaymentDiscount).toBe(1_000_000);
    const wave4 = createAdmissionWaveSchema.parse({
      periodId: PERIOD,
      name: 'Gelombang 4',
      waveNumber: 4,
      startDate: '2027-06-01',
      endDate: '2027-07-10',
      quota: 20,
    });
    expect(wave4).toMatchObject({ testStartDate: null, fullPaymentDiscount: null });
  });

  it.each([
    ['a test that ends before it starts', { testEndDate: '2026-12-19' }],
    ['a results end with no start', { resultsStartDate: null }],
    ['registration that closes before it opens', { endDate: '2026-09-30' }],
    ['a negative discount', { fullPaymentDiscount: -1 }],
  ])('refuses a wave with %s', (_label, change) => {
    expect(createAdmissionWaveSchema.safeParse({ ...wave1, ...change }).success).toBe(false);
  });

  it('accepts a session of one day: a start with no end', () => {
    expect(
      createAdmissionWaveSchema.safeParse({ ...wave1, testEndDate: null, resultsEndDate: null })
        .success
    ).toBe(true);
  });
});

describe('creating and editing a period', () => {
  it('opens at the start of the first day and closes at the end of the last, in WIB', async () => {
    vi.mocked(prisma.admissionPeriod.create).mockResolvedValue({ id: PERIOD } as never);

    await createAdmissionPeriod(
      createAdmissionPeriodSchema.parse({
        ...brochurePeriod,
        minAgeMonths: 144,
        ageReferenceDate: '2027-07-01',
      }),
      smpAdmin
    );

    const data = vi.mocked(prisma.admissionPeriod.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2027-07-10T16:59:59.999Z'),
      minAgeMonths: 144,
      ageReferenceDate: new Date('2027-07-01T00:00:00.000Z'),
      contactPhone: '0812 3456 7890',
    });
  });

  it("refuses another unit's period", async () => {
    await expect(
      createAdmissionPeriod(
        createAdmissionPeriodSchema.parse({ ...brochurePeriod, unitId: SD }),
        smpAdmin
      )
    ).rejects.toThrow();
    expect(prisma.admissionPeriod.create).not.toHaveBeenCalled();
  });

  it('refuses a new end before the start already saved', async () => {
    vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue({
      unitId: SMP,
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2027-07-10T16:59:59.999Z'),
    } as never);

    await expect(
      updateAdmissionPeriod(PERIOD, { endDate: '2026-09-01' }, smpAdmin)
    ).rejects.toThrow(/tidak boleh sebelum/);
    expect(prisma.admissionPeriod.update).not.toHaveBeenCalled();
  });

  it('keeps what an edit leaves out, and clears what it empties', async () => {
    vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue({
      unitId: SMP,
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2027-07-10T16:59:59.999Z'),
    } as never);

    await updateAdmissionPeriod(PERIOD, { contactPhone: null, requirements: [] }, smpAdmin);

    const data = vi.mocked(prisma.admissionPeriod.update).mock.calls[0][0].data;
    expect(data).toMatchObject({ contactPhone: null, requirements: [] });
    expect(data.startDate).toBeUndefined();
    expect(data.ageReferenceDate).toBeUndefined();
  });
});

describe('creating and editing a wave', () => {
  beforeEach(() => {
    vi.mocked(prisma.admissionPeriod.findUnique).mockResolvedValue({ unitId: SMP } as never);
  });

  it('stores the sessions as days and the discount as money', async () => {
    vi.mocked(prisma.admissionWave.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.admissionWave.create).mockResolvedValue({ id: 'w1' } as never);

    await waveService.create(createAdmissionWaveSchema.parse(wave1), smpAdmin);

    const data = vi.mocked(prisma.admissionWave.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2026-12-20T16:59:59.999Z'),
      testStartDate: new Date('2026-12-20T00:00:00.000Z'),
      reRegistrationEndDate: new Date('2027-01-03T00:00:00.000Z'),
    });
    expect(data.fullPaymentDiscount).toEqual(new Prisma.Decimal(1_000_000));
  });

  it("reads a new wave's status from its dates, unless one is given", async () => {
    // 2 October 2026, noon in Tasikmalaya: wave 1 (1 Oct – 20 Dec) is open.
    vi.useFakeTimers({ now: new Date('2026-10-02T05:00:00.000Z'), toFake: ['Date'] });
    try {
      vi.mocked(prisma.admissionWave.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.admissionWave.create).mockResolvedValue({ id: 'w' } as never);
      const status = async (wave: Record<string, unknown>) => {
        vi.mocked(prisma.admissionWave.create).mockClear();
        await waveService.create(createAdmissionWaveSchema.parse({ ...wave1, ...wave }), smpAdmin);
        return vi.mocked(prisma.admissionWave.create).mock.calls[0][0].data.status;
      };

      expect(await status({})).toBe('OPEN');
      expect(await status({ startDate: '2027-01-01', endDate: '2027-02-28' })).toBe('UPCOMING');
      expect(
        await status({
          startDate: '2026-09-01',
          endDate: '2026-10-01',
          testStartDate: null,
          testEndDate: null,
          resultsStartDate: null,
          resultsEndDate: null,
          reRegistrationStartDate: null,
          reRegistrationEndDate: null,
        })
      ).toBe('CLOSED');
      expect(await status({ status: 'FULL' })).toBe('FULL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 409, not 500, for a wave number already used', async () => {
    vi.mocked(prisma.admissionWave.findFirst).mockResolvedValue({ id: 'w0' } as never);

    await expect(
      waveService.create(createAdmissionWaveSchema.parse(wave1), smpAdmin)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('weighs a new session end against the start already saved', async () => {
    vi.mocked(prisma.admissionWave.findUnique).mockResolvedValue({
      id: 'w1',
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2026-12-20T16:59:59.999Z'),
      testStartDate: new Date('2026-12-20T00:00:00.000Z'),
      testEndDate: new Date('2026-12-25T00:00:00.000Z'),
      resultsStartDate: null,
      resultsEndDate: null,
      reRegistrationStartDate: null,
      reRegistrationEndDate: null,
      period: { unitId: SMP },
    } as never);

    await expect(
      waveService.update(
        'w1',
        updateAdmissionWaveSchema.parse({ testEndDate: '2026-12-01' }),
        smpAdmin
      )
    ).rejects.toThrow(/selesai tes tidak boleh sebelum/);
    await expect(
      waveService.update(
        'w1',
        updateAdmissionWaveSchema.parse({ resultsEndDate: '2026-12-27' }),
        smpAdmin
      )
    ).rejects.toThrow(/mulai pengumuman wajib diisi/);
    expect(prisma.admissionWave.update).not.toHaveBeenCalled();
  });

  it('clears a session and the discount when the edit empties them', async () => {
    vi.mocked(prisma.admissionWave.findUnique).mockResolvedValue({
      id: 'w1',
      startDate: new Date('2026-09-30T17:00:00.000Z'),
      endDate: new Date('2026-12-20T16:59:59.999Z'),
      testStartDate: new Date('2026-12-20T00:00:00.000Z'),
      testEndDate: null,
      resultsStartDate: null,
      resultsEndDate: null,
      reRegistrationStartDate: null,
      reRegistrationEndDate: null,
      period: { unitId: SMP },
    } as never);
    vi.mocked(prisma.admissionWave.update).mockResolvedValue({ id: 'w1' } as never);

    await waveService.update(
      'w1',
      updateAdmissionWaveSchema.parse({ testStartDate: null, fullPaymentDiscount: null }),
      smpAdmin
    );

    expect(vi.mocked(prisma.admissionWave.update).mock.calls[0][0].data).toMatchObject({
      testStartDate: null,
      fullPaymentDiscount: null,
    });
  });
});

describe('the migration', () => {
  const sql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../../prisma/migrations/20261003000000_spmb_intake/migration.sql'
    ),
    'utf8'
  );

  it('keeps every requirement a period already had, as a list', () => {
    // JSON arrays become their elements; other text its non-empty lines.
    expect(sql).toMatch(/jsonb_array_elements_text/);
    expect(sql).toMatch(/string_to_array\(r\.requirements, E'\\n'\)/);
    expect(sql).toMatch(/RENAME COLUMN "requirement_lines" TO "requirements"/);
  });

  it('lets the database refuse a session that ends before it starts', () => {
    for (const session of ['test', 'results', 're_registration']) {
      expect(sql).toMatch(new RegExp(`"${session}_end_date" >= "${session}_start_date"`));
    }
    expect(sql).toMatch(/"full_payment_discount" >= 0/);
  });
});
