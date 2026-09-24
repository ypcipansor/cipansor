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

export interface NormalizeEmailsResult {
  /** Colliding `lower(trim(email))` addresses, with the accounts that share them. */
  collisions: Array<{ normalized: string; count: number }>;
  /** Rows whose email still differed from its normalized form. */
  normalized: Array<{ email: string; next: string }>;
  /** True when the run wrote (false for a dry run or a collision abort). */
  wrote: boolean;
}

/**
 * The small Prisma surface the core uses. Deliberately loose (`any`) so both a
 * real `PrismaClient` and the `pg`-backed test adapter satisfy it; the core is
 * exercised by its result shape, not by re-deriving Prisma's generic types.
 */
export interface NormalizeEmailsClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRaw: <T = any>(query: any, ...values: any[]) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: (ops: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: { update: (args: any) => any };
}

export async function normalizeEmails(
  prisma: NormalizeEmailsClient,
  options: { dryRun?: boolean } = {}
): Promise<NormalizeEmailsResult> {
  const dryRun = options.dryRun ?? false;
  const result: NormalizeEmailsResult = { collisions: [], normalized: [], wrote: false };

  {
    // Penjaga 1: dua akun dengan e-mail yang sama setelah dinormalkan.
    //
    // Kunci tabrakan harus `lower(trim(email))`, sama persis dengan kunci
    // indeks unik di migrasi. Sebelumnya hanya `lower(email)`, sehingga
    // `guru@cipansor.or.id` dan ` guru@cipansor.or.id ` (spasi di sekeliling)
    // lolos preflight, lalu `UPDATE` di migrasi menabrakkan keduanya saat
    // `CREATE UNIQUE INDEX` — kegagalan yang terlambat dan membingungkan,
    // padahal preflight ada untuk menangkapnya lebih awal.
    const collisions = await prisma.$queryRaw<Array<{ normalized: string; count: bigint }>>`
      SELECT lower(trim(email)) AS normalized, count(*) AS count
      FROM users
      WHERE email IS NOT NULL
      GROUP BY lower(trim(email))
      HAVING count(*) > 1
    `;

    result.collisions = collisions.map((c) => ({
      normalized: c.normalized,
      count: Number(c.count),
    }));
    if (collisions.length > 0) {
      console.error(`Ditemukan ${collisions.length} alamat yang dimiliki lebih dari satu akun.`);
      for (const row of collisions) {
        console.error(`  ${row.normalized} -> ${row.count} akun`);
      }
      // Daftarkan id akun yang bertabrakan supaya operator tahu baris mana yang
      // harus digabung/diubah, bukan sekadar tahu alamatnya.
      const ids = await prisma.$queryRaw<Array<{ id: string; email: string; normalized: string }>>`
        SELECT id, email, lower(trim(email)) AS normalized
        FROM users
        WHERE email IS NOT NULL AND lower(trim(email)) IN (
          SELECT lower(trim(email)) FROM users
          WHERE email IS NOT NULL
          GROUP BY lower(trim(email)) HAVING count(*) > 1
        )
        ORDER BY normalized, email
      `;
      for (const row of ids) {
        console.error(`    id=${row.id} email="${row.email}"`);
      }
      console.error(
        'Skrip berhenti tanpa mengubah apa pun. Gabungkan/ubah akun-akun itu secara manual lebih dulu.'
      );
      return result;
    }

    const dirty = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id, email
      FROM users
      WHERE email IS NOT NULL AND email <> lower(trim(email))
      ORDER BY email
    `;

    result.normalized = dirty.map((row) => ({
      email: row.email,
      next: row.email.trim().toLowerCase(),
    }));

    if (dirty.length === 0) {
      console.log('Tidak ada e-mail yang perlu dinormalkan.');
      return result;
    }

    console.log(`${dirty.length} e-mail akan dinormalkan:`);
    for (const row of dirty) {
      console.log(`  ${row.email} -> ${row.email.trim().toLowerCase()}`);
    }

    if (dryRun) {
      console.log('Mode --dry-run: tidak ada perubahan yang ditulis.');
      return result;
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

    result.wrote = true;
    console.log(`Selesai. ${dirty.length} baris diperbarui.`);
  }

  return result;
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const result = await normalizeEmails(prisma, { dryRun: process.argv.includes('--dry-run') });
    if (result.collisions.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, so importing the module (tests) has no side
// effects.
if (process.argv[1] && process.argv[1].endsWith('normalize-emails.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
