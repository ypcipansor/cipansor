import { describe, it, expect, vi } from 'vitest';
import { ChatbotBusyError, createThrottle } from '../throttle';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Tugas yang menggantung sampai diperintahkan selesai. */
function deferred() {
  let settle!: (value: string) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<string>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

const options = { maxConcurrent: 2, maxQueue: 3, maxWaitMs: 1_000 };

describe('createThrottle', () => {
  it('menjalankan tugas sampai batas kesejajarannya, lalu menahan sisanya', async () => {
    const throttle = createThrottle(options);
    const a = deferred();
    const b = deferred();
    const c = deferred();

    void throttle.run(() => a.promise);
    void throttle.run(() => b.promise);
    const third = vi.fn(() => c.promise);
    void throttle.run(third);

    await Promise.resolve();
    expect(throttle.stats()).toEqual({ active: 2, queued: 1 });
    // Yang ketiga belum BOLEH berjalan — bukan sekadar belum selesai.
    expect(third).not.toHaveBeenCalled();

    a.settle('selesai');
    await new Promise((r) => setTimeout(r, 10));
    expect(third).toHaveBeenCalled();
  });

  it('menyerahkan slotnya langsung ke penunggu terlama', async () => {
    // Melepas slot lalu membiarkannya direbut membuka celah tempat permintaan
    // BARU menyalip antrian yang sudah menunggu — antrian yang tidak adil
    // membuat sebagian penanya menunggu tanpa batas saat ramai.
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 5, maxWaitMs: 1_000 });
    const first = deferred();
    const urutan: string[] = [];

    void throttle.run(() => first.promise);
    void throttle.run(async () => void urutan.push('kedua'));
    void throttle.run(async () => void urutan.push('ketiga'));

    await Promise.resolve();
    first.settle('selesai');
    await new Promise((r) => setTimeout(r, 10));

    expect(urutan).toEqual(['kedua', 'ketiga']);
  });

  it('menolak seketika ketika antriannya sudah penuh', async () => {
    // Menolak cepat lebih baik daripada antrian yang tumbuh tanpa batas:
    // permintaan yang menunggu sepuluh menit sudah tidak ada penanyanya.
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 1, maxWaitMs: 1_000 });
    const held = deferred();

    void throttle.run(() => held.promise);
    void throttle.run(() => deferred().promise);
    await Promise.resolve();

    await expect(throttle.run(async () => 'x')).rejects.toBeInstanceOf(ChatbotBusyError);
    held.settle('selesai');
  });

  it('menyerah setelah menunggu terlalu lama, dan tidak menahan slot siapa pun', async () => {
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 5, maxWaitMs: 20 });
    const held = deferred();
    void throttle.run(() => held.promise);
    await Promise.resolve();

    await expect(throttle.run(async () => 'x')).rejects.toBeInstanceOf(ChatbotBusyError);
    expect(throttle.stats().queued).toBe(0);
    held.settle('selesai');
  });

  it('menyebutkan berapa lama sebaiknya menunggu sebelum mencoba lagi', async () => {
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 0, maxWaitMs: 10_000 });
    void throttle.run(() => deferred().promise);
    await Promise.resolve();

    await expect(throttle.run(async () => 'x')).rejects.toMatchObject({ retryAfterSeconds: 10 });
  });

  it('mengembalikan slot meski tugasnya gagal', async () => {
    // Tanpa `finally`, satu galat penyedia menyempitkan kapasitas kita secara
    // permanen sampai prosesnya dimulai ulang — gangguan yang kita buat sendiri
    // dan yang memburuk perlahan.
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 1, maxWaitMs: 1_000 });

    await expect(
      throttle.run(async () => {
        throw new Error('penyedia gagal');
      })
    ).rejects.toThrow('penyedia gagal');

    expect(throttle.stats()).toEqual({ active: 0, queued: 0 });
    await expect(throttle.run(async () => 'giliran berikutnya')).resolves.toBe('giliran berikutnya');
  });
});
