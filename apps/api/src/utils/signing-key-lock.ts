import type { Prisma } from '@prisma/client';

/**
 * Serialisasi transisi `UserSigningKey` PER PENGGUNA.
 *
 * `activateKey` melakukan pola baca-lalu-tulis (findUnique → deleteMany → create)
 * yang tidak aman terhadap balapan: dua permintaan yang berjalan bersamaan
 * sama-sama membaca "tidak ada kunci aktif", lalu sama-sama menulis. Yang kalah
 * menghapus kunci yang baru saja dibuat pemenangnya, sehingga kunci yang
 * dikembalikan pemenang ke pemanggilnya sudah tidak berlaku sebelum responsnya
 * sampai.
 *
 * Kunci baris biasa tidak cukup: baris `UserSigningKey` seorang pengguna bisa
 * BELUM ADA (penerbitan pertama) sehingga tak ada apa pun untuk dikunci.
 * Advisory lock transaksi (`pg_advisory_xact_lock`) berlaku atas NILAI kunci,
 * bukan baris, dan dilepas otomatis saat transaksi berakhir. Kuncinya memakai
 * `hashtextextended("userId")` agar seluruh pengguna dapat diserialkan tanpa
 * tabel tambahan; bentrok hash antara dua pengguna hanya menambah tunggu, tidak
 * pernah menggabungkan dua transisi yang sah.
 *
 * Jalur lain yang mengubah kunci pengguna yang sama (`decideRequest`,
 * `revokeKey`) mengambil kunci ini juga, sehingga pemeriksaan status di dalam
 * lock selalu melihat keadaan yang sudah final. `castVote` pada
 * foundation-decisions mengambil kunci yang SAMA sebelum menulis suara, supaya
 * pencabutan/penggantian kunci yang konkuren tidak dapat commit di antara
 * pembacaan kunci dan `INSERT` suara (menyisakan suara tersimpan yang tak lagi
 * autentik).
 */
export async function lockSigningKeyTransition(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
}
