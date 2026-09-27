import { describe, it, expect, vi, beforeEach } from 'vitest';

// The register reminder (decisions/absensi-harian.md): 30 minutes after a
// class's first lesson, if some pupil still has no mark, the teacher of that
// lesson and the wali kelas are reminded — once, and not on a holiday. A
// class with a few marks written by approved leave or UKS is not "taken".

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    islamicEvent: { findMany: vi.fn() },
    classEnrollment: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { minutesOf, registersDue } from '../attendance-reminder.service';

/** Monday 2026-09-28, 08:00 WIB. */
const AT_0800 = new Date('2026-09-28T01:00:00.000Z');

const lesson = (classId: string, startTime: string, teacher: string, homeroom?: string) => ({
  classId,
  startTime,
  teacher: { userId: teacher },
  class: {
    name: classId.toUpperCase(),
    unitId: 'unit-sd',
    homeroomTeacher: homeroom ? { userId: homeroom } : null,
  },
});

const enrol = (classId: string, ...students: string[]) =>
  students.map((studentId) => ({ classId, studentId }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);
  vi.mocked(prisma.islamicEvent.findMany).mockResolvedValue([]);
  vi.mocked(prisma.classEnrollment.findMany).mockResolvedValue(
    enrol('1a', 's1', 's2', 's3') as never
  );
  vi.mocked(prisma.attendance.findMany).mockResolvedValue([]);
});

describe('minutesOf', () => {
  it.each([
    ['07:30', 450],
    ['7:05', 425],
    [' 13:00 ', 780],
    ['24:00', null],
    ['07:60', null],
    ['pagi', null],
  ])('%s → %s', (time, minutes) => {
    expect(minutesOf(time)).toBe(minutes);
  });
});

describe('registersDue', () => {
  it("reminds the first lesson's teacher and the wali kelas, 30 minutes after it began", async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '09:00', 'u-guru-ipa', 'u-wali-1a'),
      lesson('1a', '07:30', 'u-guru-quran', 'u-wali-1a'),
    ] as never);
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { classId: '1a', studentId: 's1' }, // an approved leave wrote this one
    ] as never);

    expect(await registersDue(AT_0800)).toEqual([
      {
        classId: '1a',
        className: '1A',
        day: '2026-09-28',
        firstLesson: '07:30',
        enrolled: 3,
        unmarked: 2,
        userIds: ['u-guru-quran', 'u-wali-1a'],
      },
    ]);
    expect(vi.mocked(prisma.schedule.findMany).mock.calls[0][0]?.where).toMatchObject({
      isActive: true,
      dayOfWeek: 'MONDAY',
    });
  });

  it('asks nothing more when no first lesson falls due in this look', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:25', 'u-guru'), // due 07:55 — the previous look's
      lesson('2a', '07:35', 'u-guru'), // due 08:05 — the next look's
    ] as never);
    expect(await registersDue(AT_0800)).toEqual([]);
    expect(prisma.classEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('catches a first lesson that is not on the five minutes, in the look after it falls due', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:27', 'u-guru'),
    ] as never);
    expect(await registersDue(AT_0800)).toHaveLength(1); // due 07:57, caught at 08:00
    expect(await registersDue(new Date('2026-09-28T00:55:00.000Z'))).toEqual([]); // 07:55
  });

  it('reminds no one once every pupil has a mark', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:30', 'u-guru'),
    ] as never);
    vi.mocked(prisma.attendance.findMany).mockResolvedValue(enrol('1a', 's1', 's2', 's3') as never);
    expect(await registersDue(AT_0800)).toEqual([]);
  });

  it('reminds no one for a class with no pupil enrolled', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('9z', '07:30', 'u-guru'),
    ] as never);
    expect(await registersDue(AT_0800)).toEqual([]);
  });

  it('names both teachers of a team-taught first lesson, and the wali kelas once', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:30', 'u-wali-1a', 'u-wali-1a'),
      lesson('1a', '07:30', 'u-guru-2', 'u-wali-1a'),
    ] as never);
    const [due] = await registersDue(AT_0800);
    expect(due.userIds.sort()).toEqual(['u-guru-2', 'u-wali-1a']);
  });

  it.each([
    ['for every unit', { unitId: null, classId: null }],
    ['for the unit', { unitId: 'unit-sd', classId: null }],
    ['for the class', { unitId: 'unit-sd', classId: '1a' }],
  ])('reminds no one on a holiday %s', async (_what, holiday) => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:30', 'u-guru'),
    ] as never);
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([holiday] as never);
    expect(await registersDue(AT_0800)).toEqual([]);
  });

  it("is not stopped by another unit's or another class's holiday", async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:30', 'u-guru'),
    ] as never);
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([
      { unitId: 'unit-smp', classId: null },
      { unitId: 'unit-sd', classId: '2a' },
    ] as never);
    expect(await registersDue(AT_0800)).toHaveLength(1);
  });

  it('reminds no one on a hari besar Islam the calendar marks as a holiday', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', '07:30', 'u-guru'),
    ] as never);
    vi.mocked(prisma.islamicEvent.findMany).mockResolvedValue([{ unitId: null }] as never);
    expect(await registersDue(AT_0800)).toEqual([]);
  });

  it('ignores a lesson whose start is not a time', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      lesson('1a', 'pagi', 'u-guru'),
      lesson('1a', '07:30', 'u-guru-2'),
    ] as never);
    const [due] = await registersDue(AT_0800);
    expect(due.userIds).toEqual(['u-guru-2']);
  });
});
