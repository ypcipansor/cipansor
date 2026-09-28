import { describe, it, expect, vi, beforeEach } from 'vitest';

// The 16:00 WIB pattern flag: each newly raised pattern is told to each of its
// people once, in words that say what was counted; a failed send does not stop
// the others; a day with nothing new sends nothing.

vi.mock('@/modules/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/modules/attendance/attendance-pattern.service', () => ({
  raiseNewPatterns: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { createNotification } from '@/modules/notifications';
import {
  raiseNewPatterns,
  type RaisedPattern,
} from '@/modules/attendance/attendance-pattern.service';
import { PATTERN_LINK, patternNotice, runAttendancePatternFlags } from './attendance-pattern.job';

const ABSENCE: RaisedPattern = {
  studentId: 's-1',
  name: 'Ahmad',
  className: '1A',
  kind: 'ABSENCE',
  counts: { recordedDays: 30, absentDays: 4, alpa: 2, sakit: 1, izin: 1, lateDays: 0 },
  recipients: ['u-wali', 'u-musyrif'],
};
const LATE: RaisedPattern = {
  studentId: 's-2',
  name: 'Fatimah',
  className: null,
  kind: 'LATE',
  counts: { recordedDays: 12, absentDays: 0, alpa: 0, sakit: 0, izin: 0, lateDays: 3 },
  recipients: ['u-bk'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({} as never);
});

describe('patternNotice', () => {
  it('says how many days of how many, and of what', () => {
    expect(patternNotice(ABSENCE)).toEqual({
      title: 'Pola kehadiran: Ahmad tidak hadir 13% hari',
      message:
        'Ahmad (1A) tidak hadir 4 dari 30 hari tercatat semester ini (Alpa 2, Sakit 1, Izin 1). ' +
        'Lihat Pola Kehadiran.',
    });
  });

  it('says how often late, in how many days', () => {
    expect(patternNotice(LATE)).toEqual({
      title: 'Pola kehadiran: Fatimah sering terlambat',
      message: 'Fatimah terlambat 3 kali dalam 30 hari terakhir. Lihat Pola Kehadiran.',
    });
  });
});

describe('runAttendancePatternFlags', () => {
  it('tells each person of each new pattern, with the page', async () => {
    vi.mocked(raiseNewPatterns).mockResolvedValue([ABSENCE, LATE]);
    expect(await runAttendancePatternFlags()).toEqual({ raised: 2, told: 3 });
    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-musyrif',
        type: 'ATTENDANCE',
        link: PATTERN_LINK,
        channels: ['IN_APP', 'EMAIL'],
        data: { studentId: 's-1', kind: 'ABSENCE' },
      })
    );
    expect(PATTERN_LINK).toBe('/attendance/patterns');
  });

  it('sends nothing on a day with nothing new', async () => {
    vi.mocked(raiseNewPatterns).mockResolvedValue([]);
    expect(await runAttendancePatternFlags()).toEqual({ raised: 0, told: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('counts only what was sent when one send fails', async () => {
    vi.mocked(raiseNewPatterns).mockResolvedValue([ABSENCE]);
    vi.mocked(createNotification)
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce({} as never);
    expect(await runAttendancePatternFlags()).toEqual({ raised: 1, told: 1 });
  });
});
