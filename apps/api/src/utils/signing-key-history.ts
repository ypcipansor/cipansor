import type { Prisma } from '@prisma/client';
import { publicKeyFingerprint } from '@/utils/esign';

/**
 * Daur hidup `UserSigningKeyHistory` — append-only, tetapi dengan stempel waktu.
 *
 * Model itu mendokumentasikan `supersededAt` dan `revokedAt`, dan verifikasi
 * suara historis memang mengandalkannya untuk memutuskan apakah sebuah kunci
 * masih "dipercaya pada saat itu". Sebelum berkas ini ada, TIDAK ADA satu pun
 * jalur yang menulis kedua kolom itu: `ensureSigningKeyHistory` hanya
 * meng-upsert baris baru saat suara pertama ditandatangani, sementara
 * penerbitan ulang dan pencabutan di `esign.service.ts` hanya menyentuh
 * `UserSigningKey`. Akibatnya riwayat memperlihatkan setiap kunci tampak
 * berlaku selamanya — janji model yang tidak pernah ditepati.
 *
 * Aturan yang dipaku di sini, dan sengaja dibedakan:
 *  - **Superseded** (kunci diganti kunci baru) dan **revoked** (kunci dicabut)
 *    adalah peristiwa BERBEDA pada kolom yang berbeda. `AFFILIATION_CHANGED`
 *    juga menandai `supersededAt`, sebab kuncinya digantikan; tetapi hanya
 *    `KEY_COMPROMISE` yang membuat tanda tangan lama meragukan — dan itu
 *    diputuskan pemanggil, bukan di sini.
 *  - Rekaman lama TIDAK dihapus dan `revokedAt`-nya tidak menghapus masa
 *    berlakunya. Suara yang sudah sah sebelum pencabutan tetap terverifikasi
 *    lewat kunci publik lamanya; stempel waktu hanya menjawab "kapan kunci ini
 *    berhenti menjadi kunci yang berlaku".
 *
 * Fungsi-fungsi ini menerima klien Prisma sebagai parameter supaya dapat
 * dipanggil di dalam transaksi penerbitan/pencabutan — cap waktunya harus
 * ter-commit bersama perubahan kuncinya, bukan terpisah.
 */

/**
 * SHA-256(publicKey) — definisi tunggal ada di `utils/esign`
 * (`publicKeyFingerprint`). Diekspor ulang di sini supaya pemanggil daur hidup
 * tidak perlu dua impor.
 */
export const signingKeyFingerprint = publicKeyFingerprint;

/** Pembatasan tipe minimal agar util ini tidak bergantung pada modul esign. */
export interface HistoryClient {
  userSigningKeyHistory: Prisma.UserSigningKeyHistoryDelegate;
}

/**
 * Tandai rekaman riwayat untuk kunci LAMA sebagai digantikan.
 *
 * Dipanggil tepat sebelum kunci itu dihapus/diganti. `updateMany` dipakai
 * karena barisnya mungkin belum ada (kunci yang tak pernah menandatangani
 * apa pun tidak menghasilkan rekaman), dan ketiadaannya bukan galat.
 */
export async function supersedeSigningKeyHistory(
  client: HistoryClient,
  key: { userId: string; publicKey: string },
  at: Date = new Date()
): Promise<void> {
  // Tanpa kunci publik tidak ada fingerprint yang dapat dicari � dan karenanya
  // tidak ada rekaman riwayat yang mungkin ada. Dilewati, bukan dilempar.
  if (!key.publicKey) return;
  await client.userSigningKeyHistory.updateMany({
    where: {
      userId: key.userId,
      fingerprint: signingKeyFingerprint(key.publicKey),
      supersededAt: null,
      revokedAt: null,
    },
    data: { supersededAt: at },
  });
}

/**
 * Tandai rekaman riwayat untuk kunci yang dicabut.
 *
 * `revokedAt` diisi tanpa menyentuh `supersededAt`: kunci yang dicabut bukan
 * kunci yang digantikan. Baris yang sudah `revokedAt` tidak ditimpa, sehingga
 * waktu pencabutan pertama tetap lestari.
 *
 * `updateMany` murni akan DIAM bila barisnya belum ada. Kunci yang belum
 * pernah menandatangani apa pun belum punya rekaman, sehingga pencabutannya
 * hilang tanpa jejak dan riwayat kemudian memperlihatkan kunci itu berlaku
 * selamanya. Jalur pencabutan yang tidak boleh terlewat memakai
 * `upsertRevokedSigningKeyHistory` di bawah, yang MEMBUAT rekamannya bila
 * belum ada dengan `revokedAt` sudah terisi.
 */
export async function revokeSigningKeyHistory(
  client: HistoryClient,
  key: { userId: string; publicKey: string },
  at: Date = new Date()
): Promise<void> {
  if (!key.publicKey) return;
  await client.userSigningKeyHistory.updateMany({
    where: {
      userId: key.userId,
      fingerprint: signingKeyFingerprint(key.publicKey),
      revokedAt: null,
    },
    data: { revokedAt: at },
  });
}

/**
 * Cabut rekaman riwayat, MEMBUAT-nya bila belum ada.
 *
 * Dipakai jalur pencabutan yang tidak boleh terlewat: kunci yang dicabut
 * sebelum pernah menandatangani tidak punya baris riwayat, dan `updateMany`
 * akan diam. Di sini barisnya di-upsert dengan status pencabutan sekaligus,
 * sehingga "kunci X dicabut pada waktu T" selalu punya rekaman append-only,
 * terlepas dari apakah ia sempat dipakai menandatangani.
 *
 * Pencabutan PERTAMA tetap lestari: `updateMany` bersyarat `revokedAt: null`
 * berjalan lebih dulu, lalu `upsert` hanya mengisi kolom lain bila barisnya
 * sudah ada, atau membuatnya bila belum.
 */
export async function upsertRevokedSigningKeyHistory(
  client: HistoryClient,
  key: { userId: string; algorithm?: string; publicKey: string },
  at: Date = new Date()
): Promise<void> {
  if (!key.publicKey) return;
  const fingerprint = signingKeyFingerprint(key.publicKey);
  await client.userSigningKeyHistory.updateMany({
    where: { userId: key.userId, fingerprint, revokedAt: null },
    data: { revokedAt: at },
  });
  await client.userSigningKeyHistory.upsert({
    where: { userId_fingerprint: { userId: key.userId, fingerprint } },
    create: {
      userId: key.userId,
      algorithm: key.algorithm ?? 'Ed25519',
      publicKey: key.publicKey,
      fingerprint,
      revokedAt: at,
    },
    update: {},
  });
}
