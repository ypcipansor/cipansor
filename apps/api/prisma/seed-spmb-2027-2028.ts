/**
 * Load SPMB 2027/2028 from the brochure (seeds/spmb-2027-2028.ts) into a
 * database that already has its units. Nothing is emptied.
 *
 *   APPLY_SPMB_2027_2028=1 pnpm --filter api db:seed:spmb-2027-2028
 *
 * A unit whose 2027/2028 period already exists is skipped, so an admin's edit
 * is never overwritten. SPMB_2027_2028_UPDATE=1 lays the brochure over the
 * existing periods again (the contact and the wave quotas stay as they are).
 */
import { createPrismaClient } from './client';
import { loadSpmb20272028 } from './seeds/spmb-2027-2028';

async function main() {
  if (process.env.APPLY_SPMB_2027_2028 !== '1') {
    console.error(
      'Menolak: skrip ini menulis penerimaan SPMB 2027/2028 dari brosur.\n' +
        'Set APPLY_SPMB_2027_2028=1 untuk menjalankannya.'
    );
    process.exit(1);
  }
  const prisma = createPrismaClient();
  try {
    const results = await loadSpmb20272028(prisma, {
      update: process.env.SPMB_2027_2028_UPDATE === '1',
    });
    for (const r of results) {
      const off = r.deactivated.length ? `; dinonaktifkan: ${r.deactivated.join(', ')}` : '';
      console.log(`${r.unit}: ${r.period} — ${r.action}${off}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
