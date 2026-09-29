/**
 * Tinjau naskah dinas yang masa retensinya berakhir — jalur perintah.
 *
 * Pekerjaannya terjadwal di dalam API setiap hari (lihat `src/jobs/scheduler.ts`)
 * dan logikanya satu tempat: `reviewLetterRetention` di
 * `src/jobs/letter-retention.job.ts`. Berkas ini hanyalah cara memanggilnya
 * dengan tangan — untuk `--dry-run`, untuk menjalankannya di luar jadwal
 * setelah JRA diperbaiki, dan untuk membaca hasilnya sebagai daftar alih-alih
 * satu baris log.
 *
 *     pnpm --filter api db:retention-review [--dry-run]
 *
 * **Tidak memusnahkan apa pun.** Jadwal Retensi Arsip adalah instrumen yang
 * disahkan, sehingga pemusnahan arsip menuntut penilaian dan berita acara —
 * bukan keputusan sebuah skrip. Keluarannya adalah daftar usul.
 */
import { createPrismaClient } from '../client';
import { reviewLetterRetention } from '../../src/jobs/letter-retention.job';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const prisma = createPrismaClient();
  try {
    const summary = await reviewLetterRetention(prisma, { dryRun });
    const suffix = dryRun ? ' (dry run — tidak mencatat apa pun)' : '';

    console.log(
      `${summary.due.length} naskah melewati masa retensinya, dari ` +
        `${summary.consideredCount} naskah berklasifikasi yang diperiksa${suffix}.`
    );
    for (const row of summary.due) {
      const number = row.letterNumber || row.agendaNumber || '(belum bernomor)';
      const code = row.classificationCode ?? '-';
      console.log(
        `  [${code}] ${number} — ${row.subject}\n` +
          `      surat ${row.letterDate.toISOString().slice(0, 10)}, ` +
          `retensi ${row.retentionYears} tahun, jatuh tempo ` +
          `${row.dueAt.toISOString().slice(0, 10)}`
      );
    }

    if (summary.missingRetention > 0) {
      console.log(
        `${summary.missingRetention} naskah terarsip klasifikasinya belum ` +
          `memiliki masa retensi — kekosongan JRA, bukan bahan pemusnahan.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
