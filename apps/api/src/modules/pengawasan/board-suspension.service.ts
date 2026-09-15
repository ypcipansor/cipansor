import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { BoardSuspensionStatus } from '@prisma/client';

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

export class BoardSuspensionService {
  /**
   * Suspend a Board Member / Pengurus due to audit findings or investigation.
   */
  async suspendBoardMember(data: CreateBoardSuspensionInput, suspendedById: string) {
    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      include: { userRoles: true },
    });

    if (!targetUser) {
      throw Errors.notFound(`Pengurus / Pengguna dengan ID ${data.userId} tidak ditemukan`);
    }

    if (!targetUser.isActive) {
      throw Errors.conflict(`Akun pengurus ini sudah dalam keadaan non-aktif / dibekukan`);
    }

    // Check if there is already an active suspension
    const existingActive = await prisma.boardMemberSuspension.findFirst({
      where: {
        userId: data.userId,
        status: BoardSuspensionStatus.ACTIVE,
      },
    });

    if (existingActive) {
      throw Errors.conflict(`Pengurus ini telah memiliki Surat Keputusan Pembekuan Aktif (${existingActive.skNumber})`);
    }

    return prisma.$transaction(async (tx) => {
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
        data: { lockedUntil: new Date('2099-01-01T00:00:00Z') },
      });

      // 5. Temporary Plh / Plt Role Assignment if specified
      if (data.plhUserId && data.plhRoleCode) {
        const role = await tx.role.findFirst({
          where: { code: data.plhRoleCode },
        });

        if (role) {
          const existingAssign = await tx.userRoleAssignment.findFirst({
            where: {
              userId: data.plhUserId,
              roleId: role.id,
            },
          });

          if (!existingAssign) {
            await tx.userRoleAssignment.create({
              data: {
                userId: data.plhUserId,
                roleId: role.id,
                isPrimary: false,
              },
            });
          }
        }
      }

      return suspension;
    });
  }

  /**
   * Lift a Board Member's suspension (Pemulihan Status oleh Pembina).
   */
  async liftBoardSuspension(
    id: string,
    liftedById: string,
    liftReason: string
  ) {
    const suspension = await prisma.boardMemberSuspension.findUnique({
      where: { id },
    });

    if (!suspension) {
      throw Errors.notFound(`Data pembekuan pengurus tidak ditemukan`);
    }

    if (suspension.status !== BoardSuspensionStatus.ACTIVE) {
      throw Errors.conflict(`Status pembekuan sudah tidak aktif (${suspension.status})`);
    }

    return prisma.$transaction(async (tx) => {
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

      // 3. Unlock E-Sign keys
      await tx.userSigningKey.updateMany({
        where: { userId: suspension.userId },
        data: { lockedUntil: null },
      });

      // 4. Remove temporary Plh role assignment if one was granted
      if (suspension.plhUserId && suspension.plhRoleCode) {
        const role = await tx.role.findFirst({
          where: { code: suspension.plhRoleCode },
        });

        if (role) {
          await tx.userRoleAssignment.deleteMany({
            where: {
              userId: suspension.plhUserId,
              roleId: role.id,
              isPrimary: false,
            },
          });
        }
      }

      return updated;
    });
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
