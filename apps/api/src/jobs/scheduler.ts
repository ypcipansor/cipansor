import cron, { ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import {
  createDailySnapshots,
  createWeeklySummary,
  cleanupOldSnapshots,
} from './dashboard-snapshot.job';
import { aggregateDashboardMetrics } from './dashboard-metrics.job';
import { runMonthlyAutoBilling } from './finance-billing.job';
import { sendMonthlySppReminders } from './spp-reminder.job';
import { purgeIdentityDocuments } from './identity-purge.job';
import { runChatbotSpendCheck } from './chatbot-spend.job';
import { runChatbotTranscriptPurge } from './chatbot-transcript-purge.job';
import { runChatbotEscalationRetry } from './chatbot-escalation-retry.job';
import { prisma } from '@/lib/prisma';

/**
 * Scheduler Module
 * Manages all cron jobs for the application
 */

// Track scheduled tasks
const scheduledTasks: ScheduledTask[] = [];

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduler(): void {
  logger.info('[Scheduler] Initializing scheduled jobs...');

  // Real-time dashboard metrics - Run every minute
  const metricsTask = cron.schedule(
    '* * * * *',
    async () => {
      logger.debug('[Scheduler] Running dashboard metrics job');
      try {
        await aggregateDashboardMetrics();
      } catch (error) {
        logger.error('[Scheduler] Dashboard metrics job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(metricsTask);
  logger.info('[Scheduler] Dashboard metrics job scheduled (every minute)');

  // Daily metric snapshots - Run at 1:00 AM every day
  // Cron: minute hour day month dayOfWeek
  const dailySnapshotTask = cron.schedule(
    '0 1 * * *',
    async () => {
      logger.info('[Scheduler] Running daily snapshot job');
      try {
        await createDailySnapshots();
      } catch (error) {
        logger.error('[Scheduler] Daily snapshot job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(dailySnapshotTask);
  logger.info('[Scheduler] Daily snapshot job scheduled at 01:00 WIB');

  // Weekly summary - Run at 2:00 AM every Sunday
  const weeklySummaryTask = cron.schedule(
    '0 2 * * 0',
    async () => {
      logger.info('[Scheduler] Running weekly summary job');
      try {
        await createWeeklySummary();
      } catch (error) {
        logger.error('[Scheduler] Weekly summary job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(weeklySummaryTask);
  logger.info('[Scheduler] Weekly summary job scheduled at 02:00 WIB on Sundays');

  // Cleanup - daily at 3:00 AM.
  //
  // Was monthly ('0 3 1 * *'), which contradicted the policy it enforces:
  // cleanupOldSnapshots prunes dashboard_history to the **last 24 hours**, and a
  // table written every minute cannot be held to a 24-hour window by a job that
  // runs once every 30 days. Production showed exactly that — 131,190 rows
  // spanning 16 days where the retention rule allows about 8,600.
  //
  // Daily is the smallest change that makes the two agree. It is safe for the
  // other half of the job: snapshots keep 365 days, and pruning a 365-day window
  // more often simply deletes fewer rows each time.
  //
  // The write rate itself is a separate question, deliberately left alone here:
  // aggregateDashboardMetrics runs every minute and writes 6 rows per run —
  // 8,640 a day, ~3.2M a year — for an institution whose figures move on the
  // timescale of a class period. That is a product decision, not a bug fix.
  const cleanupTask = cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('[Scheduler] Running cleanup job');
      try {
        await cleanupOldSnapshots();
      } catch (error) {
        logger.error('[Scheduler] Cleanup job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(cleanupTask);
  logger.info('[Scheduler] Cleanup job scheduled daily at 03:00 WIB');

  // Auto-Billing - Run at 4:00 AM on the 1st of each month
  const autoBillingTask = cron.schedule(
    '0 4 1 * *',
    async () => {
      logger.info('[Scheduler] Running monthly auto-billing job');
      try {
        await runMonthlyAutoBilling();
      } catch (error) {
        logger.error('[Scheduler] Auto-billing job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(autoBillingTask);
  logger.info('[Scheduler] Auto-billing job scheduled at 04:00 WIB on the 1st of each month');

  // SPP reminder: after auto-billing has generated the month's invoices,
  // remind every parent with an unpaid invoice (in-app + WhatsApp).
  const sppReminderTask = cron.schedule(
    '0 6 1 * *',
    async () => {
      logger.info('[Scheduler] Running monthly SPP reminder job');
      try {
        await sendMonthlySppReminders();
      } catch (error) {
        logger.error('[Scheduler] SPP reminder job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(sppReminderTask);
  logger.info('[Scheduler] SPP reminder job scheduled at 06:00 WIB on the 1st of each month');

  /**
   * Penyapuan foto KTP — tiap hari pukul 02.30 WIB.
   *
   * Di sini, bukan di crontab host, karena berkasnya ada di volume yang
   * terpasang ke kontainer ini dan basis datanya hanya terjangkau dari jaringan
   * Compose. Penjadwal di luar kontainer terikat pada satu mesin dan tidak ikut
   * berpindah bersama image-nya. Alasan selengkapnya ada di berkas jobnya.
   *
   * 02.30 dipilih di celah yang kosong: snapshot harian 01.00, ringkasan
   * mingguan 02.00, cleanup 03.00. Pekerjaannya sendiri ringan — sebuah kueri
   * berindeks dan pembacaan satu direktori — tetapi menaruhnya bertumpuk dengan
   * yang lain hanya menyulitkan pembacaan log ketika ada yang salah.
   *
   * Kegagalan dicatat sebagai error dan tidak menjatuhkan penjadwal; berhasil
   * atau gagal, jalannya meninggalkan baris di `audit_logs` — yang menjawab
   * "kapan terakhir retensi ini benar-benar ditegakkan" setelah log diputar.
   */
  const identityPurgeTask = cron.schedule(
    '30 2 * * *',
    async () => {
      logger.info('[Scheduler] Running identity document purge job');
      try {
        const summary = await purgeIdentityDocuments(prisma);
        logger.info(
          `[Scheduler] Identity purge: ${summary.expired.length} expired, ` +
            `${summary.orphans.length} orphaned, ` +
            `${summary.onDiskCount} on disk, ${summary.referencedCount} referenced`
        );
      } catch (error) {
        logger.error('[Scheduler] Identity document purge job failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(identityPurgeTask);
  logger.info('[Scheduler] Identity document purge job scheduled daily at 02:30 WIB');

  /**
   * Peringatan belanja chatbot — setiap hari pukul 07:00 WIB.
   *
   * Harian, bukan bulanan, meskipun anggarannya bulanan: peringatan yang datang
   * pada tanggal 1 hanya bisa mengabarkan uang yang sudah habis. Pukul 07:00
   * dipilih supaya suratnya berada di kotak masuk sebelum jam kerja, bukan
   * bersama pekerjaan tengah malam yang tidak dibaca siapa pun.
   *
   * Pekerjaan ini menahan diri sendiri: satu tingkat ambang hanya dikirim sekali
   * per bulan, dan bulan tanpa pemakaian tidak mengirim apa pun.
   */
  const chatbotSpendTask = cron.schedule(
    '0 7 * * *',
    async () => {
      logger.debug('[Scheduler] Running chatbot spend check');
      try {
        const result = await runChatbotSpendCheck();
        if (result.sent) {
          logger.warn(`[Scheduler] Chatbot spend alert sent: ${result.sent}`);
        }
      } catch (error) {
        logger.error('[Scheduler] Chatbot spend check failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(chatbotSpendTask);
  logger.info('[Scheduler] Chatbot spend check scheduled daily at 07:00 WIB');

  /**
   * Penyapuan riwayat percakapan asisten publik.
   *
   * Retensi 90 hari adalah separuh alasan mengapa menyimpan kalimat pengunjung
   * dapat dipertanggungjawabkan sama sekali; kalau penyapunya berhenti, janji
   * itu berhenti benar tanpa satu pun gejala yang terlihat. Karena itu ia
   * menulis baris audit setiap kali berjalan, termasuk ketika tidak ada yang
   * dihapus.
   *
   * Pukul 03:15 WIB: sesudah pembersihan snapshot pukul 03:00 dan jauh dari
   * penyapuan KTP pukul 02:30, supaya dua penghapusan besar tidak berebut
   * basis data yang sama.
   */
  const chatbotTranscriptTask = cron.schedule(
    '15 3 * * *',
    async () => {
      logger.debug('[Scheduler] Running chatbot transcript purge');
      try {
        await runChatbotTranscriptPurge();
      } catch (error) {
        logger.error('[Scheduler] Chatbot transcript purge failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(chatbotTranscriptTask);
  logger.info('[Scheduler] Chatbot transcript purge scheduled daily at 03:15 WIB');

  /**
   * Penerusan pertanyaan yang belum terkirim, dicoba lagi tiap 30 menit.
   *
   * Percobaan PERTAMA sudah terjadi di dalam permintaan penanya; yang ini
   * hanya untuk yang gagal. Jadi pada hari yang sehat pekerjaan ini tidak
   * menemukan apa-apa dan tidak menulis satu baris log pun — sengaja, supaya
   * ketika ia MENEMUKAN sesuatu, barisnya berarti.
   *
   * Tiap 30 menit dengan batas 5 percobaan memberi jendela sekitar dua jam,
   * cukup untuk melewati gangguan penyedia surel yang lazim.
   */
  const chatbotEscalationTask = cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        await runChatbotEscalationRetry();
      } catch (error) {
        logger.error('[Scheduler] Chatbot escalation retry failed:', error);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
  scheduledTasks.push(chatbotEscalationTask);
  logger.info('[Scheduler] Chatbot escalation retry scheduled every 30 minutes');

  logger.info(`[Scheduler] ${scheduledTasks.length} jobs scheduled successfully`);
}

/**
 * Stop all scheduled jobs (for graceful shutdown)
 */
export function stopScheduler(): void {
  logger.info('[Scheduler] Stopping all scheduled jobs...');
  scheduledTasks.forEach((task) => task.stop());
  logger.info('[Scheduler] All jobs stopped');
}

/**
 * Run a specific job manually (for testing or manual trigger)
 */
export async function runJob(
  jobName:
    | 'dashboard-metrics'
    | 'daily-snapshot'
    | 'weekly-summary'
    | 'cleanup'
    | 'auto-billing'
    | 'spp-reminder'
    | 'identity-purge'
    | 'chatbot-spend'
    | 'chatbot-transcript-purge'
    | 'chatbot-escalation-retry'
): Promise<void> {
  logger.info(`[Scheduler] Manually running job: ${jobName}`);

  switch (jobName) {
    case 'dashboard-metrics':
      await aggregateDashboardMetrics();
      break;
    case 'daily-snapshot':
      await createDailySnapshots();
      break;
    case 'weekly-summary':
      await createWeeklySummary();
      break;
    case 'cleanup':
      await cleanupOldSnapshots();
      break;
    case 'auto-billing':
      await runMonthlyAutoBilling();
      break;
    case 'spp-reminder':
      await sendMonthlySppReminders();
      break;
    case 'identity-purge':
      await purgeIdentityDocuments(prisma);
      break;
    case 'chatbot-spend':
      await runChatbotSpendCheck();
      break;
    case 'chatbot-transcript-purge':
      await runChatbotTranscriptPurge();
      break;
    case 'chatbot-escalation-retry':
      await runChatbotEscalationRetry();
      break;
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }

  logger.info(`[Scheduler] Job ${jobName} completed`);
}
