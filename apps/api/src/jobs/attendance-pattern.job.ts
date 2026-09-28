/**
 * The attendance pattern flag (decided 2026-09-28, decisions/absensi-harian.md).
 *
 * At 16:00 WIB, once the day's registers are in, every santri whose attendance
 * shows a pattern not yet raised this semester — absent on at least 10% of the
 * days recorded, or late three times in 30 days — is raised, and their wali
 * kelas, their unit's guru BK and a santri mukim's musyrif are told once, with
 * a link to Pola Kehadiran.
 */

import { AttendancePatternKind } from '@prisma/client';
import { ATTENDANCE_PATTERN_LATE_WINDOW_DAYS } from '@cipansor/shared';
import { logger } from '@/lib/logger';
import { createNotification } from '@/modules/notifications';
import {
  raiseNewPatterns,
  type RaisedPattern,
} from '@/modules/attendance/attendance-pattern.service';

export const PATTERN_LINK = '/attendance/patterns';

/** The notice for one raised pattern, in words the wali kelas reads. */
export function patternNotice(p: RaisedPattern): { title: string; message: string } {
  const who = p.className ? `${p.name} (${p.className})` : p.name;
  if (p.kind === AttendancePatternKind.LATE) {
    return {
      title: `Pola kehadiran: ${p.name} sering terlambat`,
      message:
        `${who} terlambat ${p.counts.lateDays} kali dalam ${ATTENDANCE_PATTERN_LATE_WINDOW_DAYS} hari terakhir. ` +
        'Lihat Pola Kehadiran.',
    };
  }
  const c = p.counts;
  const percent = Math.round((c.absentDays / c.recordedDays) * 100);
  return {
    title: `Pola kehadiran: ${p.name} tidak hadir ${percent}% hari`,
    message:
      `${who} tidak hadir ${c.absentDays} dari ${c.recordedDays} hari tercatat semester ini ` +
      `(Alpa ${c.alpa}, Sakit ${c.sakit}, Izin ${c.izin}). Lihat Pola Kehadiran.`,
  };
}

export async function runAttendancePatternFlags(
  now = new Date()
): Promise<{ raised: number; told: number }> {
  const raised = await raiseNewPatterns(now);
  const sends = raised.flatMap((p) => {
    const { title, message } = patternNotice(p);
    return p.recipients.map((userId) =>
      createNotification({
        userId,
        type: 'ATTENDANCE',
        title,
        message,
        channels: ['IN_APP', 'EMAIL'],
        link: PATTERN_LINK,
        data: { studentId: p.studentId, kind: p.kind },
      })
    );
  });
  const results = await Promise.allSettled(sends);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) logger.warn('[Scheduler] Attendance pattern notices failed', { failed });
  return { raised: raised.length, told: results.length - failed };
}
