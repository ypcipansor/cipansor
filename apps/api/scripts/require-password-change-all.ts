/**
 * Flag every account that can sign in to choose a new password at its next
 * sign-in — ONCE, on production, at the release that brings the password
 * rules (decisions/autentikasi-2fa-dan-sandi.md: "sekali untuk semua akun pada
 * rilis yang membawa aturan ini").
 *
 * Deliberately a script and not a migration: migrations also run on staging,
 * whose demo accounts are shared by every tester and the e2e suite, and must
 * keep their published password.
 *
 * Every session also ends: a refresh is refused while the flag is set, so the
 * change reaches people within one access-token lifetime.
 *
 *   CONFIRM=require-password-change-all npx tsx scripts/require-password-change-all.ts
 *
 * Without CONFIRM it only counts. Running it again would flag everyone who has
 * changed since, so run it once, right after the release's deploy.
 */
import { createPrismaClient } from '../prisma/client';

const prisma = createPrismaClient();

async function main() {
  const where = {
    deletedAt: null,
    isActive: true,
    passwordHash: { not: null },
    mustChangePassword: false,
  };
  const count = await prisma.user.count({ where });

  if (process.env.CONFIRM !== 'require-password-change-all') {
    console.log(
      `${count} account(s) would be flagged. Set CONFIRM=require-password-change-all to flag them.`
    );
    return;
  }

  const flagged = await prisma.user.updateMany({ where, data: { mustChangePassword: true } });
  console.log(`${flagged.count} account(s) must choose a new password at their next sign-in.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
