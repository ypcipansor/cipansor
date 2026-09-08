/**
 * Menghapus riwayat percakapan asisten publik yang sudah lewat masa simpannya.
 *
 * Retensi 90 hari bukan angka yang dipilih untuk kerapian. Ia adalah setengah
 * dari alasan mengapa menyimpan kalimat pengunjung sama sekali dapat
 * dipertanggungjawabkan — separuh lainnya adalah kunci SUPER_ADMIN di rutenya.
 * Karena itu penyapunya bukan pekerjaan rumah tangga: kalau ia berhenti
 * berjalan, janji yang dinyatakan kepada pengunjung berhenti benar, dan tidak
 * ada satu pun gejala yang akan terlihat.
 *
 * Maka ia menulis baris `audit_logs` **setiap kali berjalan**, termasuk ketika
 * tidak ada yang dihapus. Baris "0 dihapus" itulah yang membedakan "tidak ada
 * yang kedaluwarsa" dari "penyapunya mati tiga bulan lalu" — perbedaan yang
 * mustahil dilihat dari tabel yang sama-sama kosong. Lihat
 * [[cipansor-deploy-runbook]] soal mengapa penjadwalnya di dalam proses, bukan
 * di crontab host.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  TRANSCRIPT_RETENTION_DAYS,
  purgeConversationsBefore,
  retentionCutoff,
} from '@/modules/chatbot/transcript.service';
import {
  purgeEscalationsBefore,
  retentionCutoff as escalationCutoff,
} from '@/modules/chatbot/escalation.service';

export const TRANSCRIPT_PURGE_AUDIT_ACTION = 'PURGE_CHATBOT_TRANSCRIPTS';
export const TRANSCRIPT_PURGE_AUDIT_ENTITY = 'ChatbotConversation';

export interface TranscriptPurgeSummary {
  cutoff: string;
  retentionDays: number;
  conversations: number;
  messages: number;
  /**
   * Penerusan pertanyaan ke tim, disapu oleh pekerjaan yang SAMA.
   *
   * Janjinya identik — 90 hari, ditegakkan oleh penyapu yang menulis jejaknya
   * bahkan ketika tidak menghapus apa pun — jadi memberinya pekerjaan sendiri
   * hanya akan menciptakan penyapu kedua yang bisa mati diam-diam sendirian.
   */
  escalations: number;
}

/**
 * Jalankan penyapuan sekali.
 *
 * Melempar bila basis datanya tidak dapat dijangkau — berbeda dari `recordTurn`
 * yang menelan galatnya. Alasannya berlawanan: di sana kegagalan tidak boleh
 * merusak jawaban yang sudah diterima pengunjung; di sini kegagalan berarti
 * data pribadi tetap tersimpan melewati batas yang dijanjikan, dan itu harus
 * berisik.
 */
export async function runChatbotTranscriptPurge(
  now: Date = new Date()
): Promise<TranscriptPurgeSummary> {
  const cutoff = retentionCutoff(now);
  const deleted = await purgeConversationsBefore(cutoff);
  const escalations = await purgeEscalationsBefore(escalationCutoff(now));

  const summary: TranscriptPurgeSummary = {
    cutoff: cutoff.toISOString(),
    retentionDays: TRANSCRIPT_RETENTION_DAYS,
    conversations: deleted.conversations,
    messages: deleted.messages,
    escalations,
  };

  await recordRun(summary);

  logger.info('Chatbot transcript purge complete', summary);
  return summary;
}

/**
 * Jejaknya ditulis walau tidak ada yang dihapus.
 *
 * Ditelan bila gagal: pemanggilnya sudah memegang ringkasannya, dan penyapuan
 * yang berhasil tidak boleh dilaporkan gagal hanya karena catatannya tidak
 * tertulis.
 */
async function recordRun(summary: TranscriptPurgeSummary) {
  try {
    await prisma.auditLog.create({
      data: {
        action: TRANSCRIPT_PURGE_AUDIT_ACTION,
        entity: TRANSCRIPT_PURGE_AUDIT_ENTITY,
        newValues: {
          cutoff: summary.cutoff,
          retentionDays: summary.retentionDays,
          conversations: summary.conversations,
          messages: summary.messages,
          escalations: summary.escalations,
        },
      },
    });
  } catch (error) {
    logger.warn('Chatbot transcript purge audit row failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
