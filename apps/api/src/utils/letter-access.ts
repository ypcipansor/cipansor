import { Prisma, LetterStatus, LetterDirection } from '@prisma/client';
import { LETTER_UNIT_SCOPE_ROLES } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { seesAllUnits } from './resolve-unit-id';

/**
 * Who may read a letter.
 *
 * `GET /correspondence/letters/:id` had no authorisation at all: any
 * authenticated account could fetch any letter by id, read its body and follow
 * its `fileUrl` — including letters marked CONFIDENTIAL or
 * STRICTLY_CONFIDENTIAL. Every wali murid and every santri has a login, so the
 * exposed set was not hypothetical.
 *
 * The obvious repair — "same unit may read" — is wrong here, and measurably
 * so: every parent and student row in production carries a `unit_id`, so that
 * rule would have handed a school's confidential correspondence to its own
 * parents. Unit membership is not a job description.
 *
 * So access is granted on two grounds instead:
 *
 *   1. Being *in the letter's chain* — its author, an assigned reviewer, a
 *      recipient, or either end of a disposition. This is what makes routing
 *      work across units: the ketua yayasan disposes a letter to the SMP IT
 *      headmaster, and that disposition is itself the grant.
 *
 *   2. Holding a role whose remit is correspondence, listed below. These are
 *      the people who must see a unit's letter book as a whole rather than
 *      only the items addressed to them personally.
 */

/**
 * Roles that handle a unit's correspondence as part of the job: the office
 * that registers and files letters, and the head who signs them.
 *
 * The list now lives in `@cipansor/shared` (`LETTER_UNIT_SCOPE_ROLES`) so the
 * API guard here and the E-Office "Edit Naskah Surat" UI toggle read the same
 * source and can never drift apart again. It is re-exported for any existing
 * importer of this module.
 */
export { LETTER_UNIT_SCOPE_ROLES } from '@cipansor/shared';

export type LetterActor = {
  id: string;
  role?: string | null;
  roleCode?: string | null;
  unitId?: string | null;
};

/** True when the actor may browse a whole unit's letters, not just their own. */
export function handlesUnitCorrespondence(actor: LetterActor): boolean {
  return !!actor.roleCode && LETTER_UNIT_SCOPE_ROLES.includes(actor.roleCode);
}

/**
 * True when the caller may pick which unit to look at (and so may pass
 * `?unitId=`). Everyone else is confined to what the scope clause allows.
 *
 * Foundation and cross-unit roles have no `unitId` of their own, which is why
 * the previous controller answered them with 403 "User has no unit assigned":
 * the sekretaris and ketua yayasan could not open the letter list that their
 * own routing workflow depends on.
 */
export function choosesUnit(actor: LetterActor): boolean {
  return seesAllUnits(actor);
}

/**
 * The `where` fragment that limits a letter listing to what `actor` may see.
 *
 * This is the list-shaped half of assertLetterAccess, and it has to agree with
 * it: filtering the list by `unitId` alone would have shown every parent and
 * every santri their school's entire letter book, because those accounts all
 * carry a `unit_id`. Anyone who is not foundation-level and does not handle
 * correspondence sees only letters they are actually part of.
 */
export function letterScopeWhere(actor: LetterActor): Prisma.LetterWhereInput {
  if (seesAllUnits(actor)) return {};

  if (handlesUnitCorrespondence(actor) && actor.unitId) {
    return { unitId: actor.unitId };
  }

  return {
    OR: [
      { createdById: actor.id },
      { reviewers: { some: { reviewerId: actor.id } } },
      { recipients: { some: { userId: actor.id } } },
      {
        dispositions: {
          some: { OR: [{ senderId: actor.id }, { recipientId: actor.id }] },
        },
      },
    ],
  };
}

type ChainCheck = {
  id: string;
  unitId: string;
  createdById: string;
  // Carried because every caller that checks access then needs to decide what
  // may happen next, and the workflow rules turn on exactly these two. Cheaper
  // to select two more columns here than to read the row twice.
  status: LetterStatus;
  direction: LetterDirection;
  reviewers: { reviewerId: string }[];
  recipients: { userId: string | null }[];
  dispositions: { senderId: string; recipientId: string }[];
};

/**
 * Throws unless `actor` may see `letterId`. Returns the letter's identifying
 * row so callers that already needed it do not fetch twice.
 */
export async function assertLetterAccess(
  actor: LetterActor,
  letterId: string
): Promise<ChainCheck> {
  const letter = await prisma.letter.findUnique({
    where: { id: letterId },
    select: {
      id: true,
      unitId: true,
      createdById: true,
      status: true,
      direction: true,
      reviewers: { select: { reviewerId: true } },
      recipients: { select: { userId: true } },
      dispositions: { select: { senderId: true, recipientId: true } },
    },
  });

  if (!letter) throw Errors.notFound('Letter not found');

  if (seesAllUnits(actor)) return letter;

  const inChain =
    letter.createdById === actor.id ||
    letter.reviewers.some((r) => r.reviewerId === actor.id) ||
    letter.recipients.some((r) => r.userId === actor.id) ||
    letter.dispositions.some((d) => d.senderId === actor.id || d.recipientId === actor.id);

  if (inChain) return letter;

  if (handlesUnitCorrespondence(actor) && actor.unitId === letter.unitId) {
    return letter;
  }

  // Same message for "not yours" and "does not exist" would be friendlier to
  // an attacker probing ids; the letter's existence is not itself sensitive
  // here, but its contents are, so the distinction stays cheap and honest.
  throw Errors.forbidden('Anda tidak memiliki akses ke surat ini');
}
