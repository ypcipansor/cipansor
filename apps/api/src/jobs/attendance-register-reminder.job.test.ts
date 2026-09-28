import { describe, it, expect, vi, beforeEach } from 'vitest';

// The register reminder job: one in-app reminder per person to remind, with
// the count and a link that opens that class's register.

vi.mock('@/modules/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/modules/attendance/attendance-reminder.service', () => ({ registersDue: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { createNotification } from '@/modules/notifications';
import { registersDue } from '@/modules/attendance/attendance-reminder.service';
import { registerLink, runAttendanceRegisterReminder } from './attendance-register-reminder.job';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({} as never);
});

describe('runAttendanceRegisterReminder', () => {
  it("reminds each person once, with the count and the class's register", async () => {
    vi.mocked(registersDue).mockResolvedValue([
      {
        classId: 'class-1a',
        className: '1A',
        day: '2026-09-28',
        firstLesson: '07:30',
        enrolled: 28,
        unmarked: 25,
        userIds: ['u-guru', 'u-wali'],
      },
    ]);
    expect(await runAttendanceRegisterReminder()).toEqual({ reminded: 2 });
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'u-guru',
      type: 'ATTENDANCE',
      title: 'Absensi 1A hari ini belum diisi',
      message:
        '25 dari 28 santri 1A belum ditandai, 30 menit sesudah jam pertama (07:30). ' +
        'Isi di Absensi Harian.',
      channels: ['IN_APP'],
      link: '/attendance/record?classId=class-1a',
      data: { kind: 'REGISTER_REMINDER', classId: 'class-1a', date: '2026-09-28' },
    });
    expect(registerLink('x')).toBe('/attendance/record?classId=x');
  });

  it('sends nothing when no register is due', async () => {
    vi.mocked(registersDue).mockResolvedValue([]);
    expect(await runAttendanceRegisterReminder()).toEqual({ reminded: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('counts only what was sent when one send fails', async () => {
    vi.mocked(registersDue).mockResolvedValue([
      {
        classId: 'c',
        className: '7A',
        day: '2026-09-28',
        firstLesson: '07:00',
        enrolled: 2,
        unmarked: 2,
        userIds: ['a', 'b'],
      },
    ]);
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('db down'));
    expect(await runAttendanceRegisterReminder()).toEqual({ reminded: 1 });
  });
});
