import { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';

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

/** The role codes a user holds through currently-effective assignments. */
export async function effectiveRoleCodes(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<string[]> {
  const assignments = await tx.userRoleAssignment.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      role: { isActive: true },
    },
    select: { role: { select: { code: true } } },
  });
  return assignments.map((assignment) => assignment.role.code);
}

/**
 * Refuse a governance action unless the actor still holds one of its roles,
 * read from persistent assignments rather than the access token.
 *
 * `authorize(...)` reads `roleCode` off the JWT, which is a snapshot: a role
 * revoked after the token was minted keeps passing the route guard until the
 * access token expires — the CWE-863 class where a dismissed Pengawas could
 * still freeze or restore a Pengurus. This re-resolves the actor's *effective*
 * assignments inside the mutation's transaction, under the shared lock protocol
 * (`users` then that user's `user_role_assignments`), so a concurrent
 * revocation either commits first and is seen here, or waits behind the lock
 * and lands after the mutation.
 *
 * The caller must not have taken the assignment locks yet, or must include the
 * actor in the same ordered acquisition; the two lock helpers above are called
 * here and in every role writer, so the order is the single documented one.
 *
 * @returns the effective role code that satisfied the check.
 */
export async function assertActorHoldsEffectiveRole(
  tx: Prisma.TransactionClient,
  actorId: string,
  allowedRoleCodes: readonly string[]
): Promise<string> {
  await lockUserAndAssignments(tx, actorId);
  const codes = await effectiveRoleCodes(tx, actorId);
  const matched = codes.find((code) => allowedRoleCodes.includes(code));
  if (!matched) {
    throw Errors.forbidden('Peran Anda tidak lagi aktif untuk melakukan tindakan ini.');
  }
  return matched;
}

/**
 * The request-time (non-locking) twin of {@link assertActorHoldsEffectiveRole},
 * for read endpoints whose response is not a state change. It closes the same
 * stale-token hole — a revoked role must not read governance data — without
 * serialising against writers, which a pure read does not need.
 */
export async function assertActorHoldsEffectiveRoleUnlocked(
  client: Pick<Prisma.TransactionClient, 'userRoleAssignment'>,
  actorId: string | undefined,
  allowedRoleCodes: readonly string[]
): Promise<string> {
  if (!actorId) {
    throw Errors.forbidden('Peran Anda tidak lagi aktif untuk melakukan tindakan ini.');
  }
  const codes = await effectiveRoleCodes(client as Prisma.TransactionClient, actorId);
  const matched = codes.find((code) => allowedRoleCodes.includes(code));
  if (!matched) {
    throw Errors.forbidden('Peran Anda tidak lagi aktif untuk melakukan tindakan ini.');
  }
  return matched;
}
