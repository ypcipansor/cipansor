import crypto from 'crypto';
import { hashPassword } from '@/lib/password';
import { syncParentRoleAssignments, type ParentScopeClient } from './parent-scope';
import { normalizeOptionalEmail } from './email';

/**
 * Attach a guardian to a student, creating the account if it does not exist.
 *
 * Two paths create students, and they disagreed about what a guardian is.
 *
 * SPMB onboarding builds a real relationship: it finds or creates a `User` for
 * the wali and writes a `StudentParent` row. The admin "tambah santri" form
 * did not. It wrote `parentName`, `parentPhone` and `parentEmail` as plain
 * text columns on the student row and stopped there — so the guardian existed
 * as three strings and nothing else. No account, so they could not sign in; no
 * `StudentParent` row, so the parent portal had nothing to show and
 * syncParentRoleAssignments had nothing to sync; and no unit scope, because
 * scope is derived from the children a guardian is linked to.
 *
 * The input was never the problem — `createStudentSchema` has always required
 * parentName and parentPhone. The data simply went nowhere. So the invariant
 * "no child without a guardian" is enforced here by construction rather than
 * by another rejection: if a student is created, the link is created with it.
 *
 * Idempotent: linking a guardian who is already linked returns the existing
 * link rather than failing, which is what makes it safe to call from a
 * retried transaction or a second sibling's enrolment.
 */

export interface GuardianClient extends ParentScopeClient {
  user: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
  studentParent: ParentScopeClient['studentParent'] & {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<unknown>;
  };
}

export interface GuardianInput {
  studentId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** "parent" | "wali" | "grandparent" … free text, as the schema has it. */
  relation?: string;
  isPrimary?: boolean;
}

export interface GuardianResult {
  parentId: string;
  /** True when this call created the account rather than reusing one. */
  created: boolean;
  /**
   * Present only when an account was created. The caller decides how to
   * deliver it; it is never persisted in plaintext.
   */
  resetToken?: string;
  /** Guardian role assignments added as a result of this link. */
  rolesAdded: number;
}

/**
 * A guardian with no e-mail still needs a unique login identity, so one is
 * derived from the phone number. `.local` keeps it unroutable: it is an
 * identifier, not an address anyone should try to mail.
 */
function fallbackEmail(phone: string): string {
  return `parent.${phone}@parent.cipansor.local`;
}

export async function linkGuardian(
  tx: GuardianClient,
  input: GuardianInput
): Promise<GuardianResult> {
  const email = normalizeOptionalEmail(input.email?.trim() || null) ?? null;
  const phone = input.phone?.trim() || null;

  if (!email && !phone) {
    // Without one of these there is no way to tell two guardians apart, and
    // every student would silently attach to whichever row was created first.
    throw new Error('Guardian needs an email or a phone number to be identified');
  }

  // Match on email first: it is the unique column, so it cannot match two
  // people. Phone is checked second and only as a fallback.
  let parent = email ? await tx.user.findUnique({ where: { email } }) : null;

  if (!parent && phone) {
    parent = await tx.user.findFirst({ where: { phone } });
  }

  let created = false;
  let resetToken: string | undefined;

  if (!parent) {
    resetToken = crypto.randomBytes(32).toString('hex');
    // The account is created with an unguessable password nobody holds, and is
    // reached through the reset token instead. A predictable default password
    // on an account tied to a child's records is not worth the convenience.
    const passwordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

    parent = await tx.user.create({
      data: {
        name: input.name,
        email: email || fallbackEmail(phone!),
        phone,
        passwordHash,
        resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
        resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        role: 'PARENT',
        isActive: true,
      },
    });
    created = true;
  }

  const existingLink = await tx.studentParent.findFirst({
    where: { studentId: input.studentId, parentId: parent.id },
  });

  if (!existingLink) {
    await tx.studentParent.create({
      data: {
        studentId: input.studentId,
        parentId: parent.id,
        relation: input.relation ?? 'parent',
        isPrimary: input.isPrimary ?? true,
      },
    });
  }

  // Scope follows the children: a wali with a child in TK and one in SMP ends
  // up with both unit roles on one account. Run after the link exists, since
  // that is what it reads.
  const rolesAdded = await syncParentRoleAssignments(tx, parent.id);

  return { parentId: parent.id, created, resetToken, rolesAdded };
}
