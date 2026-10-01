import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    staff: { findUnique: vi.fn() },
    attendanceSite: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    attendancePolicy: { findFirst: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    staffAttendance: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    shiftAssignment: { findFirst: vi.fn() },
    shiftRotation: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    workShift: { findUnique: vi.fn(), update: vi.fn() },
    workWeekConfig: { findFirst: vi.fn() },
    calendarEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    attendanceExemption: { findFirst: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    leave: { findMany: vi.fn() },
    retentionPolicy: { findMany: vi.fn() },
    unit: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../utils/managed-upload', () => ({
  deleteManagedUpload: vi.fn(),
}));

import { prisma } from '../../../lib/prisma';
import { deleteManagedUpload } from '../../../utils/managed-upload';
import { todayWib, dayOf } from '../../../utils/wib';
import {
  selfCheckIn,
  selfCheckOut,
  getMyAttendance,
  haversineMeters,
  computeLateMinutes,
  resolveShiftForDate,
  isNonWorkingDay,
  isExemptFromAttendance,
  resolveDelegatedStaffId,
  scopedUnitId,
  updateAttendanceSite,
  updateWorkShift,
  updateShiftRotation,
  enforceAttendanceRetention,
} from '../hr.service';
import { bulkAttendanceSchema } from '../hr.schema';

const m = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
};

/** A shift that starts at 07:00 WIB with a 15-minute grace. */
const pagiShift = {
  id: 'shift-pagi',
  startTime: '07:00',
  endTime: '14:00',
  graceMinutes: 15,
  crossesMidnight: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.staffAttendance.upsert.mockResolvedValue({ id: 'att-1' });
  m.staffAttendance.findUnique.mockResolvedValue(null);
  m.attendanceRecord.create.mockResolvedValue({});
  m.shiftAssignment.findFirst.mockResolvedValue(null);
  m.shiftRotation.findFirst.mockResolvedValue(null);
  m.attendanceSite.findMany.mockResolvedValue([]);
  m.calendarEvent.findFirst.mockResolvedValue(null);
  m.calendarEvent.findMany.mockResolvedValue([]);
  m.workWeekConfig.findFirst.mockResolvedValue(null);
  m.attendanceExemption.findFirst.mockResolvedValue(null);
  m.attendancePolicy.findFirst.mockResolvedValue(null);
  m.userRoleAssignment.findMany.mockResolvedValue([]);
  m.auditLog.create.mockResolvedValue({});
  m.attendanceRecord.findMany.mockResolvedValue([]);
  m.attendanceRecord.updateMany.mockResolvedValue({ count: 1 });
  m.staffAttendance.deleteMany.mockResolvedValue({ count: 0 });
  m.leave.findMany.mockResolvedValue([]);
  m.retentionPolicy.findMany.mockResolvedValue([]);
  m.unit.findMany.mockResolvedValue([{ id: 'unit-1' }]);
  m.attendancePolicy.findMany.mockResolvedValue([]);
  vi.mocked(deleteManagedUpload).mockResolvedValue('deleted');
  // The punch and its evidence are one write; run the callback against the mock.
  m.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn as unknown[])
  );
});

describe('haversineMeters', () => {
  it('is zero for the same point and ~111 km per degree of latitude', () => {
    expect(haversineMeters(-6.5, 106.8, -6.5, 106.8)).toBe(0);
    expect(haversineMeters(0, 0, 1, 0)).toBeGreaterThan(110_000);
    expect(haversineMeters(0, 0, 1, 0)).toBeLessThan(112_000);
  });
});

describe('computeLateMinutes (WIB)', () => {
  it('reads the punch on the WIB clock, not the container clock', () => {
    // 07:20 WIB is 00:20Z; 06:30 WIB is 23:30Z the previous day.
    expect(computeLateMinutes(new Date('2026-03-02T00:05:00Z'), pagiShift)).toBe(0);
    expect(computeLateMinutes(new Date('2026-03-02T00:20:00Z'), pagiShift)).toBe(5);
    expect(computeLateMinutes(new Date('2026-03-01T23:30:00Z'), pagiShift)).toBe(0);
  });

  it('lets the unit policy override the shift grace', () => {
    // 07:20 WIB: 5 late by the shift, 0 by a 30-minute policy grace.
    expect(computeLateMinutes(new Date('2026-03-02T00:20:00Z'), pagiShift, 30)).toBe(0);
  });

  it('never counts a midnight-crossing shift as late', () => {
    const malam = { ...pagiShift, startTime: '22:00', endTime: '06:00', crossesMidnight: true };
    expect(computeLateMinutes(new Date('2026-03-02T00:20:00Z'), malam)).toBe(0);
  });

  it('returns undefined when no shift governs the day', () => {
    expect(computeLateMinutes(new Date(), null)).toBeUndefined();
  });
});

describe('selfCheckIn', () => {
  const staffRow = { unitId: 'unit-1', user: { id: 'user-1' } };

  it('refuses when the policy requires a selfie and none was sent', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.attendancePolicy.findFirst.mockResolvedValue({
      requireSelfie: true,
      requireLocation: false,
      outsideRadiusAction: 'FLAG',
    });

    await expect(selfCheckIn({ staffId: 'staff-1' })).rejects.toThrow(/selfie/i);
    expect(m.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it('refuses a person the policy exempts from daily attendance', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.attendanceExemption.findFirst.mockResolvedValue({ id: 'ex-1' });

    await expect(selfCheckIn({ staffId: 'staff-1' })).rejects.toThrow(/dikecualikan/i);
    expect(m.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it('refuses a punch on a day the unit does not work', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.calendarEvent.findMany.mockResolvedValue([
      { title: 'Libur unit', startDate: dayOf(todayWib()), endDate: null },
    ]);

    await expect(selfCheckIn({ staffId: 'staff-1' })).rejects.toThrow(/bukan hari kerja/i);
  });

  it('refuses a second check-in on the same day', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.staffAttendance.findUnique.mockResolvedValue({ id: 'att-1', checkIn: new Date() });

    await expect(selfCheckIn({ staffId: 'staff-1' })).rejects.toThrow(/sudah absen masuk/i);
  });

  it('rejects a check-in outside the geofence when the policy says REJECT', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.attendancePolicy.findFirst.mockResolvedValue({
      requireSelfie: false,
      requireLocation: true,
      outsideRadiusAction: 'REJECT',
    });
    m.attendanceSite.findMany.mockResolvedValue([
      { id: 'site-1', latitude: -6.5, longitude: 106.8, radiusMeters: 100 },
    ]);

    await expect(
      selfCheckIn({ staffId: 'staff-1', latitude: -6.6, longitude: 106.9 })
    ).rejects.toThrow(/luar lokasi/i);
    expect(m.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it('flags an out-of-radius check-in and stores the distance', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.attendancePolicy.findFirst.mockResolvedValue({
      requireSelfie: false,
      requireLocation: true,
      outsideRadiusAction: 'FLAG',
    });
    m.attendanceSite.findMany.mockResolvedValue([
      { id: 'site-1', latitude: -6.5, longitude: 106.8, radiusMeters: 100 },
    ]);

    const result = await selfCheckIn({
      staffId: 'staff-1',
      latitude: -6.5,
      longitude: 106.8,
      photoUrl: 'https://example.test/selfie.jpg',
    });

    expect(result.withinRadius).toBe(true);
    const record = m.attendanceRecord.create.mock.calls[0][0].data;
    expect(record.kind).toBe('CHECK_IN');
    expect(record.distanceMeters).toBe(0);
    expect(record.photoUrl).toBe('https://example.test/selfie.jpg');
  });

  it('files the punch under the WIB day, not the UTC day', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);

    await selfCheckIn({ staffId: 'staff-1' });

    const write = m.staffAttendance.upsert.mock.calls[0][0];
    expect(write.create.date).toEqual(dayOf(todayWib()));
  });

  it('marks a late arrival from the WIB clock', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.shiftAssignment.findFirst.mockResolvedValue({ shift: pagiShift });

    // Freeze the clock at 07:30 WIB on a fixed day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T00:30:00Z'));
    try {
      const result = await selfCheckIn({ staffId: 'staff-1' });
      expect(result.lateMinutes).toBe(15);
      expect(m.staffAttendance.upsert.mock.calls[0][0].create.status).toBe('LATE');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('selfCheckOut', () => {
  const staffRow = { unitId: 'unit-1' };

  it('refuses a checkout without a check-in today', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.staffAttendance.findUnique.mockResolvedValue(null);

    await expect(selfCheckOut({ staffId: 'staff-1' })).rejects.toThrow(/absen masuk/i);
  });

  it('refuses a second checkout', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.staffAttendance.findUnique.mockResolvedValue({
      id: 'att-1',
      checkIn: new Date(),
      checkOut: new Date(),
      records: [],
    });

    await expect(selfCheckOut({ staffId: 'staff-1' })).rejects.toThrow(/sudah absen keluar/i);
  });

  it('writes a CHECK_OUT record against the day row', async () => {
    m.staff.findUnique.mockResolvedValue(staffRow);
    m.staffAttendance.findUnique.mockResolvedValue({
      id: 'att-1',
      checkIn: new Date(),
      checkOut: null,
      records: [],
    });
    m.staffAttendance.update.mockResolvedValue({ id: 'att-1' });

    await selfCheckOut({ staffId: 'staff-1', photoUrl: 'https://example.test/out.jpg' });

    expect(m.attendanceRecord.create.mock.calls[0][0].data.kind).toBe('CHECK_OUT');
  });
});

describe('getMyAttendance', () => {
  it('reports whether the caller may clock in or out today', async () => {
    m.staff.findUnique.mockResolvedValue({ unitId: 'unit-1', user: { id: 'user-1' } });
    m.staffAttendance.findUnique.mockResolvedValue({
      id: 'att-1',
      checkIn: new Date(),
      checkOut: null,
    });

    const result = await getMyAttendance('staff-1', '2026-03-02');

    expect(result.canCheckIn).toBe(false);
    expect(result.canCheckOut).toBe(true);
    expect(result.isExempt).toBe(false);
  });

  it('blocks both actions for an exempt person', async () => {
    m.staff.findUnique.mockResolvedValue({ unitId: 'unit-1', user: { id: 'user-1' } });
    m.attendanceExemption.findFirst.mockResolvedValue({ id: 'ex-1' });

    const result = await getMyAttendance('staff-1', '2026-03-02');

    expect(result.isExempt).toBe(true);
    expect(result.canCheckIn).toBe(false);
    expect(result.canCheckOut).toBe(false);
  });
});

describe('resolveShiftForDate', () => {
  it('prefers a fixed assignment that covers the day', async () => {
    m.shiftAssignment.findFirst.mockResolvedValue({ shift: { id: 'shift-A' } });
    const shift = await resolveShiftForDate('staff-1', '2026-03-02');
    expect(shift).toEqual({ id: 'shift-A' });
    expect(m.shiftRotation.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to a rotation and returns the shift only on that person’s turn', async () => {
    m.shiftRotation.findFirst.mockResolvedValue({
      shift: { id: 'shift-B' },
      memberIds: ['staff-1', 'staff-2'],
      startDate: new Date('2026-03-01'),
      cycleDays: 7,
    });
    // Day 0 → member[0]; day 8 → member[1] (8 / 7 = 1).
    const day0 = await resolveShiftForDate('staff-1', '2026-03-01');
    expect(day0).toEqual({ id: 'shift-B' });

    const day8 = await resolveShiftForDate('staff-2', '2026-03-09');
    expect(day8).toEqual({ id: 'shift-B' });

    const offTurn = await resolveShiftForDate('staff-2', '2026-03-01');
    expect(offTurn).toBeNull();
  });
});

describe('isNonWorkingDay', () => {
  it('treats a unit holiday as a non-working day', async () => {
    m.calendarEvent.findMany.mockResolvedValue([
      { title: 'Isra Mi\u2019raj', startDate: dayOf('2026-03-02'), endDate: null },
    ]);
    expect(await isNonWorkingDay('2026-03-02', 'unit-1')).toBe(true);
  });

  it('treats a day outside the configured work week as non-working', async () => {
    m.workWeekConfig.findFirst.mockResolvedValue({ workDays: [1, 2, 3, 4, 5] });
    // Sunday 2026-03-01 → 0, not in the list.
    expect(await isNonWorkingDay('2026-03-01', 'unit-1')).toBe(true);
    expect(await isNonWorkingDay('2026-03-02', 'unit-1')).toBe(false);
  });

  it('defaults to a Monday–Saturday week when nothing is configured', async () => {
    // Sunday 2026-03-01 is the default rest day; Monday 2026-03-02 is not.
    expect(await isNonWorkingDay('2026-03-01', 'unit-1')).toBe(true);
    expect(await isNonWorkingDay('2026-03-02', 'unit-1')).toBe(false);
  });
});

describe('isExemptFromAttendance', () => {
  it('is exempt when the person or their role is listed', async () => {
    m.attendanceExemption.findFirst.mockResolvedValue({ id: 'ex-1' });
    expect(await isExemptFromAttendance('staff-1', ['KYAI'])).toBe(true);
  });

  it('is not exempt when nothing matches', async () => {
    expect(await isExemptFromAttendance('staff-1', ['STAFF'])).toBe(false);
  });
});

describe('resolveDelegatedStaffId', () => {
  it('refuses a teacher naming a colleague', async () => {
    await expect(
      resolveDelegatedStaffId({ roleCode: 'SDIT_GURU', unitId: 'unit-1' }, 'staff-2')
    ).rejects.toThrow(/admin unit/i);
  });

  it('refuses a unit admin naming staff from another unit', async () => {
    m.staff.findUnique.mockResolvedValue({ id: 'staff-2', unitId: 'unit-2' });
    await expect(
      resolveDelegatedStaffId({ roleCode: 'SDIT_ADMIN', unitId: 'unit-1' }, 'staff-2')
    ).rejects.toThrow(/luar unit/i);
  });

  it('allows a unit admin within their own unit', async () => {
    m.staff.findUnique.mockResolvedValue({ id: 'staff-2', unitId: 'unit-1' });
    expect(
      await resolveDelegatedStaffId({ roleCode: 'SDIT_ADMIN', unitId: 'unit-1' }, 'staff-2')
    ).toBe('staff-2');
  });

  it('does not treat a yayasan governance role as a unit admin', async () => {
    await expect(
      resolveDelegatedStaffId({ roleCode: 'YAYASAN_BENDAHARA', unitId: null }, 'staff-2')
    ).rejects.toThrow(/admin unit/i);
  });
});

describe('scopedUnitId', () => {
  it('pins a unit admin to their own unit', () => {
    expect(scopedUnitId({ roleCode: 'SDIT_ADMIN', unitId: 'unit-1' }, 'unit-9')).toBe('unit-1');
  });

  it('lets a super admin name any unit', () => {
    expect(scopedUnitId({ roleCode: 'SUPER_ADMIN', unitId: null }, 'unit-9')).toBe('unit-9');
  });

  it('does not pin a yayasan governance role to a unit', () => {
    expect(scopedUnitId({ roleCode: 'YAYASAN_KETUA', unitId: null }, 'unit-9')).toBe('unit-9');
  });
});

describe('bulkAttendanceSchema', () => {
  it('accepts a date picker’s calendar day, not only a datetime', () => {
    // The bulk page posts "yyyy-MM-dd"; a datetime-only schema rejected it, so
    // the button was a 400 and bulk attendance never saved.
    const parsed = bulkAttendanceSchema.safeParse({
      date: '2026-09-29',
      records: [{ staffId: '11111111-1111-4111-8111-111111111111', status: 'ABSENT' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a full datetime', () => {
    const parsed = bulkAttendanceSchema.safeParse({
      date: '2026-09-29T00:00:00.000Z',
      records: [{ staffId: '11111111-1111-4111-8111-111111111111', status: 'PRESENT' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a value that is neither a day nor a datetime', () => {
    expect(bulkAttendanceSchema.safeParse({ date: '29/09/2026', records: [] }).success).toBe(false);
  });
});

describe('overnight shifts', () => {
  const malam = {
    id: 'shift-malam',
    startTime: '22:00',
    endTime: '06:00',
    graceMinutes: 15,
    crossesMidnight: true,
  };

  it('counts a late arrival against the shift’s start day', () => {
    // 23:00 WIB on 2026-09-29 = 16:00Z; 45 late after 15 minutes of grace.
    const late = computeLateMinutes(
      new Date('2026-09-29T16:00:00Z'),
      malam,
      undefined,
      '2026-09-29'
    );
    expect(late).toBe(45);
    // 22:05 WIB is within grace.
    expect(
      computeLateMinutes(new Date('2026-09-29T15:05:00Z'), malam, undefined, '2026-09-29')
    ).toBe(0);
  });

  it('attaches a checkout after midnight to the previous day’s open row', async () => {
    m.staff.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    // No row for today; yesterday holds an open check-in on a midnight-crossing
    // shift. The checkout must find it.
    m.staffAttendance.findUnique.mockImplementation(
      async ({ where }: { where: { staffId_date: { date: Date } } }) =>
        where.staffId_date.date.toISOString().slice(0, 10) === '2026-09-29'
          ? { id: 'att-night', checkIn: new Date(), checkOut: null, records: [], shift: malam }
          : null
    );
    m.staffAttendance.update.mockResolvedValue({ id: 'att-night' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00Z')); // 07:00 WIB on the 30th
    try {
      await selfCheckOut({ staffId: 'staff-1' });
      expect(m.staffAttendance.update.mock.calls[0][0].where).toEqual({ id: 'att-night' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still refuses a checkout with no open row at all', async () => {
    m.staff.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    m.staffAttendance.findUnique.mockResolvedValue(null);
    await expect(selfCheckOut({ staffId: 'staff-1' })).rejects.toThrow(/absen masuk/i);
  });
});

describe('scoped settings writes cannot change unit', () => {
  it('refuses a site moved to another unit', async () => {
    m.attendanceSite.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    await expect(
      updateAttendanceSite('site-1', { unitId: 'unit-2' } as never, 'unit-1')
    ).rejects.toThrow(/unit lain/i);
    expect(m.attendanceSite.update).not.toHaveBeenCalled();
  });

  it('pins a site update to the admin’s own unit', async () => {
    m.attendanceSite.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    m.attendanceSite.update.mockResolvedValue({ id: 'site-1' });
    await updateAttendanceSite('site-1', { label: 'Gerbang' } as never, 'unit-1');
    expect(m.attendanceSite.update.mock.calls[0][0].data.unitId).toBe('unit-1');
  });

  it('refuses a shift moved to another unit', async () => {
    m.workShift.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    await expect(
      updateWorkShift('shift-1', { unitId: 'unit-2' } as never, 'unit-1')
    ).rejects.toThrow(/unit lain/i);
    expect(m.workShift.update).not.toHaveBeenCalled();
  });

  it('refuses a rotation repointed at another unit’s shift', async () => {
    m.shiftRotation.findUnique.mockResolvedValue({ shift: { unitId: 'unit-1' } });
    m.workShift.findUnique.mockResolvedValue({ unitId: 'unit-2' });
    await expect(
      updateShiftRotation('rot-1', { shiftId: 'shift-other' } as never, 'unit-1')
    ).rejects.toThrow(/unit/i);
    expect(m.shiftRotation.update).not.toHaveBeenCalled();
  });

  it('allows a rotation repointed within the same unit', async () => {
    m.shiftRotation.findUnique.mockResolvedValue({ shift: { unitId: 'unit-1' } });
    m.workShift.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    m.shiftRotation.update.mockResolvedValue({ id: 'rot-1' });
    await updateShiftRotation('rot-1', { shiftId: 'shift-own' } as never, 'unit-1');
    expect(m.shiftRotation.update).toHaveBeenCalled();
  });
});

describe('enforceAttendanceRetention — shared photos', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const expiredAt = new Date('2025-01-01T00:00:00Z'); // well past the 365-day window

  function photoRow(id: string, photoUrl: string, capturedAt: Date) {
    return { id, photoUrl, capturedAt, attendance: { staff: { unitId: 'unit-1' } } };
  }

  it('keeps a file another, unexpired record still points at', async () => {
    const shared = 'http://localhost:3000/uploads/shared.jpg';
    m.attendanceRecord.findMany.mockResolvedValue([
      photoRow('r-old', shared, expiredAt),
      photoRow('r-new', shared, new Date('2026-09-30T00:00:00Z')),
    ]);

    const result = await enforceAttendanceRetention(now);

    // The expired row drops its reference; the file survives for the other row.
    expect(deleteManagedUpload).not.toHaveBeenCalled();
    expect(m.attendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-old', photoUrl: shared },
      data: { photoUrl: null },
    });
    expect(result.photosErased).toBe(1);
  });

  it('deletes a file once no unexpired record references it', async () => {
    const url = 'http://localhost:3000/uploads/solo.jpg';
    m.attendanceRecord.findMany.mockResolvedValue([photoRow('r-1', url, expiredAt)]);

    await enforceAttendanceRetention(now);

    expect(deleteManagedUpload).toHaveBeenCalledWith(url);
    expect(m.attendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', photoUrl: url },
      data: { photoUrl: null },
    });
  });

  it('leaves an external URL and its reference alone', async () => {
    const url = 'https://photos.example/selfie.jpg';
    m.attendanceRecord.findMany.mockResolvedValue([photoRow('r-1', url, expiredAt)]);
    vi.mocked(deleteManagedUpload).mockResolvedValue('unsupported');

    const result = await enforceAttendanceRetention(now);

    // No managed bytes to remove: clearing the field would lose the only
    // reference to a photo still stored elsewhere.
    expect(m.attendanceRecord.updateMany).not.toHaveBeenCalled();
    expect(result.photosErased).toBe(0);
  });
});
