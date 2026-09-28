/**
 * The accreditation reminder (decided 2026-09-28, decisions/akreditasi-unit.md).
 *
 * Daily at 07:00 WIB: a unit whose certificate in force runs out within
 * `ACCREDITATION_REMINDER_MONTHS`, and has no newer one on record, has its
 * kepala sekolah and admin told once, with a link to the unit's page. A unit
 * with nobody to tell is tried again the next day.
 */

import { logger } from '@/lib/logger';
import { createNotification } from '@/modules/notifications';
import { accreditationsToRemind, markReminded } from '@/modules/units/unit-accreditation.service';

const longDate = (day: string) =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export async function runAccreditationReminder(
  now = new Date()
): Promise<{ units: number; told: number }> {
  const due = await accreditationsToRemind(now);
  let told = 0;
  const reminded: string[] = [];
  for (const a of due) {
    const results = await Promise.allSettled(
      a.recipients.map((userId) =>
        createNotification({
          userId,
          type: 'REMINDER',
          title: `Akreditasi ${a.unitName} berakhir ${longDate(a.validUntil)}`,
          message:
            `Sertifikat akreditasi ${a.rating} (${a.certificateNumber}) berlaku sampai ` +
            `${longDate(a.validUntil)}. Siapkan akreditasi ulang, lalu catat sertifikat ` +
            'barunya di halaman unit.',
          channels: ['IN_APP', 'EMAIL'],
          link: `/units/${a.unitId}`,
          data: { unitId: a.unitId, accreditationId: a.id },
        })
      )
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    told += sent;
    if (sent) reminded.push(a.id);
    else logger.warn('[Scheduler] Accreditation reminder reached nobody', { unitId: a.unitId });
  }
  await markReminded(reminded, now);
  return { units: reminded.length, told };
}
