import { waveService } from '@/modules/admissions';

/**
 * SPMB wave statuses follow their dates: a wave opens at 00.00 WIB on its
 * first day and closes once its last day has passed. Registration itself reads
 * the dates, so this keeps the status people read honest (`/spmb/periods`, the
 * SPMB hub's "Gelombang Aktif"). Nothing ran it before 2026-10-03, so a wave
 * stayed "Belum dibuka" through its whole window.
 */
export async function runAdmissionWaveStatusUpdate(): Promise<void> {
  await waveService.updateWaveStatuses();
}
