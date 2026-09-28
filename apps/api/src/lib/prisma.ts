import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/config';

// Declare global prisma to prevent multiple instances in development
declare global {
  // eslint-disable-next-line no-var
  var __prisma: AppPrismaClient | undefined;
}

/**
 * A user's credentials never leave the database unless a query asks for them
 * by name. `include: { user: true }` or `parent: true` — written in dozens of
 * places to show a name — otherwise carried the password hash, the TOTP
 * secret, the recovery codes and the reset-token hash into whatever the
 * endpoint returned. The few queries that verify or change a credential opt
 * back in with `omit: { passwordHash: false }` (or the field they need); the
 * type of every other result no longer has these fields, so reading one is a
 * compile error. `lib/prisma.test.ts` fails when User gains a credential
 * column that is not listed here.
 */
export const USER_SECRET_OMIT = {
  user: {
    passwordHash: true,
    twoFactorSecret: true,
    twoFactorSecretPending: true,
    twoFactorRecoveryCodes: true,
    resetTokenHash: true,
  },
} as const;

/**
 * Prisma 7 connects through a driver adapter rather than a `datasource.url`.
 * We use the node-postgres adapter (`@prisma/adapter-pg`) backed by a single
 * connection pool sourced from `DATABASE_URL`.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: config.env === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    omit: USER_SECRET_OMIT,
  });
}

/** The client with its global `omit`: results carry no credential columns. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

/** What `prisma.$transaction(async (tx) => …)` hands its callback. */
type TransactionCallback = Extract<
  Parameters<AppPrismaClient['$transaction']>[0],
  (...args: never[]) => unknown
>;
export type AppTransactionClient = Parameters<TransactionCallback>[0];

/** The client or a transaction — for helpers that run in either. */
export type Db = AppPrismaClient | AppTransactionClient;

// Create prisma instance (reused in development to avoid connection storms)
export const prisma: AppPrismaClient = global.__prisma || createPrismaClient();

// In development, store in global to prevent too many connections
if (config.env === 'development') {
  global.__prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
