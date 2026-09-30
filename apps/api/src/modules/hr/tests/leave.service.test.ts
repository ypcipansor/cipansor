import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    leave: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    leaveBalance: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    academicYear: { findFirst: vi.fn() },
    staffAttendance: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    staff: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../../lib/prisma';
import { approveLeave, cancelLeave, getStaffAttendanceSummary } from '../hr.service';

const mocked = prisma as unknown as {
  leave: {
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  leaveBalance: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  academicYear: { findFirst: ReturnType<typeof vi.fn> };
  staffAttendance: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  staff: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Run transaction callbacks against the same mocked client.
  mocked.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[])
  );
});

const baseLeave = {
  id: 'leave-1',
  staffId: 'staff-1',
  teacherId: null,
  type: 'ANNUAL',
  status: 'PENDING',
  startDate: new Date('2026-03-02'),
  endDate: new Date('2026-03-03'),
  totalDays: 2,
  staff: { userId: 'user-1' },
  teacher: null,
};

describe('approveLeave', () => {
  it('is idempotent: approving an approved leave does not spend the balance twice', async () => {
    mocked.leave.findUnique.mockResolvedValue({ ...baseLeave, status: 'APPROVED' });
    mocked.leave.findUniqueOrThrow.mockResolvedValue({
      ...baseLeave,
      status: 'APPROVED',
    });

    const result = await approveLeave('leave-1', 'approver-1', {
      status: 'APPROVED',
    } as never);

    expect(result.status).toBe('APPROVED');
    expect(mocked.leaveBalance.update).not.toHaveBeenCalled();
    expect(mocked.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it('refuses to reject an approved leave (revert by cancelling instead)', async () => {
    mocked.leave.findUnique.mockResolvedValue({ ...baseLeave, status: 'APPROVED' });

    await expect(
      approveLeave('leave-1', 'approver-1', { status: 'REJECTED' } as never)
    ).rejects.toThrow(/tidak dapat diubah/i);
  });

  it('spends the balance once and marks attendance when approving a pending leave', async () => {
    mocked.leave.findUnique.mockResolvedValue({ ...baseLeave, status: 'PENDING' });
    mocked.leave.update.mockResolvedValue({ ...baseLeave, status: 'APPROVED' });
    mocked.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    mocked.leaveBalance.findUnique.mockResolvedValue({ id: 'bal-1' });
    mocked.staffAttendance.upsert.mockResolvedValue({});

    await approveLeave('leave-1', 'approver-1', { status: 'APPROVED' } as never);

    expect(mocked.leaveBalance.update).toHaveBeenCalledTimes(1);
    expect(mocked.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: 'bal-1' },
      data: { usedDays: { increment: 2 }, remainingDays: { decrement: 2 } },
    });
    // One upsert per calendar day of the leave.
    expect(mocked.staffAttendance.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('cancelLeave', () => {
  it('reverts the balance and clears only the leave rows it wrote', async () => {
    mocked.leave.findUnique.mockResolvedValue({ ...baseLeave, status: 'APPROVED' });
    mocked.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    mocked.leaveBalance.findUnique.mockResolvedValue({ id: 'bal-1' });
    mocked.leave.update.mockResolvedValue({ ...baseLeave, status: 'CANCELLED' });
    mocked.staffAttendance.deleteMany.mockResolvedValue({ count: 2 });

    await cancelLeave('leave-1');

    expect(mocked.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: 'bal-1' },
      data: { usedDays: { decrement: 2 }, remainingDays: { increment: 2 } },
    });
    const deleteArgs = mocked.staffAttendance.deleteMany.mock.calls[0][0];
    expect(deleteArgs.where.status).toBe('LEAVE');
    expect(deleteArgs.where.notes).toBe('Cuti: ANNUAL');
    // Keyed on the resolved Staff identity, not on staffId-or-teacherId.
    expect(deleteArgs.where.staffId).toBe('staff-1');
  });

  it('does not touch the balance when cancelling a pending leave', async () => {
    mocked.leave.findUnique.mockResolvedValue({ ...baseLeave, status: 'PENDING' });
    mocked.leave.update.mockResolvedValue({ ...baseLeave, status: 'CANCELLED' });

    await cancelLeave('leave-1');

    expect(mocked.leaveBalance.update).not.toHaveBeenCalled();
    expect(mocked.staffAttendance.deleteMany).not.toHaveBeenCalled();
  });
});

describe('getStaffAttendanceSummary unit scope', () => {
  it('forbids a unit admin from reading another unit\u2019s staff summary', async () => {
    mocked.staff.findUnique.mockResolvedValue({ unitId: 'unit-2' });

    await expect(getStaffAttendanceSummary('staff-1', 3, 2026, 'unit-1')).rejects.toThrow(
      /di luar unit/i
    );
  });

  it('allows the summary for staff in the admin\u2019s own unit', async () => {
    mocked.staff.findUnique.mockResolvedValue({ unitId: 'unit-1' });
    mocked.staffAttendance.findMany.mockResolvedValue([]);

    const summary = await getStaffAttendanceSummary('staff-1', 3, 2026, 'unit-1');
    expect(summary.staffId).toBe('staff-1');
  });
});
