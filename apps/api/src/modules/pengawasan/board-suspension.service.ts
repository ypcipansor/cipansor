import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus, Prisma } from '@prisma/client';
import {
  PENGURUS_ROLE_CODES,
  PLH_ROLE_CODES,
  type CreateBoardSuspensionInput,
} from '@cipansor/shared';
import { invalidateUserSuspensionCache, markUserSuspended } from '@/utils/user-suspension';

// The payload is the shared contract the controller validates with; a local
// restatement of the same fields is exactly how the two drift apart.
export type { CreateBoardSuspensionInput };

/** Far-future sentinel written to `lockedUntil` to revoke signing capability. */
const SIGNING_KEY_SUSPENSION_LOCK = new Date('2099-01-01T00:00:00Z');

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

/**
 * The account's `isActive` at the moment the suspension switched it off.
 *
 * A lift reads it as the restore target: `true` means the suspension is what
 * switched the account off, so lifting switches it back on; `false` means an
 * admin had already deactivated it for an unrelated reason and the lift must
 * leave it off. Comparing `updatedAt` instead was wrong in both directions — a
 * profile edit moved the timestamp, so a lift refused to restore an account the
 * suspension itself had disabled.
 */
interface AccountStateSnapshot {
  isActiveBefore: boolean;
}

export class BoardSuspensionService {
  /**
   * Suspend a Board Member / Pengurus due to audit findings or investigation.
   *
   * Only a Pengurus may be suspended. The Pengawas audits the organ that runs
   * the yayasan, not the Pembina that appoints it, and not system
   * administrators or ordinary staff — without this check the ID was the only
   * thing standing between a Pengawas and freezing the Super Admin account.
   */
  async suspendBoardMember(data: CreateBoardSuspensionInput, suspendedById: string) {
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
        select: { id: true, isActive: true, deletedAt: true },
      });

      if (!plhUser || plhUser.deletedAt) {
        throw Errors.badRequest('Pengguna yang ditunjuk sebagai Plh/Plt tidak ditemukan atau telah dihapus.');
      }

      if (!plhUser.isActive) {
        throw Errors.badRequest('Pengguna yang ditunjuk sebagai Plh/Plt tidak aktif dan tidak dapat didelegasikan.');
      }
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

        // Snapshot signing-key lockouts before overwriting them.
        const signingKeys = await tx.userSigningKey.findMany({
          where: { userId: data.userId },
          select: { id: true, lockedUntil: true },
        });
        const signingKeyLocks: SigningKeyLockSnapshot = {};
        for (const key of signingKeys) {
          signingKeyLocks[key.id] = key.lockedUntil ? key.lockedUntil.toISOString() : null;
        }

        // The account state is read *inside* the transaction, immediately
        // before it is flipped off. Reading it from the pre-transaction
        // `targetUser` let a concurrent admin deactivation (or a lift) land in
        // between, so the snapshot recorded a stale `isActive` and a later lift
        // restored an account someone else had switched off.
        const freshTarget = await tx.user.findUnique({
          where: { id: data.userId },
          select: { isActive: true },
        });
        const accountStateSnapshot: AccountStateSnapshot = {
          isActiveBefore: freshTarget?.isActive ?? false,
        };

        // Resolve the Plh/Plt delegation before creating the suspension, so
        // its provenance travels in the same row.
        let plhAssignmentCreated = false;
        let plhAssignmentId: string | null = null;
        let plhAssignmentRestore: PlhAssignmentRestore | null = null;

        if (data.plhUserId && data.plhRoleCode) {
          const role = await tx.role.findFirst({ where: { code: data.plhRoleCode } });

          if (role) {
            const existingAssign = await tx.userRoleAssignment.findFirst({
              where: { userId: data.plhUserId, roleId: role.id },
            });

            if (!existingAssign) {
              const created = await tx.userRoleAssignment.create({
                data: {
                  userId: data.plhUserId,
                  roleId: role.id,
                  isPrimary: false,
                },
              });
              plhAssignmentCreated = true;
              plhAssignmentId = created.id;
            } else {
              // Only an assignment that is *currently effective* can be left
              // as it is. An inactive or expired row must be reactivated — a
              // replacement officer with no live delegation is not a Plh — and
              // the prior state recorded so the lift can restore it.
              const isEffective =
                existingAssign.isActive &&
                (!existingAssign.expiresAt || existingAssign.expiresAt > new Date());

              if (isEffective) {
                plhAssignmentCreated = false;
                plhAssignmentId = null;
              } else {
                plhAssignmentId = existingAssign.id;
                plhAssignmentRestore = {
                  isActive: existingAssign.isActive,
                  expiresAt: existingAssign.expiresAt
                    ? existingAssign.expiresAt.toISOString()
                    : null,
                };
                await tx.userRoleAssignment.update({
                  where: { id: existingAssign.id },
                  data: { isActive: true, expiresAt: null },
                });
              }
            }
          }
        }

        // 1. Deactivate the target account.
        await tx.user.update({
          where: { id: data.userId },
          data: { isActive: false },
        });

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
            plhAssignmentCreated,
            plhAssignmentId,
            plhAssignmentRestore: plhAssignmentRestore
              ? (plhAssignmentRestore as unknown as Prisma.InputJsonValue)
              : undefined,
            signingKeyLocks: signingKeyLocks as unknown as Prisma.InputJsonValue,
            accountStateSnapshot: accountStateSnapshot as unknown as Prisma.InputJsonValue,
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

        // 4. Soft-lock E-Sign keys (preserve audit trail while revoking signing capability)
        await tx.userSigningKey.updateMany({
          where: { userId: data.userId },
          data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
        });

        return suspension;
      });

      // Prime the shared cache (best-effort) so the next request on ANY replica
      // refuses the token without waiting out the TTL.
      await markUserSuspended(data.userId);
      return suspension;
    } catch (error) {
      // The partial unique index is what actually prevents a second ACTIVE
      // suspension; surface it as the same conflict the pre-check raises.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('Pengurus ini telah memiliki Surat Keputusan Pembekuan Aktif');
      }
      throw error;
    }
  }

  /**
   * Lift a Board Member's suspension (Pemulihan Status oleh Pembina).
   */
  async liftBoardSuspension(id: string, liftedById: string, liftReason: string) {
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

      // 2. Restore the account, keyed on state rather than on `updatedAt`.
      //
      //    A blind `isActive: true` resurrects an account an admin deactivated
      //    for an unrelated reason while the suspension was in force. But
      //    comparing `updatedAt` over-corrected: any profile edit (a name or
      //    email change) moved the timestamp, so a lift refused to restore an
      //    account the suspension itself had switched off.
      //
      //    The real question is whether the account is *still* off. If it is
      //    already active again, or deleted, leave it alone. If it is off, the
      //    snapshot's `isActiveBefore` decides: `true` means the suspension is
      //    what turned it off (restore), while `false` means it was already off
      //    when the suspension began — an admin's own deactivation — and the
      //    lift must leave it off rather than resurrect it.
      const accountSnapshot = (suspension.accountStateSnapshot ?? null) as AccountStateSnapshot | null;
      const currentUser = await tx.user.findUnique({
        where: { id: suspension.userId },
        select: { isActive: true, deletedAt: true },
      });
      if (currentUser && currentUser.isActive === false && !currentUser.deletedAt) {
        const shouldReactivate = accountSnapshot?.isActiveBefore ?? true;
        if (shouldReactivate) {
          await tx.user.update({
            where: { id: suspension.userId },
            data: { isActive: true },
          });
        }
      }

      // 3. Restore E-Sign lockouts captured at suspension time. Keys created
      //    after the suspension are not in the snapshot and stay untouched.
      const snapshot = (suspension.signingKeyLocks ?? null) as SigningKeyLockSnapshot | null;
      if (snapshot) {
        for (const [keyId, priorValue] of Object.entries(snapshot)) {
          await tx.userSigningKey.updateMany({
            where: { id: keyId, userId: suspension.userId },
            data: { lockedUntil: priorValue ? new Date(priorValue) : null },
          });
        }
      }

      // 4. Undo the Plh delegation only if this suspension is what put it
      //    there — a pre-existing, already-effective assignment is left alone.
      const restore = (suspension.plhAssignmentRestore ?? null) as PlhAssignmentRestore | null;
      if (suspension.plhAssignmentId) {
        if (suspension.plhAssignmentCreated) {
          await tx.userRoleAssignment.deleteMany({
            where: { id: suspension.plhAssignmentId },
          });
        } else if (restore) {
          await tx.userRoleAssignment.updateMany({
            where: { id: suspension.plhAssignmentId },
            data: {
              isActive: restore.isActive,
              expiresAt: restore.expiresAt ? new Date(restore.expiresAt) : null,
            },
          });
        }
      }

      return updated;
    });

    // Deliberately *invalidate*, not write `false`. A concurrent suspension
    // that already primed the cache with `1` would be overwritten by that
    // `false`, letting a suspended account's old token authenticate for a full
    // TTL. Dropping the key makes the next request read the persistent state,
    // which is the only writer that actually orders these two events.
    await invalidateUserSuspensionCache(suspension.userId);
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
}

export const boardSuspensionService = new BoardSuspensionService();
