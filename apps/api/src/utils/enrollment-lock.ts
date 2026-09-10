import { Prisma } from '@prisma/client';

/**
 * Acquisisce a pessimistic row lock (`SELECT ... FOR UPDATE`) on a registrant
 * row so concurrent enrollment requests cannot both pass the `status ===
 * 'ACCEPTED'` check and each promote the same registrant into a distinct
 * orphaned User/Student pair.
 *
 * The unique index on `registrants.student_id` was deliberately dropped (see
 * migration 20260307000000) so a student can re-enrol across units — which
 * means the database can no longer guarantee one student per registrant by
 * constraint. The lock is the replacement guarantee: it serialises the two
 * enrollment paths so the second waiter observes the committed `ENROLLED`
 * status and aborts.
 *
 * Returns the registrant's row-locked `status` so callers re-check it AFTER the
 * lock is held (the check that closes the race), rather than trusting the
 * pre-lock read.
 */
export async function lockRegistrantForEnrollment(
  tx: Prisma.TransactionClient,
  registrantId: string
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>(
    Prisma.sql`SELECT "status" FROM "registrants" WHERE "id" = ${registrantId} FOR UPDATE`
  );
  return rows[0]?.status ?? null;
}