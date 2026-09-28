import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendancePatternKind } from '@prisma/client';

// The attendance pattern flag (decided 2026-09-28, decisions/absensi-harian.md):
// absent — Alpa, Sakit or Izin — on at least 10% of the days recorded this
// semester, once 10 are recorded; or late 3 times in 30 days. The wali kelas,
// the unit's guru BK and a santri mukim's musyrif see it and are told once.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: vi.fn() },
    attendance: { groupBy: vi.fn() },
    classEnrollment: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    attendancePatternFlag: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock('@/modules/dormitories', () => ({
  boardersOfMusyrif: vi.fn(),
  musyrifOfBoarders: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { boardersOfMusyrif, musyrifOfBoarders } from '@/modules/dormitories';
import {
  listPatterns,
  patternCounts,
  patternsOf,
  patternWindow,
  raiseNewPatterns,
} from '../attendance-pattern.service';

// 16:00 WIB on Monday 28 September 2026, in the first semester of 2026/2027.
const NOW = new Date('2026-09-28T09:00:00.000Z');
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

type Mark = { studentId: string; date: Date; status: string };
const marks = (studentId: string, status: string, days: string[]): Mark[] =>
  days.map((d) => ({ studentId, date: day(d), status }));
const septemberDays = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);

const MARKS: Mark[] = [
  // 10 days recorded, absent on 2 (an Alpa; a Sakit in a second class on a
  // day marked present in the first): 20% → ABSENCE.
  ...marks('s-absent', 'PRESENT', septemberDays(10, 10)),
  ...marks('s-absent', 'ABSENT', ['2026-09-10']),
  ...marks('s-absent', 'SICK', ['2026-09-11']),
  // Late 3 times in the last 30 days, and once before them: LATE only.
  ...marks('s-late', 'LATE', ['2026-09-01', '2026-09-10', '2026-09-20']),
  ...marks('s-late', 'LATE', ['2026-08-20']),
  ...marks('s-late', 'PRESENT', septemberDays(21, 7)),
  // 1 Izin in 13 days, late twice: under both lines.
  ...marks('s-steady', 'PRESENT', septemberDays(14, 12)),
  ...marks('s-steady', 'EXCUSED', ['2026-09-02']),
  ...marks('s-steady', 'LATE', ['2026-09-14', '2026-09-15']),
  // Absent 2 of 5: too few days recorded to count yet.
  ...marks('s-new', 'PRESENT', septemberDays(22, 3)),
  ...marks('s-new', 'ABSENT', ['2026-09-25', '2026-09-26']),
];

const STUDENTS = [
  { id: 's-absent', unitId: 'unit-sd', nis: '101', user: { name: 'Ahmad' } },
  { id: 's-late', unitId: 'unit-smp', nis: '201', user: { name: 'Fatimah' } },
  { id: 's-steady', unitId: 'unit-smp', nis: '202', user: { name: 'Umar' } },
  { id: 's-new', unitId: 'unit-sd', nis: '102', user: { name: 'Zaid' } },
];

const CLASSES: Record<string, { id: string; name: string; homeroom: string; active?: boolean }> = {
  's-absent': { id: 'c-1a', name: '1A', homeroom: 'u-wali-1a' },
  's-late': { id: 'c-7a', name: '7A', homeroom: 'u-wali-7a' },
  's-steady': { id: 'c-7a', name: '7A', homeroom: 'u-wali-7a' },
  's-new': { id: 'c-1a', name: '1A', homeroom: 'u-wali-1a' },
};

type Where = Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({
    startDate: new Date('2026-07-15T00:00:00.000Z'),
    endDate: new Date('2027-06-30T00:00:00.000Z'),
  } as never);
  vi.mocked(prisma.attendance.groupBy).mockImplementation((async (args: { where: Where }) => {
    const ids: string[] | undefined = args.where.studentId?.in;
    return MARKS.filter(
      (m) =>
        (!ids || ids.includes(m.studentId)) &&
        m.date >= args.where.date.gte &&
        m.date <= args.where.date.lte
    );
  }) as never);
  vi.mocked(prisma.student.findMany).mockImplementation((async (args: { where: Where }) =>
    STUDENTS.filter((s) =>
      args.where.unitId ? s.unitId === args.where.unitId : args.where.id.in.includes(s.id)
    )) as never);
  vi.mocked(prisma.classEnrollment.findMany).mockImplementation((async (args: { where: Where }) => {
    const homeroomOf: string | undefined = args.where.class?.homeroomTeacher?.userId;
    if (homeroomOf) {
      return Object.entries(CLASSES)
        .filter(([, c]) => c.homeroom === homeroomOf)
        .map(([studentId]) => ({ studentId }));
    }
    return (args.where.studentId.in as string[]).map((studentId) => {
      const c = CLASSES[studentId];
      return {
        studentId,
        class: {
          id: c.id,
          name: c.name,
          homeroomTeacher: { user: { id: c.homeroom, isActive: c.active ?? true } },
        },
      };
    });
  }) as never);
  vi.mocked(prisma.userRoleAssignment.findMany).mockResolvedValue([
    { userId: 'u-bk-smp', unitId: 'unit-smp' },
  ] as never);
  vi.mocked(prisma.attendancePatternFlag.findMany).mockResolvedValue([]);
  vi.mocked(prisma.attendancePatternFlag.createMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(boardersOfMusyrif).mockResolvedValue([]);
  vi.mocked(musyrifOfBoarders).mockResolvedValue(new Map());
});

describe('patternsOf — the rule', () => {
  const base = { recordedDays: 0, absentDays: 0, alpa: 0, sakit: 0, izin: 0, lateDays: 0 };

  it('counts absence from the tenth recorded day, at 10% and over', () => {
    expect(patternsOf({ ...base, recordedDays: 9, absentDays: 3 })).toEqual([]);
    expect(patternsOf({ ...base, recordedDays: 10, absentDays: 1 })).toEqual(['ABSENCE']);
    expect(patternsOf({ ...base, recordedDays: 11, absentDays: 1 })).toEqual([]);
    expect(patternsOf({ ...base, recordedDays: 40, absentDays: 4 })).toEqual(['ABSENCE']);
  });

  it('flags lateness at the third time', () => {
    expect(patternsOf({ ...base, lateDays: 2 })).toEqual([]);
    expect(patternsOf({ ...base, lateDays: 3 })).toEqual(['LATE']);
  });
});

describe('patternCounts', () => {
  it('counts days, not marks, and late only inside the 30 days', async () => {
    const window = await patternWindow(NOW);
    expect(window).toEqual({
      semesterStart: '2026-07-15',
      lateFrom: '2026-08-30',
      today: '2026-09-28',
    });
    const counts = await patternCounts(window!);
    expect(counts.get('s-absent')).toEqual({
      recordedDays: 10,
      absentDays: 2,
      alpa: 1,
      sakit: 1,
      izin: 0,
      lateDays: 0,
    });
    expect(counts.get('s-late')).toMatchObject({ recordedDays: 11, absentDays: 0, lateDays: 3 });
  });

  it('reads nothing outside an academic year', async () => {
    vi.mocked(prisma.academicYear.findFirst).mockResolvedValue(null);
    expect(await patternWindow(NOW)).toBeNull();
    expect(
      await listPatterns({ sub: 'u-wali-1a', roleCode: 'SDIT_GURU', unitId: 'unit-sd' }, NOW)
    ).toEqual([]);
    expect(prisma.attendance.groupBy).not.toHaveBeenCalled();
  });
});

describe('listPatterns — who sees whom', () => {
  it('shows a wali kelas the pupils of their class who show a pattern', async () => {
    vi.mocked(prisma.attendancePatternFlag.findMany).mockResolvedValue([
      { studentId: 's-absent', kind: 'ABSENCE', raisedAt: new Date('2026-09-25T09:00:00.000Z') },
    ] as never);
    const items = await listPatterns(
      { sub: 'u-wali-1a', roleCode: 'SDIT_GURU', unitId: 'unit-sd' },
      NOW
    );
    expect(items).toEqual([
      {
        student: { id: 's-absent', name: 'Ahmad', nis: '101' },
        class: { id: 'c-1a', name: '1A' },
        as: ['WALI_KELAS'],
        kinds: ['ABSENCE'],
        absence: {
          since: '2026-07-15',
          recordedDays: 10,
          absentDays: 2,
          alpa: 1,
          sakit: 1,
          izin: 0,
        },
        lateDays: 0,
        raisedAt: { ABSENCE: '2026-09-25T09:00:00.000Z' },
      },
    ]);
    // Only this class's pupils were read.
    expect(vi.mocked(prisma.attendance.groupBy).mock.calls[0][0]).toMatchObject({
      where: { studentId: { in: ['s-absent', 's-new'] } },
    });
  });

  it("shows a guru BK their unit's santri, and no other unit's", async () => {
    const items = await listPatterns(
      { sub: 'u-bk-smp', roleCode: 'SMPIT_GURU_BK', unitId: 'unit-smp' },
      NOW
    );
    expect(items.map((i) => [i.student.id, i.as, i.kinds])).toEqual([
      ['s-late', ['GURU_BK'], ['LATE']],
    ]);
  });

  it("shows a musyrif their santri mukim, even from another unit's class", async () => {
    vi.mocked(boardersOfMusyrif).mockResolvedValue(['s-absent']);
    const items = await listPatterns(
      { sub: 'u-musyrif', roleCode: 'MUSYRIF', unitId: 'unit-pesantren' },
      NOW
    );
    expect(items.map((i) => [i.student.id, i.as])).toEqual([['s-absent', ['MUSYRIF']]]);
  });

  it('shows a teacher with none of these relations nothing', async () => {
    expect(
      await listPatterns({ sub: 'u-other', roleCode: 'SMPIT_GURU', unitId: 'unit-smp' }, NOW)
    ).toEqual([]);
    expect(prisma.student.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unitId: 'unit-smp' }) })
    );
  });
});

describe('raiseNewPatterns — told once a semester', () => {
  it('raises only what was not raised yet, and names whom to tell', async () => {
    vi.mocked(prisma.attendancePatternFlag.findMany).mockResolvedValue([
      { studentId: 's-absent', kind: 'ABSENCE' },
    ] as never);
    vi.mocked(musyrifOfBoarders).mockResolvedValue(
      new Map([
        [
          's-late',
          [
            { id: 'u-musyrif', name: 'Ustadz Hasan' },
            { id: 'u-wali-7a', name: 'Bu Aisyah' },
          ],
        ],
      ])
    );

    const raised = await raiseNewPatterns(NOW);

    expect(prisma.attendancePatternFlag.createMany).toHaveBeenCalledWith({
      data: [
        {
          studentId: 's-late',
          kind: AttendancePatternKind.LATE,
          semesterStart: day('2026-07-15'),
          raisedAt: NOW,
        },
      ],
      skipDuplicates: true,
    });
    expect(raised).toEqual([
      expect.objectContaining({
        studentId: 's-late',
        name: 'Fatimah',
        className: '7A',
        kind: 'LATE',
        // The wali kelas, the unit's guru BK, the musyrif — each once.
        recipients: ['u-wali-7a', 'u-bk-smp', 'u-musyrif'],
      }),
    ]);
  });

  it('raises nothing, and writes nothing, when every pattern is known', async () => {
    vi.mocked(prisma.attendancePatternFlag.findMany).mockResolvedValue([
      { studentId: 's-absent', kind: 'ABSENCE' },
      { studentId: 's-late', kind: 'LATE' },
    ] as never);
    expect(await raiseNewPatterns(NOW)).toEqual([]);
    expect(prisma.attendancePatternFlag.createMany).not.toHaveBeenCalled();
  });

  it('leaves out a wali kelas whose account is inactive', async () => {
    CLASSES['s-late'].active = false;
    try {
      vi.mocked(prisma.attendancePatternFlag.findMany).mockResolvedValue([
        { studentId: 's-absent', kind: 'ABSENCE' },
      ] as never);
      const [raised] = await raiseNewPatterns(NOW);
      expect(raised.recipients).toEqual(['u-bk-smp']);
    } finally {
      delete CLASSES['s-late'].active;
    }
  });
});
