import { Prisma } from '@prisma/client';

/**
 * The single lock protocol every writer of `user_role_assignments` follows.
 *
 * A row lock on `users` alone does not serialise two writers that both mutate
 * *assignments*: they are different rows, so a suspension's `FOR UPDATE` on the
 * user does not make a concurrent revocation wait. That is how a Pengurus role
 * could be revoked while a suspension was reading it, or a Plh delegation
 * created while a revocation was deleting it.
 *
 * The order is fixed and must be the same everywhere:
 *
 *   1. the `users` row(s), `ORDER BY id` — the account's own state;
 *   2. that user's `user_role_assignments` rows, `ORDER BY id`.
 *
 * `ORDER BY id` on both keeps two writers touching overlapping sets from
 * deadlocking. This is the order `correspondence.service.ts`
 * (`createGeneratedDraftLetter`) documents and takes, and the order
 * `BoardSuspensionService`, `AuthService`, and `RolesService` take below.
 *
 * Everything a role writer needs is behind these helpers so a new writer has
 * one obvious thing to call rather than a `FOR UPDATE` snippet to copy — a
 * copy is what drifts.
 */

/** Lock the user rows for the given ids, in uuid order. */
export async function lockUserRows(
  tx: Prisma.TransactionClient,
  userIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "users" WHERE id::text IN (${Prisma.join(
      ids
    )}) ORDER BY id FOR UPDATE`
  );
}

/**
 * Lock every role-assignment row belonging to the given users, in uuid order.
 *
 * Must be called *after* {@link lockUserRows} — see the module comment for why
 * the order is not negotiable.
 */
export async function lockUserAssignmentRows(
  tx: Prisma.TransactionClient,
  userIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "user_role_assignments" WHERE user_id::text IN (${Prisma.join(
      ids
    )}) ORDER BY id FOR UPDATE`
  );
}

/**
 * The full protocol for one actor that is about to read *and* write a user's
 * roles: user row first, then that user's assignment rows.
 */
export async function lockUserAndAssignments(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await lockUserRows(tx, [userId]);
  await lockUserAssignmentRows(tx, [userId]);
}
