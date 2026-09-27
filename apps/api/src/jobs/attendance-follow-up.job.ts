/**
 * The afternoon reminder of the attendance follow-up
 * (decisions/absensi-harian.md, tier 2).
 *
 * At 15:00 WIB, whoever follows up today's Alpa marks that still have no
 * explanation — the wali kelas of a day pupil, the musyrif of a santri mukim —
 * is reminded once, with the count and a link to Tindak Lanjut Absensi. A day
 * with no open Alpa sends nothing, so a holiday or a weekend is silent.
 */

import { logger } from '@/lib/logger';
import { createNotification } from '@/modules/notifications';
import { openAbsencesByOwner } from '@/modules/attendance/attendance-follow-up.service';

export const FOLLOW_UP_LINK = '/attendance/follow-ups';

export async function runAttendanceFollowUpReminder(): Promise<{ reminded: number }> {
  const owners = await openAbsencesByOwner();
  const sends = [...owners].map(([userId, count]) =>
    createNotification({
      userId,
      type: 'ATTENDANCE',
      title: `${count} Alpa hari ini belum ada keterangan`,
      message:
        `${count} santri yang Anda tindak lanjuti tercatat Alpa hari ini tanpa keterangan. ` +
        'Hubungi walinya dan catat hasilnya di Tindak Lanjut Absensi.',
      channels: ['IN_APP', 'EMAIL'],
      link: FOLLOW_UP_LINK,
      data: { open: count },
    })
  );
  const results = await Promise.allSettled(sends);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) logger.warn('[Scheduler] Attendance follow-up reminders failed', { failed });
  return { reminded: results.length - failed };
}
