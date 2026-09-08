/**
 * Mencoba ulang penerusan pertanyaan yang belum terkirim.
 *
 * INI antrian tahan lama yang dijanjikan, dan bedanya dengan pembatas
 * kesejajaran di `chatbot/throttle.ts` adalah siapa yang menunggu. Pada
 * obrolan, penanya menunggu di layar dan permintaan HTTP-nya mati dalam
 * semenit, jadi antrian panjang di sana menghasilkan orang yang sudah menutup
 * halaman. Di sini tidak ada yang menunggui: pertanyaannya sudah tersimpan dan
 * penanyanya sudah menerima nomor rujukan. Gangguan penyedia surel selama satu
 * jam berarti surat yang terlambat satu jam, bukan pertanyaan yang hilang.
 *
 * Setiap 30 menit, dan `MAX_DELIVERY_ATTEMPTS` = 5, memberi jendela sekitar dua
 * jam sebelum sebuah baris menyerah menjadi FAILED. Baris FAILED tidak dibuang
 * — ia menunggu dibaca manusia, dan `lastError` di sampingnya yang memberi tahu
 * apa yang harus diperbaiki.
 */

import { logger } from '@/lib/logger';
import { deliverPending } from '@/modules/chatbot/escalation.service';

export interface EscalationRetrySummary {
  attempted: number;
  sent: number;
}

/**
 * Melempar bila basis datanya tidak dapat dijangkau.
 *
 * Sama seperti penyapu retensi, dan berbeda dari `recordTurn`: di sini
 * kegagalan berarti pertanyaan orang tidak sampai ke tim, dan itu harus
 * berisik. Kegagalan pengiriman SATU baris tidak melempar — `attemptDelivery`
 * mencatatnya dan berjalan terus, karena satu alamat surel yang cacat tidak
 * boleh menahan antrian di belakangnya.
 */
export async function runChatbotEscalationRetry(): Promise<EscalationRetrySummary> {
  const summary = await deliverPending();

  if (summary.attempted > 0) {
    logger.info('Chatbot escalation retry complete', summary);
  }
  return summary;
}
