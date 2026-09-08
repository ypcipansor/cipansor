import { config } from '@/config';
import { logger } from '@/lib/logger';

/**
 * Cloudflare Turnstile — memeriksa token "bukan bot" yang dikirim peramban.
 *
 * Turnstile bekerja dua sisi. Peramban menyelesaikan tantangannya dan menerima
 * sebuah token sekali pakai; peladen menukarkan token itu ke Cloudflare untuk
 * mendapat jawaban ya/tidak. Yang kedua tidak boleh dilewati: token adalah
 * masukan pengguna seperti masukan lainnya, dan sebuah widget yang tampak
 * hijau di layar tidak membuktikan apa pun tentang permintaan yang tiba di
 * sini.
 *
 * **Perlindungan replay datang dari Cloudflare, bukan dari kita.** Sebuah
 * token yang sudah ditukarkan akan ditolak pada penukaran kedua dengan
 * `timeout-or-duplicate`. Itulah sebabnya modul ini tidak menyimpan token yang
 * pernah dilihatnya — daftar seperti itu akan menjadi salinan kedua dari
 * kebenaran yang sudah dipegang pihak lain, dan salinan kedua selalu bisa
 * melenceng.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Hasil pemeriksaan, dengan alasannya.
 *
 * Alasannya ikut dibawa karena "lolos" punya tiga arti yang sangat berbeda dan
 * pemanggil berhak membedakannya di log: benar-benar terverifikasi, gerbangnya
 * memang dimatikan, atau Cloudflare tidak dapat dihubungi. Sebuah boolean
 * telanjang akan menyamarkan yang ketiga menjadi yang pertama, dan pemadaman
 * di sisi Cloudflare akan terlihat persis seperti hari yang tenang.
 */
export type TurnstileOutcome =
  | { ok: true; reason: 'verified' | 'disabled' | 'unreachable' }
  | {
      ok: false;
      reason: 'missing-token' | 'rejected' | 'action-mismatch' | 'hostname-not-allowed';
      codes: string[];
    };

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
  /** Nilai `action` yang dipasang widget saat tantangannya diterbitkan. */
  action?: string;
  /** Hostname halaman tempat tantangannya benar-benar diselesaikan. */
  hostname?: string;
}

/**
 * Batas panjang token, dari dokumentasi Cloudflare.
 *
 * Diperiksa sebelum memanggil siteverify: sebuah badan permintaan berisi
 * megabyte sampah tidak perlu diubah menjadi panggilan keluar. Ini penjaga
 * biaya dan bising, bukan penjaga keamanan — yang menentukan tetap jawaban
 * Cloudflare.
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * Tukarkan token ke Cloudflare.
 *
 * **Gagal-terbuka ketika Cloudflare tidak terjangkau, dan itu keputusan sadar.**
 * Gerbang ini duduk di depan halaman masuk portal. Bila siteverify sedang
 * padam dan kita gagal-tertutup, tidak seorang pun — termasuk pengurus yang
 * sedang menangani keadaan darurat — dapat masuk ke sistemnya sendiri, dan
 * sebabnya ada di infrastruktur pihak ketiga yang tidak dapat kita perbaiki.
 * Yang tersisa ketika gerbang ini menyerah bukanlah ketiadaan pertahanan:
 * `authLimiter`, `chatbotLimiter`, dan `publicVerifyLimiter` tetap berdiri,
 * dan semuanya sekarang membaca IP asli pengunjung karena nginx menuliskannya
 * dari rentang Cloudflare.
 *
 * Yang TIDAK gagal-terbuka adalah penolakan yang tegas. Bila Cloudflare
 * menjawab dan jawabannya "tidak", permintaannya berhenti di sini.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
  expectedAction?: string
): Promise<TurnstileOutcome> {
  if (!config.turnstile.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  if (!token) {
    return { ok: false, reason: 'missing-token', codes: ['missing-input-response'] };
  }

  if (token.length > MAX_TOKEN_LENGTH) {
    logger.warn('[Turnstile] token melebihi batas panjang, tidak ditukarkan', {
      length: token.length,
    });
    return { ok: false, reason: 'rejected', codes: ['invalid-input-response'] };
  }

  const body = new URLSearchParams();
  body.set('secret', config.turnstile.secretKey as string);
  body.set('response', token);
  // Dikirim bila ada. Cloudflare memakainya untuk memastikan token ditukarkan
  // dari jaringan yang sama dengan yang menyelesaikan tantangannya — jadi
  // sebuah token yang dicuri dari layar orang lain tidak langsung berguna.
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(config.turnstile.timeoutMs),
    });

    /**
     * Badan jawabannya dibaca LEBIH DULU, bahkan ketika statusnya bukan 2xx.
     *
     * Diukur terhadap Cloudflare pada 2026-09-03: kunci rahasia yang salah
     * dijawab **HTTP 400**, bukan 200, dengan
     * `{"error-codes":["invalid-input-secret"],"success":false}`. Versi
     * pertama modul ini memeriksa `response.ok` sebelum menyentuh badannya,
     * sehingga cabang di bawah tidak pernah tercapai: keputusannya tetap
     * benar — gerbangnya terbuka — tetapi log-nya berbunyi "status tidak
     * wajar" alih-alih menyebut nama variabel yang harus dibetulkan. Sebuah
     * galat yang tidak menyebutkan perbaikannya adalah galat yang dicari
     * berjam-jam.
     */
    let data: SiteverifyResponse | null = null;
    try {
      data = (await response.json()) as SiteverifyResponse;
    } catch {
      data = null;
    }

    const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'] : [];

    /**
     * Dua kode ini menuduh KITA, bukan pengunjung, jadi menolak pengunjung
     * karenanya adalah menghukum orang yang salah: kunci rahasianya keliru
     * atau cacat bentuknya. Gerbangnya dibuka dan kesalahannya ditulis keras
     * ke log, karena satu-satunya perbaikan ada di `.env`, bukan di peramban
     * siapa pun.
     */
    if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
      logger.error(
        '[Turnstile] TURNSTILE_SECRET_KEY ditolak Cloudflare — gerbang dibuka sampai kuncinya dibetulkan',
        { codes }
      );
      return { ok: true, reason: 'unreachable' };
    }

    if (!response.ok) {
      logger.error('[Turnstile] siteverify menjawab dengan status tidak wajar', {
        status: response.status,
        codes,
      });
      return { ok: true, reason: 'unreachable' };
    }

    if (data?.success !== true) {
      return { ok: false, reason: 'rejected', codes };
    }

    /**
     * `success: true` BELUM berarti token ini milik kita.
     *
     * Sampai 2026-09-04 modul ini berhenti di baris di atas, dan itu adalah
     * separuh pemeriksaan. Cloudflare menjawab dua pertanyaan sekaligus:
     * "apakah tantangan ini benar-benar diselesaikan" — dan, lewat `hostname`
     * serta `action`, "di mana, dan untuk apa". Membuang dua jawaban terakhir
     * membuat gerbangnya menerima token sah yang diterbitkan untuk keperluan
     * lain.
     */
    const hostname = (data.hostname ?? '').toLowerCase();
    const allowed = config.turnstile.allowedHostnames;
    if (!allowed.includes(hostname)) {
      /**
       * Dicatat sebagai `error`, bukan `warn`, dan menyebut hostname yang
       * teramati.
       *
       * Ada dua sebab baris ini muncul, dan keduanya menuntut tindakan:
       * seseorang memakai site key kita dari domainnya sendiri, ATAU kita
       * menambah host baru dan lupa memasukkannya ke daftar. Yang kedua
       * mengunci seluruh pengunjung host itu, jadi hostname-nya harus terbaca
       * di log — mendiagnosisnya tanpa itu berarti menebak.
       */
      logger.error('[Turnstile] token diterbitkan dari hostname di luar daftar', {
        hostname: hostname || '(kosong)',
        allowed,
      });
      return { ok: false, reason: 'hostname-not-allowed', codes };
    }

    /**
     * `action` mengikat token pada permukaan yang menerbitkannya.
     *
     * Tanpa ini, token yang dicetak di permukaan paling murah — panel chat,
     * yang tantangannya diselesaikan sendiri tanpa klik — dapat dibelanjakan
     * di `/auth/login`. Tokennya sekali pakai, jadi ini bukan celah tak
     * terbatas; tetapi ia menghapus perbedaan biaya antar permukaan, dan
     * biaya itulah yang membuat gerbangnya berguna.
     */
    if (expectedAction && data.action !== expectedAction) {
      logger.warn('[Turnstile] token diterbitkan untuk tindakan lain', {
        expected: expectedAction,
        received: data.action ?? '(kosong)',
      });
      return { ok: false, reason: 'action-mismatch', codes };
    }

    return { ok: true, reason: 'verified' };
  } catch (error) {
    // Termasuk timeout dari AbortSignal, DNS gagal, dan TLS gagal.
    logger.error('[Turnstile] siteverify tidak terjangkau', error);
    return { ok: true, reason: 'unreachable' };
  }
}

/**
 * Ambil token dari badan permintaan.
 *
 * Dua nama diterima karena ada dua cara token itu sampai. Widget Cloudflare
 * menyisipkan sendiri sebuah input tersembunyi bernama `cf-turnstile-response`
 * ke dalam form yang memuatnya, sedangkan klien JSON kita mengirimnya sebagai
 * `turnstileToken`. Menerima keduanya membuat form HTML biasa bekerja tanpa
 * penyesuaian.
 */
export function readTurnstileToken(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const candidate = record.turnstileToken ?? record['cf-turnstile-response'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
