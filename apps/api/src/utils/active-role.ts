/**
 * One definition of a "live" role assignment for Prisma `where` clauses.
 *
 * A role assignment is live only when it is both `isActive` and not past its
 * `expiresAt`. Checking `isActive` alone let an assignment that had already
 * expired still count as membership: the former holder kept appearing in the
 * employee directory and could still influence a document's unit scope. This
 * mirrors `activeRoleWhere()` in `modules/auth/auth.service.ts`, which the
 * login path already uses.
 */
export function activeUserRoleWhere(now: Date = new Date()) {
  return {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
