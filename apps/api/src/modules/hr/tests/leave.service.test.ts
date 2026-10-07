import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaveStatus, LeaveType, StaffAttendanceStatus } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock: Record<string, unknown> = {
    leave: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    staff: { findUnique: vi.fn() },
    teacher: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    leaveBalance: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    staffAttendance: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prismaMock)
      : Promise.all(arg as Promise<unknown>[])
  );
  return { prismaMock };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { createLeave, approveLeave, deleteLeave, getLeaveBalance } from '../hr.service';

const db = prismaMock as {
  leave: Record<string, ReturnType<typeof vi.fn>>;
  staff: { findUnique: ReturnType<typeof vi.fn> };
  teacher: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  academicYear: { findFirst: ReturnType<typeof vi.fn> };
  leaveBalance: Record<string, ReturnType<typeof vi.fn>>;
  staffAttendance: { upsert: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const STAFF = '11111111-1111-4111-8111-111111111111';
const TEACHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  db.leave.findFirst.mockResolvedValue(null);
  db.leave.aggregate.mockResolvedValue({ _sum: { totalDays: 0 } });
  db.leaveBalance.findUnique.mockResolvedValue(null);
  db.leave.create.mockImplementation(async ({ data }: { data: unknown }) => ({
    id: 'leave-1',
    ...(data as object),
  }));
});

describe('createLeave', () => {
  it('rejects a request with neither a staffId nor a teacherId before touching the database', async () => {
    await expect(
      createLeave({
        type: LeaveType.SICK,
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-01-05T00:00:00.000Z',
        reason: 'demam',
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/staffId or teacherId/),
    });

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.leave.create).not.toHaveBeenCalled();
  });

  it('counts both end days of a leave (inclusive totalDays)', async () => {
    await createLeave({
      staffId: STAFF,
      type: LeaveType.SICK,
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: '2026-01-07T00:00:00.000Z',
      reason: 'demam',
    });

    expect(db.leave.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalDays: 3, staffId: STAFF, type: LeaveType.SICK }),
      })
    );
  });

  it('refuses a leave that overlaps a pending or approved request', async () => {
    db.leave.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      createLeave({
        staffId: STAFF,
        type: LeaveType.SICK,
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-01-05T00:00:00.000Z',
        reason: 'demam',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/overlaps/) });

    expect(db.leave.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        staffId: STAFF,
        OR: [
          {
            startDate: { lte: new Date('2026-01-05T00:00:00.000Z') },
            endDate: { gte: new Date('2026-01-05T00:00:00.000Z') },
          },
        ],
      }),
    });
    expect(db.leave.create).not.toHaveBeenCalled();
  });

  it('does not check a balance for a non-annual leave', async () => {
    await createLeave({
      staffId: STAFF,
      type: LeaveType.SICK,
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: '2026-01-05T00:00:00.000Z',
      reason: 'demam',
    });

    expect(db.academicYear.findFirst).not.toHaveBeenCalled();
    expect(db.leaveBalance.findUnique).not.toHaveBeenCalled();
    expect(db.leave.create).toHaveBeenCalled();
  });

  it('refuses an annual leave with no academic year covering the dates', async () => {
    db.staff.findUnique.mockResolvedValue({ userId: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue(null);

    await expect(
      createLeave({
        staffId: STAFF,
        type: LeaveType.ANNUAL,
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-03T00:00:00.000Z',
        reason: 'cuti tahunan',
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/Academic Year/),
    });
    expect(db.leave.create).not.toHaveBeenCalled();
  });

  it('counts pending requests against the balance before allowing more annual leave', async () => {
    db.staff.findUnique.mockResolvedValue({ userId: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue({
      id: 'ay-1',
      startDate: new Date('2025-07-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    });
    db.leave.aggregate.mockResolvedValue({ _sum: { totalDays: 3 } });
    db.leaveBalance.findUnique.mockResolvedValue({ remainingDays: 5 });

    await expect(
      createLeave({
        staffId: STAFF,
        type: LeaveType.ANNUAL,
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-01-08T00:00:00.000Z',
        reason: 'cuti tahunan',
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/Remaining: 2 days/),
    });
    expect(db.leave.create).not.toHaveBeenCalled();
  });

  it('creates an annual leave when the balance covers it', async () => {
    db.staff.findUnique.mockResolvedValue({ userId: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue({
      id: 'ay-1',
      startDate: new Date('2025-07-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    });
    db.leave.aggregate.mockResolvedValue({ _sum: { totalDays: 0 } });
    db.leaveBalance.findUnique.mockResolvedValue({ remainingDays: 10 });

    await createLeave({
      staffId: STAFF,
      type: LeaveType.ANNUAL,
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: '2026-01-07T00:00:00.000Z',
      reason: 'cuti tahunan',
    });

    expect(db.leave.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalDays: 3 }) })
    );
  });

  it('falls back to a 12-day quota when no balance row exists, counting approved and pending days', async () => {
    db.staff.findUnique.mockResolvedValue({ userId: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue({
      id: 'ay-1',
      startDate: new Date('2025-07-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    });
    db.leaveBalance.findUnique.mockResolvedValue(null);
    // First aggregate is pending (2), second is approved (8): 12 - 10 = 2 remaining.
    db.leave.aggregate
      .mockResolvedValueOnce({ _sum: { totalDays: 2 } })
      .mockResolvedValueOnce({ _sum: { totalDays: 8 } });

    await expect(
      createLeave({
        staffId: STAFF,
        type: LeaveType.ANNUAL,
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-01-08T00:00:00.000Z',
        reason: 'cuti tahunan',
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/Remaining: 2 days/),
    });

    expect(db.leave.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: LeaveStatus.APPROVED }),
      })
    );
  });
});

describe('approveLeave', () => {
  it('records the rejection note and touches neither the balance nor attendance', async () => {
    db.leave.update.mockResolvedValue({
      id: 'leave-1',
      staffId: null,
      teacherId: TEACHER,
      type: LeaveType.ANNUAL,
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: new Date('2026-01-06T00:00:00.000Z'),
      totalDays: 2,
      staff: null,
      teacher: { userId: 'user-1' },
    });

    await approveLeave('leave-1', 'approver-1', {
      status: LeaveStatus.REJECTED,
      rejectedNote: 'staf tidak cukup',
    });

    expect(db.leave.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: LeaveStatus.REJECTED,
          rejectedNote: 'staf tidak cukup',
          approvedBy: { connect: { id: 'approver-1' } },
        }),
      })
    );
    expect(db.leaveBalance.update).not.toHaveBeenCalled();
    expect(db.staffAttendance.upsert).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('on approval decrements the balance and marks each day as LEAVE attendance', async () => {
    db.leave.update.mockResolvedValue({
      id: 'leave-1',
      staffId: null,
      teacherId: TEACHER,
      type: LeaveType.ANNUAL,
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: new Date('2026-01-06T00:00:00.000Z'),
      totalDays: 2,
      staff: null,
      teacher: { userId: 'user-1' },
    });
    db.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    db.leaveBalance.findUnique.mockResolvedValue({ id: 'balance-1' });
    db.leaveBalance.update.mockResolvedValue({});
    db.staffAttendance.upsert.mockResolvedValue({});

    await approveLeave('leave-1', 'approver-1', { status: LeaveStatus.APPROVED });

    expect(db.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: 'balance-1' },
      data: {
        usedDays: { increment: 2 },
        remainingDays: { decrement: 2 },
      },
    });
    expect(db.staffAttendance.upsert).toHaveBeenCalledTimes(2);
    expect(db.staffAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teacherId: TEACHER,
          status: StaffAttendanceStatus.LEAVE,
        }),
      })
    );
  });
});

describe('deleteLeave', () => {
  it('refuses to delete an approved leave', async () => {
    db.leave.findUnique.mockResolvedValue({ id: 'leave-1', status: LeaveStatus.APPROVED });

    await expect(deleteLeave('leave-1')).rejects.toThrow(/Cannot delete approved leave/);
    expect(db.leave.delete).not.toHaveBeenCalled();
  });

  it('deletes a leave that is not approved', async () => {
    db.leave.findUnique.mockResolvedValue({ id: 'leave-1', status: LeaveStatus.PENDING });
    db.leave.delete.mockResolvedValue({ id: 'leave-1' });

    await deleteLeave('leave-1');

    expect(db.leave.delete).toHaveBeenCalledWith({ where: { id: 'leave-1' } });
  });
});

describe('getLeaveBalance', () => {
  it('resolves a staff id to its user and reports the stored annual balance', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.staff.findUnique.mockResolvedValue({ userId: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    db.leaveBalance.findMany.mockResolvedValue([
      { leaveType: LeaveType.ANNUAL, totalDays: 14, usedDays: 4, remainingDays: 10 },
      { leaveType: LeaveType.SICK, totalDays: 0, usedDays: 2, remainingDays: 0 },
    ]);

    const result = await getLeaveBalance(STAFF, 2026);

    expect(result).toMatchObject({
      employeeId: STAFF,
      year: 2026,
      annualQuota: 14,
      usedAnnual: 4,
      remainingAnnual: 10,
      totalUsed: 6,
    });
    expect(result.usedByType).toEqual({ [LeaveType.ANNUAL]: 4, [LeaveType.SICK]: 2 });
  });

  it('falls back to approved leaves for the year when no balance rows exist', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-1' });
    db.academicYear.findFirst.mockResolvedValue(null);
    db.leave.findMany.mockResolvedValue([
      { type: LeaveType.ANNUAL, totalDays: 3 },
      { type: LeaveType.ANNUAL, totalDays: 2 },
    ]);

    const result = await getLeaveBalance('user-1', 2026);

    expect(result).toMatchObject({
      annualQuota: 12,
      usedAnnual: 5,
      remainingAnnual: 7,
      totalUsed: 5,
    });
  });
});
