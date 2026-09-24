/**
 * Terapkan paket data presentasi ke basis data yang SUDAH terisi, tanpa
 * mengosongkan apa pun (berbeda dengan seed.ts yang men-TRUNCATE semua tabel).
 *
 *   ALLOW_DEMO_PACK=1 pnpm --filter api db:seed:presentasi
 *
 * Paketnya aditif dan berhenti sendiri bila sudah pernah diterapkan, tapi ia
 * tetap menulis ribuan baris contoh — jadi butuh izin eksplisit, dan hanya
 * untuk basis data yang memang berisi data contoh (bukan data santri sungguhan).
 */
import { createPrismaClient } from './client';
import { seedPaketPresentasi } from './seeds/paket-presentasi';

async function main() {
  if (process.env.ALLOW_DEMO_PACK !== '1') {
    console.error(
      'Menolak: paket ini menulis ribuan baris data contoh.\n' +
        'Set ALLOW_DEMO_PACK=1 hanya untuk basis data yang berisi data contoh, bukan data santri sungguhan.'
    );
    process.exit(1);
  }
  const prisma = createPrismaClient();
  try {
    await seedPaketPresentasi(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
