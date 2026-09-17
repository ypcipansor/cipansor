import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus, Prisma } from '@prisma/client';
import {
  PENGURUS_ROLE_CODES,
  PLH_ROLE_CODES,
  type CreateBoardSuspensionInput,
  type PengawasanCandidateDto,
} from '@cipansor/shared';
import { invalidateUserSuspensionCache, markUserSuspended } from '@/utils/user-suspension';
import { activationState, deactivationState } from '@/utils/account-state';

// The payload is the shared contract the controller validates with; a local
// restatement of the same fields is exactly how the two drift apart.
export type { CreateBoardSuspensionInput };

/** Far-future sentinel written to `lockedUntil` to revoke signing capability. */
export const SIGNING_KEY_SUSPENSION_LOCK = new Date('2099-01-01T00:00:00Z');

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

        // The account state is read *inside* the transaction, then claimed
        // with a conditional compare-and-set. A plain read-then-update is a
        // lost-update race: at READ COMMITTED an admin can change `isActive`
        // (or its writer token) after this snapshot but before the flip, and
        // the suspension's more permissive state would overwrite theirs — and
        // install a writer token that lets a later lift resurrect an account
        // that should have stayed off. Matching on the observed values means
        // the write only lands if nothing moved; otherwise the transaction
        // aborts and the suspension is never created.
        const freshTarget = await tx.user.findUnique({
          where: { id: data.userId },
          select: { isActive: true, accountStateWriter: true },
        });
        if (!freshTarget) {
          throw Errors.notFound(`Pengurus / Pengguna dengan ID ${data.userId} tidak ditemukan`);
        }
        const accountDeactivation = deactivationState();
        const claimed = await tx.user.updateMany({
          where: {
            id: data.userId,
            isActive: freshTarget.isActive,
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

        // Resolve the Plh/Plt delegation dependency before creating the
        // suspension, so its provenance travels in the same row.
        let plhDependency: PlhDependency | null = null;

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
      const reactivationData = activationState();
      const accountSnapshot = (suspension.accountStateSnapshot ?? null) as AccountStateSnapshot | null;
      const currentUser = await tx.user.findUnique({
        where: { id: suspension.userId },
        select: { isActive: true, deletedAt: true, accountStateWriter: true },
      });
      if (currentUser && currentUser.isActive === false && !currentUser.deletedAt) {
        const ownedByThisSuspension =
          accountSnapshot?.isActiveBefore === true &&
          !!suspensionWriter &&
          currentUser.accountStateWriter === suspensionWriter;
        if (ownedByThisSuspension) {
          await tx.user.update({
            where: { id: suspension.userId },
            data: reactivationData,
          });
        }
      }

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
      //    ACTIVE suspension still depends on the same assignment. Two
      //    suspensions can share one delegate+role; the first lift used to
      //    delete the assignment the second was still relying on.
      const dependencies = await tx.boardSuspensionPlhAssignment.findMany({
        where: { suspensionId: id },
      });

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

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      roleCodes: user.userRoles.map((ur) => ur.role.code),
      unit: user.unit,
    }));
  }

  /**
   * Accounts that may serve as Plh/Plt for the given role.
   *
   * Eligible: active, undeleted, not the suspended officer, not a system
   * administrator (a Plh stands in for the Pengurus organ, never the
   * administrator), and not a pure student/parent/alumni account. The optional
   * `excludeUserId` is how the form omits the person being suspended, so a
   * self-delegation cannot even be selected.
   */
  async listPlhCandidates(excludeUserId?: string): Promise<PengawasanCandidateDto[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        role: { notIn: ['STUDENT', 'PARENT'] },
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

    return users
      .filter((user) => !user.userRoles.some((ur) => ur.role.code === 'SUPER_ADMIN'))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        roleCodes: user.userRoles.map((ur) => ur.role.code),
        unit: user.unit,
      }));
  }
}

export const boardSuspensionService = new BoardSuspensionService();
