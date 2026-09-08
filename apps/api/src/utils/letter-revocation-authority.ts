/**
 * Kewenangan mencabut naskah dinas — dibaca dari `@cipansor/shared`.
 *
 * Tabelnya sendiri tinggal di paket bersama karena aturan ini dipakai dua sisi:
 * server menegakkannya, dan antarmuka membaca tabel yang sama supaya tombol
 * yang ditawarkan persis sama dengan perbuatan yang akan diterima. Berkas ini
 * hanya meneruskannya, sehingga kode server tetap mengimpor dari `@/utils/`
 * seperti aturan naskah yang lain.
 */
export {
  RevocationRank,
  REVOCATION_DECIDER_ROLES,
  mayRevokeSignature,
  rankOf,
  whoMayRevoke,
  type RevocationParty,
} from '@cipansor/shared';
