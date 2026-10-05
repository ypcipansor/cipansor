/**
 * Load the brochure's extracurriculars (seeds/ekskul-2027-2028.ts) into a
 * database that already has its units and an active academic year. Nothing
 * is emptied, and a unit that already has one by that code or name is left
 * as it is.
 *
 *   APPLY_EKSKUL_2027_2028=1 pnpm --filter api db:seed:ekskul-2027-2028
 */
import { createPrismaClient } from './client';
import { loadBrochureExtracurriculars } from './seeds/ekskul-2027-2028';

async function main() {
  if (process.env.APPLY_EKSKUL_2027_2028 !== '1') {
    console.error(
      'Menolak: skrip ini menulis ekstrakurikuler dari brosur 2027/2028.\n' +
        'Set APPLY_EKSKUL_2027_2028=1 untuk menjalankannya.'
    );
    process.exit(1);
  }
  const prisma = createPrismaClient();
  try {
    for (const r of await loadBrochureExtracurriculars(prisma)) {
      console.log(`${r.unit}: ${r.name} — ${r.action}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
