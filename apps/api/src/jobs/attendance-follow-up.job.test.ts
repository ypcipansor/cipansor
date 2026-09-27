import { describe, it, expect, vi, beforeEach } from 'vitest';

// The 15:00 WIB reminder: once per person who still has an open Alpa today,
// with the count and a link to Tindak Lanjut Absensi; nothing on a day
// without one; a failed send does not stop the others.

vi.mock('@/modules/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/modules/attendance/attendance-follow-up.service', () => ({
  openAbsencesByOwner: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { createNotification } from '@/modules/notifications';
import { openAbsencesByOwner } from '@/modules/attendance/attendance-follow-up.service';
import { FOLLOW_UP_LINK, runAttendanceFollowUpReminder } from './attendance-follow-up.job';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({} as never);
});

describe('runAttendanceFollowUpReminder', () => {
  it('reminds each owner once, with their count and the page', async () => {
    vi.mocked(openAbsencesByOwner).mockResolvedValue(
      new Map([
        ['u-wali-1a', 2],
        ['u-musyrif', 1],
      ])
    );
    expect(await runAttendanceFollowUpReminder()).toEqual({ reminded: 2 });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-wali-1a',
        type: 'ATTENDANCE',
        title: '2 Alpa hari ini belum ada keterangan',
        link: FOLLOW_UP_LINK,
        channels: ['IN_APP', 'EMAIL'],
      })
    );
    expect(FOLLOW_UP_LINK).toBe('/attendance/follow-ups');
  });

  it('sends nothing on a day with no open Alpa', async () => {
    vi.mocked(openAbsencesByOwner).mockResolvedValue(new Map());
    expect(await runAttendanceFollowUpReminder()).toEqual({ reminded: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('counts only what was sent when one send fails', async () => {
    vi.mocked(openAbsencesByOwner).mockResolvedValue(
      new Map([
        ['a', 1],
        ['b', 1],
      ])
    );
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('smtp down'));
    expect(await runAttendanceFollowUpReminder()).toEqual({ reminded: 1 });
  });
});
