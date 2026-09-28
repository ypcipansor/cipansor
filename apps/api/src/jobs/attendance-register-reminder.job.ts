/**
 * The register reminder (decisions/absensi-harian.md): every 5 minutes in
 * school hours, a class whose register is still not taken 30 minutes after
 * its first lesson reminds the teacher of that lesson and the wali kelas,
 * once, in the app — with a link that opens that class's register.
 */

import { logger } from '@/lib/logger';
import { createNotification } from '@/modules/notifications';
import { registersDue } from '@/modules/attendance/attendance-reminder.service';

export const registerLink = (classId: string) => `/attendance/record?classId=${classId}`;

export async function runAttendanceRegisterReminder(
  now: Date = new Date()
): Promise<{ reminded: number }> {
  const due = await registersDue(now);
  const sends = due.flatMap((r) =>
    r.userIds.map((userId) =>
      createNotification({
        userId,
        type: 'ATTENDANCE',
        title: `Absensi ${r.className} hari ini belum diisi`,
        message:
          `${r.unmarked} dari ${r.enrolled} santri ${r.className} belum ditandai, ` +
          `30 menit sesudah jam pertama (${r.firstLesson}). Isi di Absensi Harian.`,
        channels: ['IN_APP'],
        link: registerLink(r.classId),
        data: { kind: 'REGISTER_REMINDER', classId: r.classId, date: r.day },
      })
    )
  );
  const results = await Promise.allSettled(sends);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) logger.warn('[Scheduler] Register reminders failed', { failed });
  return { reminded: results.length - failed };
}
