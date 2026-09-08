/**
 * Coba ulang untuk panggilan ke penyedia model.
 *
 * Sebabnya konkret: Azure AI Foundry membatasi permintaan dan token per menit,
 * dan ketika batas itu tersentuh ia menjawab HTTP 429 — bukan galat, melainkan
 * "sebentar". Tanpa lapisan ini satu lonjakan kecil mengubah jawaban yang
 * sebenarnya tinggal menunggu setengah detik menjadi "asisten sedang tidak
 * tersedia" di layar penanya.
 *
 * TIGA KEPUTUSAN YANG MEMBENTUKNYA, dan alasannya, karena coba ulang yang
 * dipasang tanpa berpikir adalah cara memperparah gangguan:
 *
 * 1. **Hanya galat sementara yang diulang.** 400 berarti permintaan kita cacat
 *    dan 401 berarti kuncinya salah; keduanya tidak akan sembuh dengan
 *    menunggu, dan mengulanginya hanya menghabiskan kuota yang tersisa. Yang
 *    diulang: 408, 425, 429, dan 5xx.
 *
 * 2. **Habis-waktu TIDAK diulang.** Ini pilihan, bukan kelalaian. Panggilan
 *    yang sampai batas 60 detik sudah memakai seluruh kesabaran penanya;
 *    mengulanginya berarti meminta ia menunggu dua menit untuk panggilan yang
 *    memang sudah terlalu lambat. Lebih jujur menjawab cepat bahwa kita gagal.
 *
 * 3. **`Retry-After` dari server dipatuhi, bukan ditebak.** Server tahu kapan
 *    kuotanya pulih; backoff kita hanya tebakan. Dan bila waktu tunggu yang ia
 *    minta melebihi sisa anggaran, kita berhenti saat itu juga alih-alih tidur
 *    lalu gagal — itu juga yang menggantikan sebuah pemutus arus: pada kuota
 *    yang benar-benar habis, kegagalannya jadi cepat dengan sendirinya.
 *
 * Jeda memakai FULL JITTER (`acak() × jeda`), bukan jeda tetap. Beberapa
 * permintaan yang ditolak pada detik yang sama akan bangun pada detik yang sama
 * pula bila jedanya pasti, dan menabrak batas yang sama untuk kedua kalinya.
 */

/** Status yang berarti "coba lagi nanti", bukan "permintaanmu salah". */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Galat yang boleh diulang. Apa pun selain ini naik apa adanya dan langsung
 * mengakhiri percobaan — itulah yang membuat 400 dan 401 tidak pernah diulang
 * tanpa perlu daftar larangan terpisah.
 */
export class TransientUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'TransientUpstreamError';
  }
}

/**
 * Membaca header `Retry-After`, yang sah dalam dua bentuk: jumlah detik, atau
 * tanggal HTTP. Keduanya dipakai di alam liar, jadi keduanya dibaca.
 *
 * Nilai negatif (tanggal yang sudah lewat) menjadi 0, bukan undefined: server
 * sudah menyatakan boleh mencoba lagi, jadi jangan menebak jeda sendiri.
 */
export function parseRetryAfter(header: string | null | undefined, nowMs: number): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);

  return undefined;
}

export interface RetryOptions {
  /** Termasuk percobaan pertama. 1 berarti tidak ada pengulangan sama sekali. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Batas waktu keseluruhan, meliputi semua percobaan dan semua jedanya. */
  budgetMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; status?: number }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Jeda sebelum percobaan berikutnya.
 *
 * `Retry-After` menang bila ada — server tahu lebih baik daripada tebakan kita
 * — dengan sedikit jitter ditambahkan agar dua permintaan yang menerima angka
 * yang sama tidak bangun bersamaan. Bila tidak ada, backoff eksponensial dengan
 * full jitter, dibatasi `maxDelayMs`.
 */
export function nextDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterMs?: number;
  random: () => number;
}): number {
  const { attempt, baseDelayMs, maxDelayMs, retryAfterMs, random } = input;

  if (retryAfterMs !== undefined) {
    // TIDAK dipotong oleh `maxDelayMs`, dan ini disengaja. Server yang meminta
    // menunggu 30 detik lalu kita datangi lagi setelah 1 detik adalah persis
    // perilaku yang mengubah gangguan menjadi gangguan yang lebih parah.
    // Langit-langit itu milik TEBAKAN kita sendiri di bawah; permintaan server
    // dihormati apa adanya, dan bila kita tidak sanggup menunggunya, anggaran
    // waktulah yang menyuruh berhenti — bukan pemendekan diam-diam.
    return retryAfterMs + random() * 250;
  }

  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return random() * ceiling;
}

/**
 * Menjalankan `run` sampai berhasil, sampai kehabisan percobaan, atau sampai
 * anggaran waktunya habis.
 *
 * `signal` yang diteruskan ke `run` dibatalkan ketika anggaran habis, sehingga
 * sebuah percobaan yang sedang berjalan tidak bisa melampaui anggaran itu
 * hanya karena ia sudah terlanjur dimulai.
 */
export async function withRetry<T>(
  run: (attempt: number, signal: AbortSignal) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    budgetMs,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
    onRetry,
  } = options;

  const startedAt = now();
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), budgetMs);

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run(attempt, budget.signal);
      } catch (error) {
        if (!(error instanceof TransientUpstreamError) || attempt >= maxAttempts) throw error;

        const delayMs = nextDelayMs({
          attempt,
          baseDelayMs,
          maxDelayMs,
          retryAfterMs: error.retryAfterMs,
          random,
        });

        // Tidur lalu gagal adalah hasil yang paling buruk: penanya menunggu
        // lebih lama untuk kabar yang sama. Bila jedanya sendiri sudah
        // melewati anggaran, menyerah sekarang.
        if (now() - startedAt + delayMs >= budgetMs) throw error;

        onRetry?.({ attempt, delayMs, status: error.status });
        await sleep(delayMs);
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }
}
