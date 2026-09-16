import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus, Prisma } from '@prisma/client';
import { PENGURUS_ROLE_CODES } from '@cipansor/shared';
import { markUserSuspended, unmarkUserSuspended } from '@/utils/user-suspension';

export interface CreateBoardSuspensionInput {
  userId: string;
  skNumber: string;
  auditReason: string;
  documentUrl?: string;
  startDate?: string | null;
  projectedEndDate?: string | null;
  plhUserId?: string | null;
  plhRoleCode?: string | null;
}

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
      include: { userRoles: { include: { role: { select: { code: true } } } } },
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

        // 1. Create BoardMemberSuspension entry
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
          },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            suspendedBy: { select: { id: true, name: true } },
            plhUser: { select: { id: true, name: true, email: true } },
          },
        });

        // 2. Deactivate target user account
        await tx.user.update({
          where: { id: data.userId },
          data: { isActive: false },
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
      // 1. Update suspension record
      const updated = await tx.boardMemberSuspension.update({
        where: { id },
        data: {
          status: BoardSuspensionStatus.LIFTED,
          liftedAt: new Date(),
          liftedById,
          liftReason,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          liftedBy: { select: { id: true, name: true } },
        },
      });

      // 2. Reactivate target user account
      await tx.user.update({
        where: { id: suspension.userId },
        data: { isActive: true },
      });

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

    await unmarkUserSuspended(suspension.userId);
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
