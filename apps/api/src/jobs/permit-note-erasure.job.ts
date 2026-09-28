/**
 * Doctor's notes erased at the end of their academic year (decided
 * 2026-09-28, decisions/pemutus-izin-santri.md).
 *
 * Daily at 01:15 WIB — before the nightly backup, so a note past its day does
 * not enter one more copy. The file goes; that it was attached, its SHA-256
 * and who saw it first stay on the permit.
 */

import { logger } from '@/lib/logger';
import { erasePermitNotes } from '@/modules/permits/permit-doctor-note.service';

export async function runPermitNoteErasure(now = new Date()): Promise<{ erased: number }> {
  const erased = await erasePermitNotes(now);
  if (erased)
    logger.info(`[PermitNotes] Erased ${erased} doctor's note(s) past their academic year`);
  return { erased };
}
