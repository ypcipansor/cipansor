import { config } from '../config';

/**
 * The one place that knows where a certificate is verified.
 *
 * Before this existed, four call sites each invented their own answer and every
 * one of them was wrong in production:
 *
 *   students/id-card.service.ts      https://cipansor.app/verify?q=…
 *   sanad-certificate.service.ts     https://cipansor.app/public/verify-sanad   (×2)
 *   tahfidz.service.ts               https://cipansor.com/verify/<random uuid>  ("// Placeholder")
 *   prisma/seed.ts                   https://cipansor.or.id/verify/CERT-…
 *
 * `cipansor.app` and `cipansor.com` are not domains the yayasan owns, and
 * `/verify` has never been a route in this app. They all shipped because
 * `APP_URL` was defined in neither `.env` nor the compose `environment:` block,
 * so the fallback in each template literal was the live value.
 *
 * The real page is `/public/verify-sanad`, and it is reachable — it answers 200
 * on the apex with no session, because `middleware.ts` excludes `/public` from
 * its matcher entirely rather than relying on the hand-maintained
 * `publicPrefixes` list. It reads the certificate number from `?code=`.
 *
 * Verified live, 2026-08-15:
 *   https://cipansor.or.id/public/verify-sanad            200
 *   https://cipansor.or.id/certificates/verify/<code>     404   (apex)
 *   https://portal.cipansor.or.id/certificates/verify/…   307 → /login
 *
 * That last pair is why this deliberately does NOT point at
 * `/certificates/verify/[code]`: it sits behind the session wall, so a link
 * built from it asks a dinas office to sign in to a pesantren's staff portal.
 */
/**
 * Tempat keaslian sebuah naskah dinas diperiksa.
 *
 * Tanpa nomor apa pun di dalamnya, dan itu disengaja. Halaman itu memeriksa
 * berkas yang **diunggah**: sebuah tautan yang membawa nomor surat atau token
 * hanya dapat menjawab "ada surat yang pernah ditandatangani", bukan "surat
 * yang Anda pegang inilah surat itu" — dan celah persis itulah yang membuat
 * halaman verifikasi berbasis token dihapus (lihat EOFFICE_ESIGN_PLAN §1).
 *
 * Berkas ini ada karena empat pemanggil pernah mengarang jawabannya
 * sendiri-sendiri; penghasil naskah menjadi yang kelima, membaca
 * `NEXT_PUBLIC_SITE_URL` — sebuah variabel milik aplikasi web — dari dalam API,
 * tempat variabel itu tidak pernah didefinisikan. Cadangannya kebetulan benar,
 * yang berarti alamat pada setiap naskah resmi selama ini benar karena
 * kebetulan.
 */
export function letterVerificationUrl(): string {
  return `${config.publicSiteUrl}/public/verify-letter`;
}

export function certificateVerificationUrl(certificateNumber: string): string {
  return `${config.publicSiteUrl}/public/verify-sanad?code=${encodeURIComponent(certificateNumber)}`;
}
