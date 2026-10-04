import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtracurricularCategory, ExtracurricularStatus } from '@prisma/client';
import { EXTRACURRICULAR_CATEGORIES, EXTRACURRICULAR_STATUSES } from '@cipansor/shared';

/**
 * An extracurricular as the unit keeps it. The contract is the one the
 * portal's forms send (`@cipansor/shared`); the e2e `extracurricular.spec.ts`
 * creates and edits one through those forms against Postgres.
 */

const prismaMock = vi.hoisted(() => ({
  extracurricular: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { extracurricularService } from '../extracurricular.service';
import {
  createExtracurricularSchema,
  updateExtracurricularSchema,
} from '../extracurricular.schema';

const UNIT = '11111111-1111-4111-8111-111111111111';
const OTHER_UNIT = '22222222-2222-4222-8222-222222222222';
const YEAR = '33333333-3333-4333-8333-333333333333';
const admin = { role: 'UNIT_ADMIN', roleCode: 'SMPIT_ADMIN', unitId: UNIT };

/** What the portal's form sends for Taekwondo. */
const form = (extra: Record<string, unknown> = {}) => ({
  unitId: UNIT,
  academicYearId: YEAR,
  name: 'Taekwondo',
  code: 'TKD',
  category: 'SPORTS',
  description: '',
  scheduleDay: ['TUESDAY', 'THURSDAY'],
  scheduleTime: '15:30-17:00',
  venue: 'Gelanggang Olahraga',
  maxParticipants: 30,
  ...extra,
});

/** The coach's name and nothing else of the teacher's record. */
const COACH_NAME = { select: { id: true, user: { select: { id: true, name: true } } } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the contract', () => {
  it('holds the same categories and statuses as the database', () => {
    expect([...EXTRACURRICULAR_CATEGORIES].sort()).toEqual(
      Object.values(ExtracurricularCategory).sort()
    );
    expect([...EXTRACURRICULAR_STATUSES].sort()).toEqual(
      Object.values(ExtracurricularStatus).sort()
    );
  });

  it('accepts a sport with its days, time, venue and capacity; empty text is no value', () => {
    const input = createExtracurricularSchema.parse(form());
    expect(input).toMatchObject({
      category: 'SPORTS',
      scheduleDay: ['TUESDAY', 'THURSDAY'],
      scheduleTime: '15:30-17:00',
      venue: 'Gelanggang Olahraga',
      maxParticipants: 30,
      isCompulsory: false,
    });
    expect(input.description).toBeUndefined();
  });

  it('refuses the categories the old form sent, and a time that ends before it starts', () => {
    for (const category of ['SPORT', 'ART', 'SCIENCE']) {
      expect(createExtracurricularSchema.safeParse(form({ category })).success).toBe(false);
    }
    const backwards = createExtracurricularSchema.safeParse(form({ scheduleTime: '17:00-15:30' }));
    expect(backwards.success).toBe(false);
    expect(createExtracurricularSchema.safeParse(form({ scheduleTime: '15.30' })).success).toBe(
      false
    );
  });

  it('lets an edit empty an optional field, and never move the unit', () => {
    const input = updateExtracurricularSchema.parse({
      unitId: OTHER_UNIT,
      venue: null,
      scheduleTime: null,
      maxParticipants: null,
      status: 'SUSPENDED',
    });
    expect(input).toEqual({
      venue: null,
      scheduleTime: null,
      maxParticipants: null,
      status: 'SUSPENDED',
    });
  });

  it('changes only what was sent: no default rewrites a field left out', () => {
    expect(updateExtracurricularSchema.parse({ name: 'Futsal' })).toEqual({ name: 'Futsal' });
  });
});

describe('create', () => {
  it('stores what the form sent, active, and returns only the coach name', async () => {
    prismaMock.extracurricular.findFirst.mockResolvedValue(null);
    prismaMock.extracurricular.create.mockResolvedValue({ id: 'e-1' });

    await extracurricularService.create(createExtracurricularSchema.parse(form()), admin);

    const call = prismaMock.extracurricular.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      unitId: UNIT,
      name: 'Taekwondo',
      category: 'SPORTS',
      scheduleDay: ['TUESDAY', 'THURSDAY'],
      scheduleTime: '15:30-17:00',
      venue: 'Gelanggang Olahraga',
      maxParticipants: 30,
      status: 'ACTIVE',
    });
    expect(call.include.coach).toEqual(COACH_NAME);
  });

  it("refuses another unit's, and a code the unit already uses", async () => {
    await expect(
      extracurricularService.create(
        createExtracurricularSchema.parse(form({ unitId: OTHER_UNIT })),
        admin
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    prismaMock.extracurricular.findFirst.mockResolvedValue({ id: 'e-0' });
    await expect(
      extracurricularService.create(createExtracurricularSchema.parse(form()), admin)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.extracurricular.create).not.toHaveBeenCalled();
  });
});

describe('reading', () => {
  it("lists the unit's own, with each coach's name and not the teacher's record", async () => {
    prismaMock.extracurricular.findMany.mockResolvedValue([]);
    prismaMock.extracurricular.count.mockResolvedValue(0);

    await extracurricularService.findAll({ page: 1, limit: 10 }, admin);

    const call = prismaMock.extracurricular.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ unitId: UNIT, deletedAt: null });
    expect(call.include.coach).toEqual(COACH_NAME);
    expect(call.include.assistantCoach).toEqual(COACH_NAME);
  });

  it("opens one with its members' numbers and names only", async () => {
    prismaMock.extracurricular.findUnique.mockResolvedValue({ id: 'e-1', unitId: UNIT });

    await extracurricularService.findById('e-1', admin);

    const include = prismaMock.extracurricular.findUnique.mock.calls[0][0].include;
    expect(include.coach).toEqual(COACH_NAME);
    expect(include.unit).toEqual({ select: { id: true, name: true, type: true } });
    const student = include.enrollments.select.student.select;
    expect(Object.keys(student).sort()).toEqual(['enrollments', 'id', 'nis', 'user']);
  });

  it("refuses another unit's", async () => {
    prismaMock.extracurricular.findUnique.mockResolvedValue({ id: 'e-1', unitId: OTHER_UNIT });
    await expect(extracurricularService.findById('e-1', admin)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('update', () => {
  it('writes the fields sent, an emptied one as null', async () => {
    prismaMock.extracurricular.findUnique.mockResolvedValue({
      id: 'e-1',
      unitId: UNIT,
      code: 'TKD',
    });
    prismaMock.extracurricular.update.mockResolvedValue({ id: 'e-1' });

    await extracurricularService.update(
      'e-1',
      updateExtracurricularSchema.parse({
        venue: null,
        scheduleDay: ['FRIDAY'],
        unitId: OTHER_UNIT,
      }),
      admin
    );

    const call = prismaMock.extracurricular.update.mock.calls[0][0];
    expect(call.data).toEqual({ venue: null, scheduleDay: ['FRIDAY'] });
    expect(call.include.coach).toEqual(COACH_NAME);
  });
});

describe('publicList — the public site', () => {
  const row = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
    name,
    nameEn: null,
    nameAr: null,
    category: 'SPORTS',
    unit: { type },
    ...extra,
  });

  it('lists each active one once, with its units in the site order, by category then name', async () => {
    prismaMock.extracurricular.findMany.mockResolvedValue([
      row('Taekwondo', 'SMA_QURAN', { nameEn: 'Taekwondo', nameAr: 'التايكوندو' }),
      row('Taekwondo', 'SD_IT'),
      row(' taekwondo ', 'SMP_IT'),
      row('Pramuka', 'SMP_IT', { category: 'SCOUTING', nameEn: 'Scouting' }),
      row('English Club', 'SD_IT', { category: 'LANGUAGE' }),
      row('Futsal', 'SMA_QURAN'),
    ]);

    const list = await extracurricularService.publicList();

    expect(list.map((e) => e.name)).toEqual(['Futsal', 'Taekwondo', 'Pramuka', 'English Club']);
    expect(list[1]).toEqual({
      name: 'Taekwondo',
      nameEn: 'Taekwondo',
      nameAr: 'التايكوندو',
      category: 'SPORTS',
      unitTypes: ['SD_IT', 'SMP_IT', 'SMA_QURAN'],
    });
    expect(list[2]).toMatchObject({ nameEn: 'Scouting', nameAr: null, unitTypes: ['SMP_IT'] });
  });

  it('asks for active rows of the education units, and selects nothing but names, category and unit type', async () => {
    prismaMock.extracurricular.findMany.mockResolvedValue([]);

    await extracurricularService.publicList();

    const call = prismaMock.extracurricular.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: 'ACTIVE', deletedAt: null });
    expect(call.where.unit.type.in.sort()).toEqual(
      ['PESANTREN', 'SD_IT', 'SMA_QURAN', 'SMP_IT', 'TK_QURAN'].sort()
    );
    expect(call.select).toEqual({
      name: true,
      nameEn: true,
      nameAr: true,
      category: true,
      unit: { select: { type: true } },
    });
  });
});
