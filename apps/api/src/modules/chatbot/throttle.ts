/**
 * Pembatas kesejajaran dengan antrian pendek, di depan penyedia model.
 *
 * Coba ulang menolong satu permintaan yang kebetulan menabrak batas. Yang
 * dikerjakan berkas ini adalah mencegah kita SENDIRI menjadi penyebab batas itu
 * tersentuh: sepuluh orang bertanya pada detik yang sama, sepuluh panggilan
 * berangkat serentak, kuota per menit habis, dan sekarang kesepuluhnya
 * mengulang — persis lonjakan yang seharusnya diredam.
 *
 * KENAPA ANTRIANNYA PENDEK, dan ini yang membedakannya dari antrian pekerjaan
 * latar: penanya sedang menunggu di layar, dan permintaan HTTP-nya sendiri mati
 * di sekitar satu menit. Antrian yang menahan pertanyaan sampai kuota pulih
 * akan menghasilkan penanya yang sudah menutup halaman. Jadi menunggu dibatasi
 * beberapa detik, dan sesudahnya kita menjawab dengan jujur bahwa asisten
 * sedang sibuk — jawaban cepat yang jelas lebih baik daripada penantian panjang
 * yang berakhir sama.
 *
 * Antrian yang benar-benar tahan lama tetap tepat untuk pekerjaan yang penanya
 * tidak menunggui hasilnya, misalnya penerusan pertanyaan lewat surel. Bukan
 * untuk yang ini.
 */

import { logger } from '@/lib/logger';

/**
 * Asisten sedang sibuk — berbeda dari `ChatbotUnavailableError`, yang berarti
 * ia mati atau salah konfigurasi. Perbedaannya penting bagi penanya: yang satu
 * layak dicoba lagi sebentar lagi, yang lain tidak.
 */
export class ChatbotBusyError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    message = 'Chatbot is at capacity'
  ) {
    super(message);
    this.name = 'ChatbotBusyError';
  }
}

export interface ThrottleOptions {
  /** Panggilan yang boleh berjalan bersamaan ke penyedia. */
  maxConcurrent: number;
  /** Berapa banyak yang boleh menunggu giliran sebelum ditolak seketika. */
  maxQueue: number;
  /** Berapa lama satu permintaan boleh menunggu giliran. */
  maxWaitMs: number;
}

export interface Throttle {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): { active: number; queued: number };
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const maxConcurrent = Math.max(1, options.maxConcurrent);
  const { maxQueue, maxWaitMs } = options;
  const retryAfterSeconds = Math.max(1, Math.ceil(maxWaitMs / 1000));

  let active = 0;
  const waiters: Waiter[] = [];

  function release(): void {
    // Slotnya DISERAHKAN langsung ke penunggu berikutnya, bukan dilepas lalu
    // direbut kembali: melepas dulu membuka celah tempat permintaan baru
    // menyalip antrian yang sudah menunggu.
    const next = waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
      return;
    }
    active--;
  }

  async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active++;
      return;
    }

    if (waiters.length >= maxQueue) {
      logger.warn('Chatbot throttle rejected a request: queue full', {
        active,
        queued: waiters.length,
      });
      throw new ChatbotBusyError(retryAfterSeconds);
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          logger.warn('Chatbot throttle rejected a request: waited too long', {
            waitedMs: maxWaitMs,
          });
          reject(new ChatbotBusyError(retryAfterSeconds));
        }, maxWaitMs),
      };
      waiters.push(waiter);
    });
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        // Di `finally`, bukan sesudah `await task()`: sebuah tugas yang gagal
        // wajib mengembalikan slotnya, atau satu galat penyedia akan menyempitkan
        // kapasitas kita secara permanen sampai proses dimulai ulang.
        release();
      }
    },
    stats: () => ({ active, queued: waiters.length }),
  };
}
