import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Each unit's intake, as the public SPMB page and the chatbot announce it. The
// page used to read one "active period" for the whole yayasan, so a visitor
// saw one unit's dates and fee whichever unit they meant to apply to — and the
// form filed every registration under that one period.

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { admissionPeriod: { findMany } } }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));

import { findPublicIntakes } from '../admissions.service';
import admissionsRoutes from '../admissions.routes';
import { errorHandler } from '@/middleware/error';

const NOW = new Date('2026-10-03T05:00:00.000Z');
const d = (iso: string) => new Date(iso);
const decimal = (value: number) => ({ toString: () => value.toFixed(2) });

let n = 0;
function period(
  unit: { type: string; name: string },
  start: string,
  end: string,
  extra: Record<string, unknown> = {}
) {
  n += 1;
  return {
    id: `p${n}`,
    name: `SPMB ${unit.name} ${n}`,
    startDate: d(start),
    endDate: d(end),
    registrationFee: decimal(200_000),
    requirements: [],
    minAgeMonths: null,
    ageReferenceDate: null,
    contactName: null,
    contactPhone: null,
    unit: { id: unit.type, name: unit.name, officialName: null, type: unit.type },
    academicYear: { name: '2027/2028' },
    waves: [],
    feeItems: [],
    ...extra,
  };
}

function wave(number: number, start: string, end: string, status = 'UPCOMING') {
  return {
    waveNumber: number,
    name: `Gelombang ${number}`,
    startDate: d(start),
    endDate: d(end),
    status,
    testStartDate: null,
    testEndDate: null,
    resultsStartDate: null,
    resultsEndDate: null,
    reRegistrationStartDate: null,
    reRegistrationEndDate: null,
    fullPaymentDiscount: number === 1 ? decimal(1_000_000) : null,
  };
}

const SMP = { type: 'SMP_IT', name: 'SMP IT' };
const SD = { type: 'SD_IT', name: 'SD IT' };
const TK = { type: 'TK_QURAN', name: 'TK Qur’an' };

beforeEach(() => vi.clearAllMocks());

describe('findPublicIntakes', () => {
  it('announces one intake per unit: open now, else the next, else the last', async () => {
    findMany.mockResolvedValue([
      // SMP IT: one closed, one open, one starting later — the open one.
      period(SMP, '2026-01-01T00:00:00Z', '2026-06-30T00:00:00Z'),
      period(SMP, '2027-08-01T00:00:00Z', '2027-09-01T00:00:00Z'),
      period(SMP, '2026-09-30T17:00:00Z', '2027-07-10T16:59:59Z'),
      // SD IT: two ahead — the sooner.
      period(SD, '2027-03-01T00:00:00Z', '2027-05-01T00:00:00Z'),
      period(SD, '2026-11-01T00:00:00Z', '2027-02-01T00:00:00Z'),
      // TK: two closed — the latest.
      period(TK, '2025-01-01T00:00:00Z', '2025-03-01T00:00:00Z'),
      period(TK, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'),
    ]);

    const intakes = await findPublicIntakes(NOW);

    // In the brochure's order, whatever order the rows came in.
    expect(intakes.map((i) => [i.unit.type, i.period.window, i.period.startDate])).toEqual([
      ['TK_QURAN', 'closed', '2026-01-01T00:00:00.000Z'],
      ['SD_IT', 'upcoming', '2026-11-01T00:00:00.000Z'],
      ['SMP_IT', 'open', '2026-09-30T17:00:00.000Z'],
    ]);
    expect(findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      unit: { deletedAt: null },
    });
  });

  it('never selects quota, registrant counts or anything about registrants', async () => {
    findMany.mockResolvedValue([]);
    await findPublicIntakes(NOW);

    const select = findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('quota');
    expect(select).not.toHaveProperty('registrants');
    expect(select).not.toHaveProperty('_count');
    expect(select.waves.select).not.toHaveProperty('quota');
    expect(select.waves.select).not.toHaveProperty('registeredCount');
    expect(select.waves.select).not.toHaveProperty('acceptedCount');
  });

  it("reads each wave's window from its dates, unless an admin closed it", async () => {
    findMany.mockResolvedValue([
      period(SMP, '2026-09-30T17:00:00Z', '2027-07-10T16:59:59Z', {
        waves: [
          wave(1, '2026-09-30T17:00:00Z', '2026-12-20T16:59:59Z'),
          wave(2, '2026-12-31T17:00:00Z', '2027-02-28T16:59:59Z'),
          wave(3, '2026-09-30T17:00:00Z', '2026-12-20T16:59:59Z', 'FULL'),
        ],
        feeItems: [
          {
            label: 'Seragam',
            maleAmount: decimal(1_250_000),
            femaleAmount: decimal(1_500_000),
            residency: 'ALL',
            isMonthly: false,
          },
        ],
      }),
    ]);

    const [smp] = await findPublicIntakes(NOW);

    expect(smp.waves.map((w) => w.window)).toEqual(['open', 'upcoming', 'full']);
    expect(smp.waves[0]).not.toHaveProperty('status');
    expect(smp.waves[0].fullPaymentDiscount).toBe('1000000.00');
    expect(smp.fees[0]).toEqual({
      label: 'Seragam',
      maleAmount: '1250000.00',
      femaleAmount: '1500000.00',
      residency: 'ALL',
      isMonthly: false,
    });
  });
});

describe('whether one can register today', () => {
  // The brochure's calendar: wave 1 closes on 20 December, wave 2 opens on
  // 1 January. The period runs from 1 October to 10 July throughout.
  const brochure = (status1 = 'OPEN', status2 = 'UPCOMING') =>
    period(SMP, '2026-09-30T17:00:00Z', '2027-07-10T16:59:59Z', {
      waves: [
        { ...wave(1, '2026-09-30T17:00:00Z', '2026-12-20T16:59:59Z'), status: status1 },
        { ...wave(2, '2026-12-31T17:00:00Z', '2027-02-28T16:59:59Z'), status: status2 },
      ],
    });
  const at = async (iso: string, row = brochure()) => {
    findMany.mockResolvedValue([row]);
    return (await findPublicIntakes(d(iso)))[0].period;
  };

  it('is open during a wave, and closes when the wave does', async () => {
    const p = await at('2026-10-03T05:00:00Z');
    expect([p.window, p.opensAt, p.closesAt]).toEqual(['open', null, '2026-12-20T16:59:59.000Z']);
  });

  it('is shut between two waves, and says when the next opens', async () => {
    // 25 December: the period runs on, but the API would claim no wave.
    const p = await at('2026-12-25T05:00:00Z');
    expect([p.window, p.opensAt, p.closesAt]).toEqual([
      'upcoming',
      '2026-12-31T17:00:00.000Z',
      null,
    ]);
  });

  it('is shut when an admin closed the open wave and none follows', async () => {
    const p = await at('2027-01-10T05:00:00Z', brochure('CLOSED', 'FULL'));
    expect([p.window, p.opensAt, p.closesAt]).toEqual(['closed', null, null]);
  });

  it('follows the dates alone for a period without waves', async () => {
    findMany.mockResolvedValue([period(SD, '2026-11-01T00:00:00Z', '2027-02-01T00:00:00Z')]);
    const [sd] = await findPublicIntakes(NOW);
    expect([sd.period.window, sd.period.opensAt, sd.period.closesAt]).toEqual([
      'upcoming',
      '2026-11-01T00:00:00.000Z',
      null,
    ]);
  });
});

describe('GET /admissions/public/intakes', () => {
  it('answers without a session', async () => {
    findMany.mockResolvedValue([period(SMP, '2026-09-30T17:00:00Z', '2027-07-10T16:59:59Z')]);
    const app = express();
    app.use(express.json());
    app.use('/admissions', admissionsRoutes);
    app.use(errorHandler);

    const res = await request(app).get('/admissions/public/intakes');

    expect(res.status).toBe(200);
    expect(res.body.data[0].unit.type).toBe('SMP_IT');
  });
});
