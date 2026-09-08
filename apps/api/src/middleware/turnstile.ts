import type { NextFunction, Request, Response } from 'express';
import { Errors } from '@/middleware/error';
import { logger } from '@/lib/logger';
import { readTurnstileToken, verifyTurnstileToken } from '@/utils/turnstile';

/**
 * Gerbang Turnstile untuk endpoint yang terbuka tanpa kredensial.
 *
 * **Urutannya penting dan tidak bisa ditukar: pasang SEBELUM `validate(...)`.**
 * `validate` menimpa `req.body` dengan hasil `schema.parse(...)`, dan skema
 * Zod di proyek ini membuang field yang tidak dikenalnya. Dipasang sesudahnya,
 * middleware ini akan mencari sebuah token yang baru saja dihapus dari
 * badan permintaan, lalu menolak setiap pengunjung yang sah dengan pesan
 * "token wajib disertakan". Uji di `turnstile.middleware.test.ts` memaku
 * urutan itu.
 *
 * Untuk rute multipart (`/esign/verify-pdf`), letaknya sesudah `upload.single`
 * dengan alasan yang sama dari arah sebaliknya: sebelum multer berjalan,
 * `req.body` masih kosong.
 *
 * Gerbang, bukan pengganti. Logika handler yang sudah ada tidak disentuh —
 * middleware ini hanya menentukan apakah handler itu dijalankan.
 *
 * **`action` wajib, dan itu sengaja.** Ia harus sama persis dengan `action`
 * yang dipasang `<TurnstileWidget>` pada permukaan yang mengirim ke rute ini;
 * `turnstile-actions.contract.test.ts` memaku kedua sisi supaya tidak ada yang
 * bisa mengganti salah satunya sendirian. Dibuat wajib alih-alih opsional
 * karena sebuah rute yang lupa menyebutkannya akan tetap lolos diam-diam, dan
 * pengikatan yang diam sama saja dengan tidak ada.
 */
export function requireTurnstile(action: string) {
  return function turnstileGate(req: Request, _res: Response, next: NextFunction): void {
    const token = readTurnstileToken(req.body);

    void verifyTurnstileToken(token, req.ip, action)
      .then((outcome) => {
        if (outcome.ok) {
          // Dicatat hanya ketika gerbangnya menyerah, bukan pada setiap
          // permintaan yang lolos: jalur bahagia di halaman masuk akan
          // menenggelamkan log, dan log yang tenggelam tidak dibaca siapa pun.
          if (outcome.reason === 'unreachable') {
            logger.warn('[Turnstile] permintaan diteruskan tanpa pemeriksaan', {
              path: req.path,
              ip: req.ip,
            });
          }
          next();
          return;
        }

        logger.warn('[Turnstile] permintaan ditolak', {
          path: req.path,
          ip: req.ip,
          reason: outcome.reason,
          codes: outcome.codes,
        });

        /**
         * Dua kegagalan, dua pesan — versi sebelumnya menyatukannya dan itu
         * keliru.
         *
         * Alasan lama: "bagi pengunjung sungguhan keduanya berarti hal yang
         * sama, dan tindakannya juga sama: muat ulang halaman". Bagian kedua
         * tidak benar. `rejected` berarti Cloudflare menjawab "tidak" pada token
         * yang benar-benar dikirim — biasanya tantangan yang kedaluwarsa, dan
         * memuat ulang halaman memang menyelesaikannya. `missing-token` berarti
         * tidak ada token yang sampai sama sekali, dan penyebabnya yang paling
         * sering ada di jaringan pengunjung: pemblokir iklan atau penyaring yang
         * menghalangi `challenges.cloudflare.com`. Menyuruh orang itu memuat
         * ulang halaman adalah menyuruhnya mengulangi hal yang pasti gagal.
         *
         * Ini tidak membocorkan apa pun kepada penyerang: sebuah skrip sudah
         * tahu apakah ia menyertakan token atau tidak. Yang berubah hanya siapa
         * yang mendapat keterangan berguna.
         */
        next(
          Errors.badRequest(
            outcome.reason === 'missing-token'
              ? 'Verifikasi keamanan tidak terkirim. Ini biasanya terjadi bila pemblokir iklan atau jaringan Anda menghalangi challenges.cloudflare.com — izinkan alamat itu, atau coba jaringan lain.'
              : 'Verifikasi keamanan gagal. Silakan muat ulang halaman dan coba lagi.'
          )
        );
      })
      .catch((error) => next(error));
  }
}
