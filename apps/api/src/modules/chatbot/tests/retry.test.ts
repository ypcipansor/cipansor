import { describe, it, expect, vi } from 'vitest';
import {
  isRetryableStatus,
  nextDelayMs,
  parseRetryAfter,
  TransientUpstreamError,
  withRetry,
} from '../retry';

/** Tidur palsu: mencatat berapa lama diminta menunggu, tanpa benar-benar menunggu. */
function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe('isRetryableStatus', () => {
  it('mengulang status yang berarti "sebentar"', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status), String(status)).toBe(true);
    }
  });

  it('tidak pernah mengulang permintaan yang cacat atau kunci yang salah', () => {
    // Ini bukan sekadar sia-sia. 429 datang karena kuota, dan mengulangi 401
    // pada saat kuota sedang ketat menghabiskan jatah yang tersisa untuk
    // permintaan yang tidak akan pernah berhasil.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status), String(status)).toBe(false);
    }
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-09-04T10:00:00Z');

  it('membaca bentuk detik', () => {
    expect(parseRetryAfter('30', now)).toBe(30_000);
  });

  it('membaca bentuk tanggal HTTP', () => {
    expect(parseRetryAfter('Fri, 04 Sep 2026 10:00:45 GMT', now)).toBe(45_000);
  });

  it('memperlakukan tanggal yang sudah lewat sebagai boleh langsung dicoba', () => {
    // Bukan undefined: server sudah menyatakan kapan boleh mencoba lagi, jadi
    // jangan kembali menebak dengan backoff sendiri.
    expect(parseRetryAfter('Fri, 04 Sep 2026 09:59:00 GMT', now)).toBe(0);
  });

  it('mengabaikan header yang tidak masuk akal, dan tidak mengarang angka', () => {
    expect(parseRetryAfter('segera', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter('', now)).toBeUndefined();
  });
});

describe('nextDelayMs', () => {
  it('mematuhi Retry-After ketika server menyebutkannya', () => {
    const delay = nextDelayMs({
      attempt: 1,
      baseDelayMs: 500,
      maxDelayMs: 60_000,
      retryAfterMs: 2_000,
      random: () => 0,
    });
    expect(delay).toBe(2_000);
  });

  it('tidak memendekkan Retry-After yang panjang', () => {
    // Ditemukan oleh uji di bawahnya, dan ini cacat yang sungguhan: memotong
    // permintaan "tunggu 30 detik" menjadi 1 detik membuat kita mendatangi lagi
    // penyedia yang baru saja menyuruh mundur. Langit-langit itu milik tebakan
    // kita sendiri; permintaan server dihormati apa adanya, dan anggaran
    // waktulah yang memutuskan apakah kita sanggup menunggunya.
    const delay = nextDelayMs({
      attempt: 1,
      baseDelayMs: 500,
      maxDelayMs: 8_000,
      retryAfterMs: 600_000,
      random: () => 0,
    });
    expect(delay).toBe(600_000);
  });

  it('memakai FULL jitter, bukan jeda pasti', () => {
    // Jeda pasti membuat semua permintaan yang ditolak pada detik yang sama
    // bangun pada detik yang sama pula, dan menabrak batas yang sama untuk
    // kedua kalinya. Dengan full jitter, `random()` nol berarti jeda nol.
    const args = { attempt: 3, baseDelayMs: 500, maxDelayMs: 8_000 };
    expect(nextDelayMs({ ...args, random: () => 0 })).toBe(0);
    expect(nextDelayMs({ ...args, random: () => 1 })).toBe(2_000);
  });

  it('naik secara eksponensial sampai langit-langitnya', () => {
    const args = { baseDelayMs: 500, maxDelayMs: 1_500, random: () => 1 };
    expect(nextDelayMs({ ...args, attempt: 1 })).toBe(500);
    expect(nextDelayMs({ ...args, attempt: 2 })).toBe(1_000);
    expect(nextDelayMs({ ...args, attempt: 3 })).toBe(1_500);
    expect(nextDelayMs({ ...args, attempt: 9 })).toBe(1_500);
  });
});

describe('withRetry', () => {
  const base = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000, budgetMs: 60_000 };

  it('mengembalikan hasil percobaan pertama tanpa menunggu apa pun', async () => {
    const { waits, sleep } = recordingSleep();
    const run = vi.fn(async () => 'ok');

    await expect(withRetry(run, { ...base, sleep })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('mengulang galat sementara lalu berhasil', async () => {
    const { sleep } = recordingSleep();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new TransientUpstreamError('429', 429))
      .mockRejectedValueOnce(new TransientUpstreamError('429', 429))
      .mockResolvedValueOnce('akhirnya');

    await expect(withRetry(run, { ...base, sleep, random: () => 1 })).resolves.toBe('akhirnya');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('TIDAK mengulang galat biasa, sekali pun', async () => {
    // Inilah yang membuat 400 dan 401 aman tanpa daftar larangan terpisah:
    // hanya `TransientUpstreamError` yang berhak diulang.
    const { sleep } = recordingSleep();
    const run = vi.fn().mockRejectedValue(new Error('400 permintaan cacat'));

    await expect(withRetry(run, { ...base, sleep })).rejects.toThrow('400 permintaan cacat');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('berhenti pada batas jumlah percobaan', async () => {
    const { sleep } = recordingSleep();
    const run = vi.fn().mockRejectedValue(new TransientUpstreamError('429', 429));

    await expect(withRetry(run, { ...base, sleep })).rejects.toThrow('429');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('menyerah alih-alih tidur melewati anggarannya', async () => {
    // Tidur lalu gagal adalah hasil terburuk: penanya menunggu lebih lama untuk
    // kabar yang sama. Retry-After 30 detik pada sisa anggaran 5 detik berarti
    // kuotanya tidak akan pulih tepat waktu — katakan sekarang.
    const { waits, sleep } = recordingSleep();
    const run = vi.fn().mockRejectedValue(new TransientUpstreamError('429', 429, 30_000));

    await expect(
      withRetry(run, { ...base, budgetMs: 5_000, sleep, random: () => 0 })
    ).rejects.toThrow('429');

    expect(run).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('memberi tahu pemanggil setiap kali ia mengulang', async () => {
    const { sleep } = recordingSleep();
    const onRetry = vi.fn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new TransientUpstreamError('503', 503))
      .mockResolvedValueOnce('ok');

    await withRetry(run, { ...base, sleep, random: () => 1, onRetry });

    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, delayMs: 100, status: 503 });
  });

  it('membatalkan percobaan yang sedang berjalan ketika anggarannya habis', async () => {
    // Tanpa ini, sebuah percobaan yang sudah terlanjur dimulai bisa berjalan
    // jauh melewati anggaran hanya karena ia dimulai sebelum waktunya habis.
    let seen: AbortSignal | undefined;
    const run = vi.fn(async (_attempt: number, signal: AbortSignal) => {
      seen = signal;
      return new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => resolve('dibatalkan'));
      });
    });

    await expect(withRetry(run, { ...base, budgetMs: 20 })).resolves.toBe('dibatalkan');
    expect(seen?.aborted).toBe(true);
  });
});
