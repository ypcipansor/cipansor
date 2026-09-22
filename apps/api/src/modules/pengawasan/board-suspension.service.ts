import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus, Prisma } from '@prisma/client';
import {
  PLH_INELIGIBLE_ROLE_CODES,
  PLH_ROLE_CODES,
  PENGAWASAN_SUSPENSION_ISSUE_ROLES,
  PENGURUS_ROLE_CODES,
  isPlhEligible,
  type CreateBoardSuspensionInput,
  type PengawasanCandidateDto,
} from '@cipansor/shared';
import { invalidateUserSuspensionCache, markUserSuspended } from '@/utils/user-suspension';
import { activationState, deactivationState } from '@/utils/account-state';
import { SIGNING_KEY_SUSPENSION_LOCK } from '@/utils/esign-suspension-lock';

// The payload is the shared contract the controller validates with; a local
// restatement of the same fields is exactly how the two drift apart.
export type { CreateBoardSuspensionInput };

/**
 * The signing-key suspension sentinel lives in `utils/esign-suspension-lock.ts`
 * so the E-Sign service can recognise (and refuse to clear) it without importing
 * this module. Re-exported here because the suspension tests and callers expect
 * it from the service.
 *
 * Product decision (final): a board suspension imposes a *temporary signing
 * prohibition*, not a formal key revocation. The suspension invoice and the
 * audit trail say "dibekukan/dikunci sementara", never "dicabut"; the audited
 * `UserSigningKey.revokedAt` field is deliberately left untouched, because a
 * revocation is permanent and a suspension is not, and the e-sign lifecycle has
 * no "un-revoke". A lift restores the prior `lockedUntil`. If the yayasan later
 * requires formal, permanent revocation on suspension, that is a product change
 * that must issue a fresh key on lift — do not repurpose the sentinel.
 */
export { SIGNING_KEY_SUSPENSION_LOCK, isSuspensionSigningLock } from '@/utils/esign-suspension-lock';

/**
 * Prior `lockedUntil` per signing-key id, so a lift can undo exactly what the
 * suspension did instead of nulling every key's lockout.
 */
type SigningKeyLockSnapshot = Record<string, string | null>;

/** Prior state of a Plh assignment the suspension reactivated. */
interface PlhAssignmentRestore {
  isActive: boolean;
  expiresAt: string | null;
}

/** A Plh delegate's effective assignment, as resolved at suspension time. */
interface PlhDependency {
  assignmentId: string;
  roleCode: string;
  created: boolean;
  restore: PlhAssignmentRestore | null;
}

/**
 * The account's `isActive` at the moment the suspension switched it off, plus
 * the ownership token the switch wrote.
 *
 * `isActiveBefore` alone could not distinguish "still off because of this
 * suspension" from "off because an admin deactivated it again during the
 * suspension", so a lift could resurrect an account someone else had just
 * switched off. `writer` is the token stamped on `User.accountStateWriter` by
 * the suspension's own write (see `utils/account-state.ts`); the lift
 * reactivates only while that exact token is still stored.
 */
interface AccountStateSnapshot {
  isActiveBefore: boolean;
  writer?: string | null;
}

/**
 * Undo one suspension's claim on a Plh assignment, once no ACTIVE suspension
 * still needs it.
 *
 * `created` means the suspension minted the assignment, so the last dependent
 * deletes it. Otherwise a recorded `restore` puts a reactivated row back to its
 * prior state; an assignment that was already effective when a suspension
 * merely reused it is left untouched.
 */
async function releasePlhAssignment(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  created: boolean,
  restore: PlhAssignmentRestore | null
): Promise<void> {
  if (created) {
    await tx.userRoleAssignment.deleteMany({ where: { id: assignmentId } });
    return;
  }
  if (restore) {
    await tx.userRoleAssignment.updateMany({
      where: { id: assignmentId },
      data: {
        isActive: restore.isActive,
        expiresAt: restore.expiresAt ? new Date(restore.expiresAt) : null,
      },
    });
  }
}

export class BoardSuspensionService {
  /**
   * The Plh/Plt eligibility rule, in one place, for every caller.
   *
   * `listPlhCandidates` and `suspendBoardMember` used to answer this question
   * differently: the picker excluded only `SUPER_ADMIN` and the legacy
   * `STUDENT`/`PARENT` enum values, while the service granted a Pengurus role to
   * whoever was named. A Pembina or Pengawas offered by the picker therefore
   * reached the grant, where the `trg_yayasan_organ_exclusive` trigger rejected
   * the insert with SQLSTATE 23514 — surfacing as an internal error *after* the
   * target had been deactivated in the same transaction. Both sides now read
   * `isPlhEligible` from `@cipansor/shared`.
   *
   * Holding no role at all is eligible: the grant is the first office the
   * person holds, and there is no organ to conflict with.
   */
  private assertPlhDelegateEligible(roleCodes: readonly string[]): void {
    if (isPlhEligible(roleCodes)) return;
    const blocked = roleCodes.filter((code) => PLH_INELIGIBLE_ROLE_CODES.includes(code));
    throw Errors.badRequest(
      `Pengguna yang ditunjuk sebagai Plh/Plt memegang peran ${blocked.join(', ')}. ` +
        `Plh/Plt menggantikan organ Pengurus, sehingga Pembina, Pengawas, Super Admin, ` +
        `dan peran di luar struktur yayasan tidak dapat merangkap jabatan tersebut ` +
        `(UU 16/2001 Pasal 29).`
    );
  }

  /**
   * Suspend a Board Member / Pengurus due to audit findings or investigation.
   *
   * Only a Pengurus may be suspended. The Pengawas audits the organ that runs
   * the yayasan, not the Pembina that appoints it, and not system
   * administrators or ordinary staff — without this check the ID was the only
   * thing standing between a Pengawas and freezing the Super Admin account.
   */
  async suspendBoardMember(
    data: CreateBoardSuspensionInput,
    suspendedById: string,
    actorRoleCode?: string | null
  ) {
    // Service-level re-enforcement of the route policy.
    //
    // The route `authorize(...)` list is the edge; this is the backstop. An
    // internal caller (a future job, a different route, a service-to-service
    // command) that reaches this method directly must not be able to mint a
    // suspension the governance policy forbids. The Pembina is deliberately
    // outside the issuing set — it appoints the Pengurus, and must not be the
    // organ that also freezes them through oversight.
    //
    // Fail closed: a missing role is treated as unauthorised, not as a trusted
    // system caller. An optional check (`actorRoleCode != null && …`) reads
    // more forgiving but is a hole — the one caller that forgets to pass a role
    // is exactly the internal path this guard exists to stop.
    if (!actorRoleCode || !PENGAWASAN_SUSPENSION_ISSUE_ROLES.includes(actorRoleCode)) {
      throw Errors.forbidden(
        'Hanya Pengawas Yayasan atau Super Admin yang dapat menerbitkan SK Pembekuan Pengurus.'
      );
    }

    // Version of the account-state write this suspension performs, carried out of
    // the transaction so the post-commit cache prime can be ordered by it.
    let suspensionAccountStateVersion = 0;
    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      include: {
        userRoles: {
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { role: { select: { code: true } } },
        },
      },
    });

    if (!targetUser) {
      throw Errors.notFound(`Pengurus / Pengguna dengan ID ${data.userId} tidak ditemukan`);
    }

    // A soft-deleted account is not a Pengurus anyone can suspend, even when
    // its `isActive` flag was never cleared. Without this the target passed the
    // ACTIVE gate below (`isActive: true`) and a suspension was created —
    // deactivating a user the application had already removed, and minting a
    // Plh role to replace someone who is not there. `deletedAt` is checked
    // again in the transactional claim so a delete that lands mid-flight aborts
    // rather than being papered over.
    if (targetUser.deletedAt) {
      throw Errors.conflict(
        `Akun pengurus ini telah dihapus (soft-deleted) dan tidak dapat dibekukan.`
      );
    }

    const targetRoleCodes = targetUser.userRoles.map((ur) => ur.role.code);
    const isPengurus = targetRoleCodes.some((code) =>
      (PENGURUS_ROLE_CODES as readonly string[]).includes(code)
    );

    if (!isPengurus) {
      throw Errors.forbidden(
        'Hanya anggota Pengurus Yayasan (Ketua, Sekretaris, Bendahara, Anggota) yang dapat dibekukan. ' +
          'Pembina, Pengawas, Super Admin, dan pegawai/siswa di luar struktur Pengurus tidak dapat dibekukan melalui mekanisme ini.'
      );
    }

    if (!targetUser.isActive) {
      throw Errors.conflict(`Akun pengurus ini sudah dalam keadaan non-aktif / dibekukan`);
    }

    // A Plh/Plt stands in for a Pengurus organ, so the delegated role must be
    // one — never SUPER_ADMIN, the Pembina that appoints the board, the
    // Pengawas that audits it, or any unit/staff role. Without this a Pengawas
    // could mint Super Admin through the very endpoint that suspends the
    // executive it audits.
    if (data.plhRoleCode && !(PLH_ROLE_CODES as readonly string[]).includes(data.plhRoleCode)) {
      throw Errors.badRequest(
        `Peran Plh/Plt tidak sah: ${data.plhRoleCode}. Hanya peran Pengurus (${PLH_ROLE_CODES.join(', ')}) yang dapat didelegasikan.`
      );
    }

    // Suspension is effective on issuance — this method switches the account
    // off, purges sessions and grants the Plh in one transaction. A future
    // `startDate` therefore cannot defer any of that, and storing it would
    // promise a schedule the service does not honour. The date is accepted as
    // a record of when the SK takes effect (today or earlier); a future one is
    // refused here as well as at the edge, because internal callers reach the
    // service directly.
    if (data.startDate && Date.parse(data.startDate) > Date.now()) {
      throw Errors.badRequest(
        'Pembekuan berlaku sejak SK ditetapkan; tanggal mulai tidak boleh di masa depan.'
      );
    }

    // The pair is all-or-nothing. The edge schema enforces this for HTTP
    // callers; internal callers reach the service directly, and a half-filled
    // delegation would be stored as metadata that looks like a delegation
    // without granting anyone the role.
    if (!!data.plhUserId !== !!data.plhRoleCode) {
      throw Errors.badRequest(
        'Data Plh/Plt harus lengkap: isi pengguna dan peran delegasinya, atau kosongkan keduanya.'
      );
    }

    // Plh/Plt eligibility. The delegate had no checks at all, so the endpoint
    // accepted the suspended officer themselves (a self-appointment that undoes
    // the suspension), a deleted account, or an inactive one — none of whom can
    // act, all of whom would make the suspension look like it delegated power.
    if (data.plhUserId) {
      if (data.plhUserId === data.userId) {
        throw Errors.badRequest(
          'Pengurus yang dibekukan tidak dapat ditunjuk sebagai Plh/Plt untuk menggantikan dirinya sendiri.'
        );
      }

      const plhUser = await prisma.user.findUnique({
        where: { id: data.plhUserId },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
          // The delegate's *effective* roles are what the grant conflicts with.
          // Reading them here gives the operator a readable 400 instead of the
          // database trigger's 23514, which surfaced as a 500.
          userRoles: {
            where: {
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { role: { select: { code: true } } },
          },
        },
      });

      if (!plhUser || plhUser.deletedAt) {
        throw Errors.badRequest(
          'Pengguna yang ditunjuk sebagai Plh/Plt tidak ditemukan atau telah dihapus.'
        );
      }

      if (!plhUser.isActive) {
        throw Errors.badRequest(
          'Pengguna yang ditunjuk sebagai Plh/Plt tidak aktif dan tidak dapat didelegasikan.'
        );
      }

      this.assertPlhDelegateEligible(plhUser.userRoles.map((ur) => ur.role.code));
    }

    try {
      const suspension = await prisma.$transaction(async (tx) => {
        // The ACTIVE check lives inside the transaction, and the database
        // enforces it with a partial unique index as the real guarantee:
        // two parallel requests can still both read "none" at READ COMMITTED.
        const existingActive = await tx.boardMemberSuspension.findFirst({
          where: {
            userId: data.userId,
            status: BoardSuspensionStatus.ACTIVE,
          },
        });

        if (existingActive) {
          throw Errors.conflict(
            `Pengurus ini telah memiliki Surat Keputusan Pembekuan Aktif (${existingActive.skNumber})`
          );
        }

        // Snapshot signing-key lockouts *and* soft-lock them in the same
        // conditional statement per key.
        //
        // A snapshot read followed by an unconditional bulk `updateMany` is a
        // lost update: a passphrase lockout re-armed after the read but before
        // the write was erased by the blanket sentinel, and the lift then
        // restored the stale snapshot. Matching each key on the `lockedUntil`
        // value just observed claims it only if nobody else moved it; a key that
        // changed is left alone and kept out of the snapshot, so the lift cannot
        // resurrect a lockout this suspension never replaced.
        const signingKeys = await tx.userSigningKey.findMany({
          where: { userId: data.userId },
          select: { id: true, lockedUntil: true },
        });
        const signingKeyLocks: SigningKeyLockSnapshot = {};
        for (const key of signingKeys) {
          const claimed = await tx.userSigningKey.updateMany({
            where: {
              id: key.id,
              userId: data.userId,
              lockedUntil: key.lockedUntil ?? null,
            },
            data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
          });
          if (claimed.count === 1) {
            signingKeyLocks[key.id] = key.lockedUntil ? key.lockedUntil.toISOString() : null;
          }
        }

        // The account state is read *inside* the transaction — and after the row
        // is locked — then claimed with a conditional compare-and-set. A plain
        // read-then-update is a lost-update race: at READ COMMITTED an admin can
        // change `isActive` (or its writer token) after this snapshot but before
        // the flip, and the suspension's more permissive state would overwrite
        // theirs — and install a writer token that lets a later lift resurrect
        // an account that should have stayed off. Matching on the observed
        // values means the write only lands if nothing moved; otherwise the
        // transaction aborts and the suspension is never created.
        //
        // Locking first is what makes the snapshot trustworthy: it serialises
        // this moment against a concurrent `isActive`/`deletedAt` write, so the
        // read below sees the state that will actually hold at commit. The
        // pre-flight checks above ran before the transaction opened; an account
        // deactivated or soft-deleted in the gap still passed them, and without
        // this re-read the suspension went on to switch off an already-dead
        // account and mint a Plh for an officer who cannot act.
        const lockedTarget = await tx.$queryRaw<
          Array<{ is_active: boolean; deleted_at: Date | null }>
        >`
          SELECT is_active, deleted_at FROM "users" WHERE id = ${data.userId} FOR UPDATE
        `;
        if (!lockedTarget[0]) {
          throw Errors.notFound(`Pengurus / Pengguna dengan ID ${data.userId} tidak ditemukan`);
        }
        if (lockedTarget[0].deleted_at) {
          throw Errors.conflict(
            'Akun pengurus ini telah dihapus (soft-deleted) dan tidak dapat dibekukan.'
          );
        }
        if (!lockedTarget[0].is_active) {
          throw Errors.conflict(
            'Akun pengurus ini sudah dalam keadaan non-aktif / dibekukan dan tidak dapat dibekukan.'
          );
        }

        const freshTarget = await tx.user.findUnique({
          where: { id: data.userId },
          select: {
            isActive: true,
            accountStateWriter: true,
            accountStateVersion: true,
            // The Pengurus role is re-resolved from this same read: an
            // assignment revoked or expired between the pre-flight check and
            // this point would otherwise let the suspension switch off an
            // account and mint a replacement for a vacancy already handled
            // elsewhere. Reading it here rather than in a separate query keeps
            // the whole eligibility decision on one locked snapshot.
            userRoles: {
              where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { role: { select: { code: true } } },
            },
          },
        });
        if (!freshTarget) {
          throw Errors.notFound(`Pengurus / Pengguna dengan ID ${data.userId} tidak ditemukan`);
        }
        const stillPengurus = freshTarget.userRoles.some((assignment) =>
          (PENGURUS_ROLE_CODES as readonly string[]).includes(assignment.role.code)
        );
        if (!stillPengurus) {
          throw Errors.forbidden(
            'Peran Pengurus Yayasan pengguna ini sudah tidak efektif dan tidak dapat dibekukan melalui mekanisme ini.'
          );
        }

        const accountDeactivation = deactivationState();
        const claimed = await tx.user.updateMany({
          where: {
            id: data.userId,
            isActive: freshTarget.isActive,
            deletedAt: null,
            // Prisma reads `undefined` as "do not filter this column" and
            // would let a non-null writer match, so normalise to `null`, which
            // actually means `IS NULL`.
            accountStateWriter: freshTarget.accountStateWriter ?? null,
          },
          data: accountDeactivation,
        });
        if (claimed.count !== 1) {
          throw Errors.conflict(
            'Status akun pengurus berubah saat proses pembekuan berjalan. Muat ulang lalu coba lagi.'
          );
        }
        const accountStateSnapshot: AccountStateSnapshot = {
          isActiveBefore: freshTarget.isActive,
          writer: accountDeactivation.accountStateWriter,
        };
        // The version this suspension's write produced. Read back in the same
        // transaction, on the row it just locked and updated, so it is the value
        // that holds at commit — the cache prime below is ordered by it, and a
        // lift that commits in between will have bumped it further.
        const claimedState = await tx.user.findUnique({
          where: { id: data.userId },
          select: { accountStateVersion: true },
        });
        suspensionAccountStateVersion = claimedState?.accountStateVersion ?? 0;

        // Resolve the Plh/Plt delegation dependency before creating the
        // suspension, so its provenance travels in the same row.
        let plhDependency: PlhDependency | null = null;

        if (data.plhUserId && data.plhRoleCode) {
          // Serialise the delegate+role grant before reading it. `findFirst`
          // followed by `create` is a TOCTOU: two suspensions of *different*
          // officers that name the same delegate for the same role can both read
          // "no assignment" and both insert, and because the Plh delegation is
          // unitless the `(user, role, unit)` unique does not fire on NULLs. The
          // partial unique index added in `20260921130000` is the database
          // guarantee; this transaction-scoped advisory lock is what lets the
          // common path *reuse* one row instead of racing and aborting the loser.
          // Keyed to delegate+role, in the pengawasan namespace so it cannot
          // collide with the canteen/onboarding lockspaces.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1002::int, hashtext(${`${data.plhUserId}:${data.plhRoleCode}`})::int)`;

          // Re-claim the delegate's eligibility *inside* this transaction,
          // under a row lock, immediately before the grant.
          //
          // The pre-flight checks above ran before the transaction opened. An
          // account deactivated or soft-deleted in the gap — by an admin, an HR
          // offboarding, a student delete — still passed them, so the
          // suspension went on to mint a Pengurus role for someone who can no
          // longer act. `FOR UPDATE` serialises the moment against a concurrent
          // `isActive`/`deletedAt` write, and the checks below then read the
          // state that will actually hold at commit. Any change aborts.
          const lockedPlh = await tx.$queryRaw<
            Array<{ is_active: boolean; deleted_at: Date | null }>
          >`
            SELECT is_active, deleted_at FROM "users" WHERE id = ${data.plhUserId} FOR UPDATE
          `;
          if (!lockedPlh[0]) {
            throw Errors.badRequest(
              'Pengguna yang ditunjuk sebagai Plh/Plt tidak ditemukan atau telah dihapus.'
            );
          }
          if (lockedPlh[0].deleted_at) {
            throw Errors.badRequest(
              'Pengguna yang ditunjuk sebagai Plh/Plt telah dihapus dan tidak dapat didelegasikan.'
            );
          }
          if (!lockedPlh[0].is_active) {
            throw Errors.badRequest(
              'Pengguna yang ditunjuk sebagai Plh/Plt tidak aktif dan tidak dapat didelegasikan.'
            );
          }

          // The delegate's roles are re-read *inside* the transaction and under
          // a lock on their assignment rows, immediately before the grant.
          //
          // The pre-flight check above is a courtesy that cannot be the
          // decision: a `UserRoleAssignment` inserted between it and this point
          // (an admin granting the delegate Pembina or Pengawas, say) would make
          // the Pengurus grant conflict with the organ-exclusivity trigger —
          // which then aborts the transaction *after* the target was switched
          // off. Locking the delegate's assignment rows serialises against a
          // concurrent update to them; a concurrent *insert* cannot be locked,
          // so the trigger remains the database guarantee and the outer catch
          // maps its violation to the same 4xx this check raises.
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "user_role_assignments" WHERE user_id = ${data.plhUserId} ORDER BY id FOR UPDATE`
          );
          const delegateRoles = await tx.userRoleAssignment.findMany({
            where: {
              userId: data.plhUserId,
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { role: { select: { code: true } } },
          });
          this.assertPlhDelegateEligible(delegateRoles.map((ur) => ur.role.code));

          // The delegate must not be the officer being suspended. The
          // pre-flight guard covers the same ground, but the target's
          // `deletedAt` is re-read under lock here anyway; keeping the pair
          // check in the same place makes the invariant local to the grant.
          if (data.plhUserId === data.userId) {
            throw Errors.badRequest(
              'Pengurus yang dibekukan tidak dapat ditunjuk sebagai Plh/Plt untuk menggantikan dirinya sendiri.'
            );
          }

          // Fail closed when the requested role does not exist.
          //
          // This used to be `if (role) { … }`: a missing or renamed role skipped
          // the grant entirely, yet the suspension was still created with
          // `plhUserId`/`plhRoleCode` metadata. The target was left deactivated
          // with no replacement holding the office — a suspension that looks
          // like a delegation and is not one. A named pair must either be
          // granted in full or abort the whole transaction; the pre-flight Zod
          // schema cannot be relied on here because internal callers reach the
          // service directly.
          if (!(PLH_ROLE_CODES as readonly string[]).includes(data.plhRoleCode)) {
            throw Errors.badRequest(
              `Peran Plh/Plt tidak sah: ${data.plhRoleCode}. Hanya peran Pengurus (${PLH_ROLE_CODES.join(', ')}) yang dapat didelegasikan.`
            );
          }

          const role = await tx.role.findFirst({ where: { code: data.plhRoleCode } });
          if (!role) {
            throw Errors.badRequest(
              `Peran Plh/Plt ${data.plhRoleCode} tidak ditemukan pada konfigurasi peran sistem. ` +
                `Pembekuan dibatalkan agar pengurus tidak dinonaktifkan tanpa pengganti yang sah.`
            );
          }

          const existingAssign = await tx.userRoleAssignment.findFirst({
            // The delegation the suspension grants is foundation-wide, so it
            // owns the unitless row. Matching `unitId: null` explicitly keeps
            // this from "reusing" an unrelated unit-scoped assignment for the
            // same role — which would record provenance against a row the lift
            // must not touch — and pairs with the partial unique index on
            // (user, role) WHERE unit_id IS NULL. Ordered by id so the row
            // picked is the same one the migration keeps when it collapses
            // historical duplicates.
            where: { userId: data.plhUserId, roleId: role.id, unitId: null },
            orderBy: { id: 'asc' },
          });

          if (!existingAssign) {
            const created = await tx.userRoleAssignment.create({
              data: {
                userId: data.plhUserId,
                roleId: role.id,
                isPrimary: false,
              },
            });
            plhDependency = {
              assignmentId: created.id,
              roleCode: data.plhRoleCode,
              created: true,
              restore: null,
            };
          } else {
            // Only an assignment that is *currently effective* can be left
            // as it is. An inactive or expired row must be reactivated — a
            // replacement officer with no live delegation is not a Plh — and
            // the prior state recorded so the last dependent can restore it.
            const isEffective =
              existingAssign.isActive &&
              (!existingAssign.expiresAt || existingAssign.expiresAt > new Date());

            if (isEffective) {
              // Reuse a live delegation. It stays; this suspension just
              // records that it depends on it, so a lift of the *other*
              // suspension cannot remove it underneath us either.
              plhDependency = {
                assignmentId: existingAssign.id,
                roleCode: data.plhRoleCode,
                created: false,
                restore: null,
              };
            } else {
              plhDependency = {
                assignmentId: existingAssign.id,
                roleCode: data.plhRoleCode,
                created: false,
                restore: {
                  isActive: existingAssign.isActive,
                  expiresAt: existingAssign.expiresAt
                    ? existingAssign.expiresAt.toISOString()
                    : null,
                },
              };
              await tx.userRoleAssignment.update({
                where: { id: existingAssign.id },
                data: { isActive: true, expiresAt: null },
              });
            }
          }
        }

        // 1. The account was already deactivated above by the conditional
        //    claim; it is stamped with the ownership token recorded in
        //    `accountStateSnapshot`.

        // 2. Create BoardMemberSuspension entry
        const suspension = await tx.boardMemberSuspension.create({
          data: {
            userId: data.userId,
            skNumber: data.skNumber,
            auditReason: data.auditReason,
            documentUrl: data.documentUrl || null,
            startDate: data.startDate ? new Date(data.startDate) : new Date(),
            projectedEndDate: data.projectedEndDate ? new Date(data.projectedEndDate) : null,
            status: BoardSuspensionStatus.ACTIVE,
            suspendedById,
            plhUserId: data.plhUserId || null,
            plhRoleCode: data.plhRoleCode || null,
            plhAssignmentCreated: plhDependency?.created ?? false,
            plhAssignmentId: plhDependency?.assignmentId ?? null,
            plhAssignmentRestore: plhDependency?.restore
              ? (plhDependency.restore as unknown as Prisma.InputJsonValue)
              : undefined,
            signingKeyLocks: signingKeyLocks as unknown as Prisma.InputJsonValue,
            accountStateSnapshot: accountStateSnapshot as unknown as Prisma.InputJsonValue,
            accountStateWriter: accountDeactivation.accountStateWriter,
            plhAssignments: plhDependency
              ? {
                  create: [
                    {
                      assignmentId: plhDependency.assignmentId,
                      roleCode: plhDependency.roleCode,
                      created: plhDependency.created,
                      restore: plhDependency.restore
                        ? (plhDependency.restore as unknown as Prisma.InputJsonValue)
                        : undefined,
                    },
                  ],
                }
              : undefined,
          },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            suspendedBy: { select: { id: true, name: true } },
            plhUser: { select: { id: true, name: true, email: true } },
          },
        });

        // 3. Invalidate target user refresh tokens (force immediate logout)
        await tx.refreshToken.deleteMany({
          where: { userId: data.userId },
        });

        // 4. E-Sign soft-lock is applied above, per key, conditionally. It is
        //    not repeated as an unconditional bulk write here: doing so would
        //    clobber a lockout that landed after the conditional claim and
        //    leave a stale snapshot for the lift to restore.

        return suspension;
      });

      // Prime the shared cache (best-effort) so the next request on ANY replica
      // refuses the token without waiting out the TTL. The version is the one the
      // suspension's own conditional write produced, so a lift that commits in
      // the meantime (bumping it again) outranks this prime instead of being
      // overwritten by it.
      await markUserSuspended(data.userId, suspensionAccountStateVersion);
      return suspension;
    } catch (error) {
      // The partial unique index is what actually prevents a second ACTIVE
      // suspension; surface it as the same conflict the pre-check raises.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('Pengurus ini telah memiliki Surat Keputusan Pembekuan Aktif');
      }
      // The organ-exclusivity trigger is the last line of defence, and it is a
      // *database* guarantee: a concurrent `UserRoleAssignment` insert between
      // the in-transaction check and the grant cannot be locked out. Postgres
      // raises SQLSTATE 23514, which the Prisma driver adapter surfaces as
      // `P2039` with the original code in `meta.driverAdapterError`. Translating
      // it keeps the failure a stable 4xx domain error (and a clean rollback)
      // rather than the 500 an unmapped Prisma error becomes. The message names
      // the invariant, not the SQL, so the operator knows what to change.
      const driverCode = (
        error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }
      )?.meta?.driverAdapterError?.cause?.originalCode;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2039' || driverCode === '23514')
      ) {
        throw Errors.badRequest(
          'Penunjukan Plh/Plt melanggar pemisahan organ yayasan (UU 16/2001 Pasal 29): ' +
            'satu orang tidak boleh merangkap dua organ (Pembina, Pengawas, Pengurus). ' +
            'Pembekuan dibatalkan seluruhnya.'
        );
      }
      throw error;
    }
  }

  /**
   * Lift a Board Member's suspension (Pemulihan Status oleh Pembina).
   */
  async liftBoardSuspension(id: string, liftedById: string, liftReason: string) {
    // Version of the restored account state, carried out for the cache tombstone.
    let restoredAccountStateVersion = 0;
    const suspension = await prisma.boardMemberSuspension.findUnique({
      where: { id },
    });

    if (!suspension) {
      throw Errors.notFound(`Data pembekuan pengurus tidak ditemukan`);
    }

    if (suspension.status !== BoardSuspensionStatus.ACTIVE) {
      throw Errors.conflict(`Status pembekuan sudah tidak aktif (${suspension.status})`);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Claim the lift transactionally. The ACTIVE check above is only a
      //    courtesy: two callers can both read ACTIVE at READ COMMITTED and both
      //    write, the second silently overwriting the first's `liftedById` and
      //    `liftReason`. A conditional `updateMany` moves the decision into the
      //    same statement as the write, so exactly one caller sees a rowcount of
      //    1 and the other is told the suspension was already lifted.
      const claimed = await tx.boardMemberSuspension.updateMany({
        where: { id, status: BoardSuspensionStatus.ACTIVE },
        data: {
          status: BoardSuspensionStatus.LIFTED,
          liftedAt: new Date(),
          liftedById,
          liftReason,
        },
      });

      if (claimed.count !== 1) {
        throw Errors.conflict(
          'Pembekuan ini baru saja dicabut oleh proses lain. Muat ulang untuk melihat status terbaru.'
        );
      }

      const updated = await tx.boardMemberSuspension.findUniqueOrThrow({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          liftedBy: { select: { id: true, name: true } },
        },
      });

      // The account-state ownership token this suspension wrote, read from the
      // same row just claimed above.
      const suspensionWriter = updated.accountStateWriter;

      // 2. Restore the account, keyed on ownership rather than on `updatedAt`.
      //
      //    A blind `isActive: true` resurrects an account an admin deactivated
      //    for an unrelated reason while the suspension was in force. Comparing
      //    `updatedAt` over-corrected: any profile edit (a name or email change)
      //    moved the timestamp, so a lift refused to restore an account the
      //    suspension itself had switched off.
      //
      //    Ownership is the answer. The suspension stamped a token onto
      //    `User.accountStateWriter` when it switched the account off, and the
      //    lift reactivates only while that exact token is still stored — proof
      //    that no other writer (an admin deactivation, an HR offboarding) has
      //    claimed the account since. A profile edit does not touch the column,
      //    so it never blocks the lift. `isActiveBefore` still guards the case
      //    where the account was already off before the suspension began: then
      //    this suspension never owned the off state and must not claim it.
      //
      //    The reactivation stamps a fresh token of its own, so a stale lift of
      //    an older suspension cannot later mistake the restored state for its
      //    own write.
      //
      //    Ownership is claimed atomically. Reading the row and then issuing an
      //    unconditional `update` is itself a lost update: at READ COMMITTED an
      //    admin can deactivate the account after the read but before the
      //    write, and the lift's `isActive: true` silently overwrites that
      //    decision. The conditional `updateMany` below puts the whole
      //    ownership test in the same statement as the write — `id`,
      //    `isActive: false`, `deletedAt: null` and the exact writer token — so
      //    it activates only while every one of those still holds, and only
      //    when the row count is exactly one.
      const accountSnapshot = (suspension.accountStateSnapshot ??
        null) as AccountStateSnapshot | null;
      const ownedByThisSuspension = accountSnapshot?.isActiveBefore === true && !!suspensionWriter;
      if (ownedByThisSuspension) {
        // The write lands only on a row that is still exactly the one this
        // suspension switched off. A row count of zero means the account moved
        // under us — an admin deactivation, a soft delete, or a newer writer
        // token — so the suspension no longer owns the `false` and must not
        // turn it back on. The conditional write simply does not land.
        await tx.user.updateMany({
          where: {
            id: suspension.userId,
            isActive: false,
            deletedAt: null,
            accountStateWriter: suspensionWriter,
          },
          data: activationState(),
        });
      }

      // The version the account state holds at commit: the activation above bumps
      // it, and a lift that does not own the state leaves it as-is. Either way
      // this is the value a delayed suspension prime must be compared against.
      const restoredState = await tx.user.findUnique({
        where: { id: suspension.userId },
        select: { accountStateVersion: true },
      });
      restoredAccountStateVersion = restoredState?.accountStateVersion ?? 0;

      // 3. Restore E-Sign lockouts captured at suspension time — but only
      //    where the key still holds the sentinel the suspension wrote.
      //
      //    A blind restore is itself a lost update: if a passphrase lockout
      //    was re-armed after the suspension (a newer, shorter `lockedUntil`,
      //    or a cleared one), writing the snapshot back either erases that
      //    newer lockout or lengthens it erroneously. Keys created after the
      //    suspension are not in the snapshot at all; keys whose state someone
      //    else changed are skipped for the same reason.
      const snapshot = (suspension.signingKeyLocks ?? null) as SigningKeyLockSnapshot | null;
      if (snapshot) {
        for (const [keyId, priorValue] of Object.entries(snapshot)) {
          await tx.userSigningKey.updateMany({
            where: {
              id: keyId,
              userId: suspension.userId,
              lockedUntil: SIGNING_KEY_SUSPENSION_LOCK,
            },
            data: { lockedUntil: priorValue ? new Date(priorValue) : null },
          });
        }
      }

      // 4. Release this suspension's Plh dependency — but only if no OTHER
      //    ACTIVE suspension still depends on the same assignment.
      //
      //    Two suspensions can share one delegate+role. A `count → find heir →
      //    delete` sequence cannot decide this at READ COMMITTED: two parallel
      //    lifts can each observe "one other dependent", each decline to
      //    release, and the assignment survives forever with no ACTIVE
      //    suspension that needs it. The decision is therefore serialised with
      //    a row lock: every assignment a suspension depends on is locked
      //    `FOR UPDATE`, in a deterministic (uuid) order so two lifts taking
      //    the same set cannot deadlock, and only then are the dependent rows
      //    read and the last one computed. The second lift blocks until the
      //    first commits, re-reads the remaining dependents, and becomes the
      //    last one itself.
      //
      //    The first read is only for lock ordering — it must NOT be reused for
      //    the decision. Reading the dependency rows before the lock and then
      //    acting on that snapshot after it is the same lost update one level
      //    up: while a lift waits for the assignment lock, the other lift can
      //    hand it the `created` provenance (see the heir transfer below), and
      //    the waiting lift would then decide from its stale `created: false`,
      //    delete its own row and release nothing. The assignment survives with
      //    no ACTIVE suspension behind it. Re-reading under the lock — and
      //    locking the dependency rows themselves so a sibling lift cannot
      //    mutate them between the read and the delete — closes that.
      const dependencyRefs = await tx.boardSuspensionPlhAssignment.findMany({
        where: { suspensionId: id },
        select: { id: true, assignmentId: true },
      });

      const lockAssignmentIds = Array.from(
        new Set(
          [
            ...dependencyRefs.map((d) => d.assignmentId),
            ...(dependencyRefs.length === 0 && updated.plhAssignmentId
              ? [updated.plhAssignmentId]
              : []),
          ].filter((value): value is string => !!value)
        )
      ).sort();

      if (lockAssignmentIds.length > 0) {
        // `Prisma.join` produces the parameter list; the cast keeps the column
        // comparison against the `text` id type rather than an untyped uuid.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "user_role_assignments" WHERE id::text IN (${Prisma.join(
            lockAssignmentIds
          )}) ORDER BY id FOR UPDATE`
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "board_suspension_plh_assignments" WHERE assignment_id::text IN (${Prisma.join(
            lockAssignmentIds
          )}) ORDER BY id FOR UPDATE`
        );
      }

      // Fresh read, now that both the assignment and every dependency row for
      // it are held. `created`/`restore` may have changed hands while we waited.
      const dependencies =
        lockAssignmentIds.length > 0 || updated.plhAssignmentId
          ? await tx.boardSuspensionPlhAssignment.findMany({ where: { suspensionId: id } })
          : [];

      if (dependencies.length === 0 && updated.plhAssignmentId) {
        // Legacy row written before the dependency table existed. It owns its
        // single assignment outright, so apply the old rule exactly, but never
        // while another ACTIVE suspension has since claimed the same one.
        const stillRequired = await tx.boardSuspensionPlhAssignment.count({
          where: {
            assignmentId: updated.plhAssignmentId,
            suspension: { status: BoardSuspensionStatus.ACTIVE },
          },
        });
        if (stillRequired === 0) {
          await releasePlhAssignment(
            tx,
            updated.plhAssignmentId,
            updated.plhAssignmentCreated,
            (updated.plhAssignmentRestore ?? null) as PlhAssignmentRestore | null
          );
        }
      }

      for (const dependency of dependencies) {
        const otherDependents = await tx.boardSuspensionPlhAssignment.count({
          where: {
            assignmentId: dependency.assignmentId,
            suspensionId: { not: id },
            suspension: { status: BoardSuspensionStatus.ACTIVE },
          },
        });

        // Provenance must outlive the row that carries it. If THIS suspension
        // minted (or reactivated) the assignment and another ACTIVE suspension
        // still depends on it, deleting our row would take `created`/`restore`
        // with it — the surviving dependent then lifts with `created: false`
        // and leaves a suspension-minted assignment active forever. Hand
        // ownership to a surviving dependent *before* this row disappears.
        const ownsProvenance = dependency.created || dependency.restore != null;
        let lastDependent = otherDependents === 0;
        if (!lastDependent && ownsProvenance) {
          const heir = await tx.boardSuspensionPlhAssignment.findFirst({
            where: {
              assignmentId: dependency.assignmentId,
              id: { not: dependency.id },
              suspensionId: { not: id },
              suspension: { status: BoardSuspensionStatus.ACTIVE },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (heir) {
            await tx.boardSuspensionPlhAssignment.update({
              where: { id: heir.id },
              data: {
                created: dependency.created || heir.created,
                // Only copy a restore payload the dying row actually owns; a
                // null there means "the heir's own restore, if any, stands".
                ...(dependency.restore != null
                  ? { restore: dependency.restore as unknown as Prisma.InputJsonValue }
                  : {}),
              },
            });
          } else {
            // The count and the heir query disagreed (a concurrent lift won in
            // between); with no survivor to inherit, this lift is the last one.
            lastDependent = true;
          }
        }

        // Remove this row first, so a concurrent lift of the other suspension
        // cannot both see "one other dependent" and both decline to act.
        await tx.boardSuspensionPlhAssignment.deleteMany({
          where: { id: dependency.id },
        });

        if (!lastDependent) continue;

        await releasePlhAssignment(
          tx,
          dependency.assignmentId,
          dependency.created,
          (dependency.restore ?? null) as PlhAssignmentRestore | null
        );
      }

      return updated;
    });

    // Deliberately *invalidate*, not write `false`. A concurrent suspension
    // that already primed the cache with `1` would be overwritten by that
    // `false`, letting a suspended account's old token authenticate for a full
    // TTL. Dropping the key makes the next request read the persistent state,
    // which is the only writer that actually orders these two events.
    await invalidateUserSuspensionCache(suspension.userId, restoredAccountStateVersion);
    return result;
  }

  /**
   * Get all board member suspensions.
   */
  async getBoardSuspensions() {
    return prisma.boardMemberSuspension.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        suspendedBy: { select: { id: true, name: true } },
        plhUser: { select: { id: true, name: true, email: true } },
        liftedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Accounts that may be suspended — the Pengurus, and only those.
   *
   * Feeds the picker so the operator no longer pastes a UUID. The scope is the
   * same one `suspendBoardMember` enforces: an active, undeleted user whose
   * effective role assignment is a Pengurus role. Accounts already under an
   * ACTIVE suspension are excluded, since the endpoint answers them with a
   * conflict. The server remains the authority; this only narrows the list.
   */
  async listSuspendableCandidates(): Promise<PengawasanCandidateDto[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        userRoles: {
          some: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { code: { in: [...PENGURUS_ROLE_CODES] } },
          },
        },
        boardSuspensions: {
          none: { status: BoardSuspensionStatus.ACTIVE },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        unit: { select: { id: true, name: true } },
        userRoles: {
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { code: { in: [...PENGURUS_ROLE_CODES] } },
          },
          select: { role: { select: { code: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => {
      const roleCodes = user.userRoles.map((ur) => ur.role.code);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roleCodes,
        unit: user.unit,
        // Suspension eligibility is a different question from Plh eligibility;
        // these entries are all Pengurus by construction.
        plhEligible: isPlhEligible(roleCodes),
      };
    });
  }

  /**
   * Accounts that may serve as Plh/Plt.
   *
   * Eligibility is the shared `isPlhEligible` rule — the *same* one
   * `suspendBoardMember` enforces before the grant — applied here in the query,
   * so the picker cannot offer a Pembina or Pengawas the service would reject
   * (the previous filter excluded only `SUPER_ADMIN` and the legacy
   * `STUDENT`/`PARENT` enum values, which let the two non-Pengurus organs
   * through). The optional `excludeUserId` is how the form omits the person
   * being suspended, so a self-delegation cannot even be selected.
   *
   * The legacy enum pre-narrow is kept, but expressed as an explicit `OR` with
   * `role: null`: `notIn` alone evaluates to NULL for a row whose legacy column
   * is unset, so the old form silently dropped every account created without a
   * legacy role from the picker. The authoritative rule is the assignment-based
   * `none` clause below.
   */
  async listPlhCandidates(excludeUserId?: string): Promise<PengawasanCandidateDto[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        OR: [{ role: null }, { role: { notIn: ['STUDENT', 'PARENT'] } }],
        userRoles: {
          none: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { code: { in: [...PLH_INELIGIBLE_ROLE_CODES] } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        unit: { select: { id: true, name: true } },
        userRoles: {
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { role: { select: { code: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => {
      const roleCodes = user.userRoles.map((ur) => ur.role.code);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roleCodes,
        unit: user.unit,
        plhEligible: isPlhEligible(roleCodes),
      };
    });
  }
}

export const boardSuspensionService = new BoardSuspensionService();
