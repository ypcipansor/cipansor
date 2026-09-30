import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Generation is the moment a policy turns into money, so the two refusals
 * live here rather than in a report the admin may never open:
 *
 *  - a work day with no attendance row makes the deduction unknowable, and
 *  - a deduction past the guard (PP 36/2021 art. 32) needs an explicit,
 *    recorded override.
 */

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    payrollPeriod: { findUnique: vi.fn(), update: vi.fn() },
    staff: { findMany: vi.fn() },
    salaryComponent: { findMany: vi.fn(), upsert: vi.fn() },
    staffAttendance: { groupBy: vi.fn() },
    workWeekConfig: { findFirst: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../attendance-deduction.service', () => ({
  attendanceDeductionService: { computeForPeriod: vi.fn() },
}));

import { prisma } from '../../../lib/prisma';
import { attendanceDeductionService } from '../attendance-deduction.service';
import { payrollService } from '../payroll.service';

const PERIOD = {
  id: '11111111-1111-4111-8111-111111111111',
  unitId: 'unit-sd',
  status: 'DRAFT',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-30'),
};

function deductionRow(overrides: Record<string, unknown> = {}) {
  return {
    staffId: 'staff-1',
    staffName: 'Ustadz Ahmad',
    counts: {
      lateMinutes: 0,
      lateDays: 0,
      absentDays: 0,
      presentDays: 22,
      earlyLeaveDays: 0,
      overtimeMinutes: 0,
    },
    lines: [],
    totalDeductions: 0,
    totalEarningAdditions: 0,
    gross: 3_000_000,
    guardWarnings: [],
    guardBreaches: [],
    allowanceCap: 0,
    cappedByAllowance: 0,
    unresolvedDates: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.payrollPeriod.findUnique).mockResolvedValue(PERIOD as never);
  vi.mocked(prisma.staff.findMany).mockResolvedValue([
    {
      id: 'staff-1',
      nip: '198501012010011001',
      department: 'Guru',
      position: 'Guru',
      user: { name: 'Ustadz Ahmad' },
      employeeSalary: { baseSalary: 3_000_000, items: [], taxStatus: 'TK/0', npwp: null },
    },
  ] as never);
  vi.mocked(prisma.salaryComponent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.staffAttendance.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.workWeekConfig.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never);
  vi.mocked(attendanceDeductionService.computeForPeriod).mockResolvedValue([
    deductionRow(),
  ] as never);
});

describe('payrollService.generate', () => {
  it('refuses when a work day has no attendance row', async () => {
    vi.mocked(attendanceDeductionService.computeForPeriod).mockResolvedValue([
      deductionRow({ unresolvedDates: ['2026-09-03', '2026-09-04'] }),
    ] as never);

    await expect(
      payrollService.generate({ periodId: PERIOD.id, overwrite: false } as never)
    ).rejects.toThrow(/Absensi belum lengkap/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a deduction past the guard without an override reason', async () => {
    vi.mocked(attendanceDeductionService.computeForPeriod).mockResolvedValue([
      deductionRow({ guardBreaches: ['Gaji pokok 1500000 di bawah UMK 2000000'] }),
    ] as never);

    await expect(
      payrollService.generate({ periodId: PERIOD.id, overwrite: false } as never)
    ).rejects.toThrow(/melampaui batas/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('proceeds past the guard when an override reason is given', async () => {
    vi.mocked(attendanceDeductionService.computeForPeriod).mockResolvedValue([
      deductionRow({ guardBreaches: ['Gaji pokok 1500000 di bawah UMK 2000000'] }),
    ] as never);

    await expect(
      payrollService.generate({
        periodId: PERIOD.id,
        overwrite: false,
        overrideGuardReason: 'Kesepakatan tertulis dengan pegawai',
      } as never)
    ).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not block on an informational cap note', async () => {
    vi.mocked(attendanceDeductionService.computeForPeriod).mockResolvedValue([
      deductionRow({
        guardWarnings: ['Potongan dibatasi 500000 agar tidak melewati batas tunjangan'],
      }),
    ] as never);

    await expect(
      payrollService.generate({ periodId: PERIOD.id, overwrite: false } as never)
    ).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
