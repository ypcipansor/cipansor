/**
 * Menyeragamkan huruf besar/kecil alamat e-mail di tabel `users`.
 *
 * PostgreSQL membandingkan string secara case-sensitive, sedangkan `User.email`
 * hanya punya indeks `@unique` biasa. Akibatnya `Guru@cipansor.or.id` dan
 * `guru@cipansor.or.id` adalah dua baris berbeda, dan login SSO — yang menerima
 * e-mail dengan huruf apa pun dari penyedia identitas — bisa gagal menemukan
 * akun yang sebenarnya ada. Penulisan baru sudah dinormalkan di tepi
 * (`utils/email.ts`); skrip ini merapikan baris yang tertulis sebelum itu.
 *
 * Dua penjaga, karena skrip ini menulis ke tabel akun:
 *
 *  1. Kueri tabrakan dijalankan lebih dulu. Bila `lower(email)` yang sama
 *     dimiliki lebih dari satu baris, skrip **berhenti dan melaporkannya** —
 *     dua akun tidak pernah digabung otomatis. Menggabungkan akun berarti
 *     memilih pemilik dari data yang bertentangan, dan itu keputusan manusia.
 *  2. Bila ada satu saja e-mail yang bentrok dengan baris lain setelah
 *     dinormalkan, seluruh perubahan dibatalkan (dijalankan dalam satu
 *     transaksi), sehingga tabel tidak pernah setengah rapi.
 *
 *   pnpm --filter api db:normalize-emails            # laporan + penulisan
 *   pnpm --filter api db:normalize-emails --dry-run
 */
import { createPrismaClient } from '../client';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const prisma = createPrismaClient();

  try {
    // Penjaga 1: dua akun dengan e-mail yang sama setelah dinormalkan.
    const collisions = await prisma.$queryRaw<Array<{ normalized: string; count: bigint }>>`
      SELECT lower(email) AS normalized, count(*) AS count
      FROM users
      WHERE email IS NOT NULL
      GROUP BY lower(email)
      HAVING count(*) > 1
    `;

    if (collisions.length > 0) {
      console.error(`Ditemukan ${collisions.length} alamat yang dimiliki lebih dari satu akun.`);
      for (const row of collisions) {
        console.error(`  ${row.normalized} -> ${row.count} akun`);
      }
      console.error(
        'Skrip berhenti tanpa mengubah apa pun. Gabungkan akun-akun itu secara manual lebih dulu.'
      );
      process.exitCode = 1;
      return;
    }

    const dirty = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id, email
      FROM users
      WHERE email IS NOT NULL AND email <> lower(trim(email))
      ORDER BY email
    `;

    if (dirty.length === 0) {
      console.log('Tidak ada e-mail yang perlu dinormalkan.');
      return;
    }

    console.log(`${dirty.length} e-mail akan dinormalkan:`);
    for (const row of dirty) {
      console.log(`  ${row.email} -> ${row.email.trim().toLowerCase()}`);
    }

    if (dryRun) {
      console.log('Mode --dry-run: tidak ada perubahan yang ditulis.');
      return;
    }

    // Penjaga 2: satu transaksi, sehingga kegagalan di tengah jalan tidak
    // meninggalkan tabel dalam keadaan setengah rapi.
    await prisma.$transaction(
      dirty.map((row) =>
        prisma.user.update({
          where: { id: row.id },
          data: { email: row.email.trim().toLowerCase() },
        })
      )
    );

    console.log(`Selesai. ${dirty.length} baris diperbarui.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
