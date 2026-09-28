import { describe, it, expect, vi, beforeEach } from 'vitest';

// A pupil's daily report: which rows an account reaches (studentScope), and
// what the server fills in itself — the unit and the academic year come from
// the pupil and the day, never from the caller.

vi.mock('@/lib/prisma', () => {
  const prisma = {
    dailyStudentReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dailyReportPhoto: { createMany: vi.fn(), deleteMany: vi.fn() },
    dailyHomework: { createMany: vi.fn(), deleteMany: vi.fn() },
    student: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    teacher: { findUnique: vi.fn() },
    kitabProgress: { upsert: vi.fn() },
    tahfidzRecord: { create: vi.fn() },
  };
  return { prisma };
});
vi.mock('../../notifications', () => ({
  whatsAppService: { sendDailyReportNotification: vi.fn().mockResolvedValue({ success: true }) },
}));

import { prisma } from '@/lib/prisma';
import { whatsAppService } from '../../notifications';
import { dailyReportService } from '../daily-report.service';

type Mocked = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const db = prisma as unknown as Mocked;

const TK = 'unit-tk';
const SD = 'unit-sd';
const guruTk = { sub: 'u-guru-tk', roleCode: 'TKQ_GURU', unitId: TK };
const wali = { sub: 'u-wali', roleCode: 'TKQ_ORANG_TUA', unitId: TK };
const superAdmin = { sub: 'u-sa', roleCode: 'SUPER_ADMIN', unitId: null };
const STUDENT = '22222222-2222-4222-8222-222222222222';

const pupil = {
  id: STUDENT,
  unitId: TK,
  parentName: 'Ibu Aisyah',
  parentPhone: '0812000000',
  unit: { type: 'TK_QURAN' },
  user: { name: 'Hafidz Kecil' },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.dailyStudentReport.findMany.mockResolvedValue([]);
  db.dailyStudentReport.count.mockResolvedValue(0);
  db.dailyStudentReport.findUnique.mockResolvedValue(null);
  db.dailyStudentReport.create.mockImplementation(async ({ data }) => ({
    id: 'r-1',
    ...data,
    student: { id: STUDENT, user: { name: pupil.user.name } },
  }));
  db.academicYear.findFirst.mockResolvedValue({ id: 'ay-2026' });
  db.student.findFirst.mockResolvedValue(pupil);
});

const whereOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0].where;

describe('which reports an account reaches', () => {
  it("a wali's list holds their own children only", async () => {
    await dailyReportService.findAll({}, wali);
    expect(whereOf(db.dailyStudentReport.findMany).AND[0]).toEqual({
      student: { parents: { some: { parentId: 'u-wali' } } },
    });
  });

  it("a teacher's list is their unit's, whatever unit they ask for", async () => {
    await dailyReportService.findAll({ unitId: SD }, guruTk);
    const filters = whereOf(db.dailyStudentReport.findMany).AND;
    expect(filters[0]).toEqual({ student: { unitId: TK } });
    expect(filters).toContainEqual({ unitId: SD });
  });

  it('the super admin reaches every unit', async () => {
    await dailyReportService.findAll({}, superAdmin);
    expect(whereOf(db.dailyStudentReport.findMany).AND[0]).toEqual({});
  });

  it('a report outside the scope is not found (404), not forbidden', async () => {
    db.dailyStudentReport.findFirst.mockResolvedValue(null);
    await expect(dailyReportService.findById('r-x', wali)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(whereOf(db.dailyStudentReport.findFirst).AND[1]).toEqual({
      student: { parents: { some: { parentId: 'u-wali' } } },
    });
  });

  it('dates filter by calendar day', async () => {
    await dailyReportService.findAll({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, guruTk);
    expect(whereOf(db.dailyStudentReport.findMany).AND).toContainEqual({
      reportDate: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T00:00:00.000Z'),
      },
    });
  });

  it('"read by the wali" is a filter on parentReadAt', async () => {
    await dailyReportService.findAll({ isConfirmedByParent: 'false' }, guruTk);
    expect(whereOf(db.dailyStudentReport.findMany).AND).toContainEqual({ parentReadAt: null });
  });
});

describe('making a report', () => {
  const body = { studentId: STUDENT, reportDate: '2026-09-26' };

  it('takes the unit and its type from the pupil, the year from the day', async () => {
    await dailyReportService.create(body, guruTk);
    const data = db.dailyStudentReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      studentId: STUDENT,
      unitId: TK,
      unitType: 'TK_QURAN',
      academicYearId: 'ay-2026',
      reportDate: new Date('2026-09-26T00:00:00.000Z'),
      createdById: 'u-guru-tk',
    });
    const day = new Date('2026-09-26T00:00:00.000Z');
    expect(db.academicYear.findFirst.mock.calls[0][0].where).toMatchObject({
      startDate: { lte: day },
      endDate: { gte: day },
    });
  });

  it('arrival is a time of day in WIB, on the report day', async () => {
    await dailyReportService.create({ ...body, arrivalTime: '06:45' }, guruTk);
    expect(db.dailyStudentReport.create.mock.calls[0][0].data.arrivalTime).toEqual(
      new Date('2026-09-25T23:45:00.000Z')
    );
  });

  it('a day no academic year holds leaves the year empty', async () => {
    db.academicYear.findFirst.mockResolvedValue(null);
    await dailyReportService.create(body, guruTk);
    expect(db.dailyStudentReport.create.mock.calls[0][0].data.academicYearId).toBeNull();
  });

  it("a pupil outside the teacher's scope is not found (404)", async () => {
    db.student.findFirst.mockResolvedValue(null);
    await expect(dailyReportService.create(body, guruTk)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.student.findFirst.mock.calls[0][0].where.AND[1]).toEqual({ unitId: TK });
    expect(db.dailyStudentReport.create).not.toHaveBeenCalled();
  });

  it('a second report for the same pupil and day is a conflict (409)', async () => {
    db.dailyStudentReport.findUnique.mockResolvedValue({ id: 'r-0' });
    await expect(dailyReportService.create(body, guruTk)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('keeps the uploaded photos with their captions', async () => {
    await dailyReportService.create(
      {
        ...body,
        photos: [{ url: 'http://api.test/uploads/a.jpg', caption: 'Bermain balok' }],
      },
      guruTk
    );
    expect(db.dailyStudentReport.create.mock.calls[0][0].data.photos).toEqual({
      create: [{ photoUrl: 'http://api.test/uploads/a.jpg', caption: 'Bermain balok' }],
    });
  });

  it('breakfast "habis" or "setengah" means the child had breakfast', async () => {
    await dailyReportService.create({ ...body, breakfastConsumption: 'SETENGAH' }, guruTk);
    expect(db.dailyStudentReport.create.mock.calls[0][0].data.hadBreakfast).toBe(true);
  });

  it('tells the wali on WhatsApp', async () => {
    await dailyReportService.create({ ...body, morningMood: 'HAPPY' }, guruTk);
    expect(whatsAppService.sendDailyReportNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        parentPhone: '0812000000',
        studentName: 'Hafidz Kecil',
        mood: 'HAPPY',
      })
    );
  });
});

describe('a day for a whole class', () => {
  const other = {
    ...pupil,
    id: '33333333-3333-4333-8333-333333333333',
    unitId: SD,
    unit: { type: 'SD_IT' },
  };

  beforeEach(() => {
    db.student.findMany.mockResolvedValue([pupil, other]);
    db.dailyStudentReport.findMany.mockResolvedValue([]);
    db.dailyStudentReport.createMany.mockResolvedValue({ count: 2 });
    db.teacher.findUnique.mockResolvedValue({ id: 't-1' });
  });

  it("puts each report in its own pupil's unit, and arrival in WIB", async () => {
    await dailyReportService.bulkCreate(
      {
        reportDate: '2026-09-26',
        reports: [{ studentId: pupil.id, arrivalTime: '06:45' }, { studentId: other.id }],
      },
      superAdmin
    );
    const rows = db.dailyStudentReport.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      unitId: TK,
      unitType: 'TK_QURAN',
      academicYearId: 'ay-2026',
      arrivalTime: new Date('2026-09-25T23:45:00.000Z'),
    });
    expect(rows[1]).toMatchObject({ unitId: SD, unitType: 'SD_IT' });
  });

  it('keeps what a wali kelas writes per pupil, under the same names as one report', async () => {
    await dailyReportService.bulkCreate(
      {
        reportDate: '2026-09-26',
        reports: [
          {
            studentId: pupil.id,
            activitiesSummary: 'Matematika',
            learningAchievements: 'Bisa menjumlah',
            behaviorNotes: 'Tertib',
            surahPractice: 'An-Naba 1-10',
            parentNotes: 'Mohon diulang di rumah',
            homeworkSuggestion: 'Latihan hal. 12',
            napDurationMinutes: 45,
            sholatDhuha: true,
          },
        ],
      },
      superAdmin
    );
    expect(db.dailyStudentReport.createMany.mock.calls[0][0].data[0]).toMatchObject({
      activitiesSummary: 'Matematika',
      achievements: 'Bisa menjumlah',
      behaviorNotes: 'Tertib',
      tahfidzActivity: 'An-Naba 1-10',
      teacherNotes: 'Mohon diulang di rumah',
      homeActivity: 'Latihan hal. 12',
      napDuration: 45,
      sholatDhuha: true,
    });
  });

  it('a pupil outside the scope fails as not found; the others are made', async () => {
    db.student.findMany.mockResolvedValue([pupil]);
    const result = await dailyReportService.bulkCreate(
      {
        reportDate: '2026-09-26',
        reports: [{ studentId: pupil.id }, { studentId: other.id }],
      },
      guruTk
    );
    expect(db.student.findMany.mock.calls[0][0].where.AND[1]).toEqual({ unitId: TK });
    expect(result.created).toBe(1);
    expect(result.details.failed).toEqual([{ studentId: other.id, error: 'Student not found' }]);
  });

  it('a pupil who already has that day stays as it was', async () => {
    db.dailyStudentReport.findMany.mockResolvedValue([{ studentId: pupil.id }]);
    const result = await dailyReportService.bulkCreate(
      { reportDate: '2026-09-26', reports: [{ studentId: pupil.id }] },
      superAdmin
    );
    expect(result.created).toBe(0);
    expect(db.dailyStudentReport.createMany).not.toHaveBeenCalled();
  });
});

describe('changing, removing and acknowledging', () => {
  it('update and delete reach only reports in scope (404 otherwise)', async () => {
    db.dailyStudentReport.findFirst.mockResolvedValue(null);
    await expect(
      dailyReportService.update('r-x', { healthNotes: 'x' }, guruTk)
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(dailyReportService.delete('r-x', guruTk)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.dailyStudentReport.update).not.toHaveBeenCalled();
    expect(db.dailyStudentReport.delete).not.toHaveBeenCalled();
  });

  it('photos sent with an update replace the old ones', async () => {
    db.dailyStudentReport.findFirst.mockResolvedValue({ id: 'r-1' });
    db.dailyStudentReport.update.mockResolvedValue({ id: 'r-1' });
    await dailyReportService.update(
      'r-1',
      { photos: [{ url: 'http://api.test/uploads/b.jpg' }] },
      guruTk
    );
    expect(db.dailyReportPhoto.deleteMany).toHaveBeenCalledWith({ where: { reportId: 'r-1' } });
    expect(db.dailyReportPhoto.createMany).toHaveBeenCalledWith({
      data: [{ reportId: 'r-1', photoUrl: 'http://api.test/uploads/b.jpg', caption: null }],
    });
  });

  it("only a wali of the report's pupil acknowledges it", async () => {
    db.dailyStudentReport.findFirst.mockResolvedValue(null);
    await expect(
      dailyReportService.confirmByParent('r-1', { parentFeedback: 'Terima kasih' }, wali)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(whereOf(db.dailyStudentReport.findFirst)).toEqual({
      id: 'r-1',
      student: { parents: { some: { parentId: 'u-wali' } } },
    });
    expect(db.dailyStudentReport.update).not.toHaveBeenCalled();
  });

  it("the wali's reply is kept and the report marked read", async () => {
    db.dailyStudentReport.findFirst.mockResolvedValue({ homeActivity: 'Membaca di rumah' });
    db.dailyStudentReport.update.mockResolvedValue({ id: 'r-1' });
    await dailyReportService.confirmByParent('r-1', { parentFeedback: 'Terima kasih' }, wali);
    const data = db.dailyStudentReport.update.mock.calls[0][0].data;
    expect(data.parentReadAt).toBeInstanceOf(Date);
    expect(data.homeActivity).toBe('Membaca di rumah\n\n[Tanggapan Orang Tua]: Terima kasih');
  });
});

describe('summaries', () => {
  it("a pupil's month needs the pupil in scope, and no academic year", async () => {
    db.student.findFirst.mockResolvedValue(null);
    await expect(
      dailyReportService.getStudentMonthlySummary(
        { studentId: STUDENT, month: 9, year: 2026 },
        wali
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    db.student.findFirst.mockResolvedValue({ id: STUDENT });
    db.student.findUnique.mockResolvedValue({ id: STUDENT });
    await dailyReportService.getStudentMonthlySummary(
      { studentId: STUDENT, month: 9, year: 2026 },
      wali
    );
    expect(whereOf(db.dailyStudentReport.findMany)).toEqual({
      studentId: STUDENT,
      reportDate: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T00:00:00.000Z'),
      },
    });
    // What the wali's page shows with each day: photos, homework, who wrote it.
    expect(db.dailyStudentReport.findMany.mock.calls.at(-1)![0].include).toEqual({
      photos: true,
      homework: true,
      createdBy: { select: { id: true, name: true } },
    });
  });

  it("a unit-bound teacher's class summary is their own unit's", async () => {
    db.student.findMany.mockResolvedValue([]);
    await dailyReportService.getClassDailySummary({ unitId: SD, date: '2026-09-26' }, guruTk);
    const where = whereOf(db.student.findMany).AND;
    expect(where[0]).toEqual({ unitId: TK });
    expect(where[2]).toEqual({ unitId: TK });
  });
});
