import { prisma } from '../../lib/prisma';
import { EmployeeDocumentType } from '@prisma/client';
import { cleanupBlobBestEffort } from '../../utils/cloud-storage';
import { claimBlobForRecord, releaseBlobClaim } from '../../utils/blob-claim';
import { isFoundationScopedRole } from '../../utils/resolve-unit-id';
import { mayAdministerEmployeeDocuments } from '@cipansor/shared';
import { Errors } from '../../middleware/error';
import { activeUserRoleWhere } from '../../utils/active-role';

/**
 * The subset of the authenticated user needed to decide whether they own or
 * administer an employee record.
 */
export interface EmployeeDocumentActor {
  id: string;
  roleCode?: string | null;
  unitId?: string | null;
}

/**
 * The user whose document is being deleted, or null if no such record.
 *
 * `unitId` is the home unit of the user's *primary active role assignment*,
 * not `user.unitId`: the token scope for every login path is derived from the
 * assignment (`tokenUnitId`), so an actor's `unitId` and a target's stored
 * `user.unitId` can legitimately disagree when a person holds a role scoped to
 * more than one unit. Comparing the assignment's unit is what keeps a unit
 * admin's reach exactly as wide as their own token scope.
 */
async function findDocumentOwnerTarget(id: string) {
  return prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      fileUrl: true,
      userId: true,
      user: {
        select: {
          unitId: true,
          userRoles: {
            where: activeUserRoleWhere(),
            orderBy: { isPrimary: 'desc' },
            select: { unitId: true },
          },
        },
      },
    },
  });
}

/**
 * True when `actor` may delete (or create a document for) `targetUserId`.
 *
 * A user always reaches their own records. Only a role that actually
 * administers personnel reaches someone else's — a foundation role across
 * every unit, a personnel administrator within its own unit. It deliberately
 * does NOT use `seesAllUnits`: that flag means "this role's operational remit
 * spans units" (perawat, ustadz, muhafidz …), which is about where people work
 * and says nothing about authority over their KTP and bank records. Relying on
 * it let a PERAWAT read and delete any employee's personal documents.
 */
async function assertActorMayManage(
  actor: EmployeeDocumentActor,
  target: { userId: string; unitId: string | null | undefined }
): Promise<void> {
  if (actor.id === target.userId) return;
  if (isFoundationScopedRole(actor.roleCode)) return;
  if (
    !mayAdministerEmployeeDocuments(actor.roleCode) ||
    !actor.unitId ||
    target.unitId !== actor.unitId
  ) {
    throw Errors.forbidden('Anda tidak berwenang mengelola dokumen pegawai tersebut');
  }
}

export const employeeDocumentService = {
  async create(
    data: {
      userId: string;
      name: string;
      type: EmployeeDocumentType;
      fileUrl: string;
      expiryDate?: Date;
      notes?: string;
    },
    actor?: EmployeeDocumentActor
  ) {
    if (actor) {
      const target = await prisma.user.findUnique({
        where: { id: data.userId },
        select: {
          unitId: true,
          userRoles: {
            where: activeUserRoleWhere(),
            orderBy: { isPrimary: 'desc' },
            select: { unitId: true },
          },
        },
      });
      if (!target) throw Errors.notFound('User');
      await assertActorMayManage(actor, {
        userId: data.userId,
        unitId: target.userRoles[0]?.unitId ?? target.unitId,
      });
    }

    // Claim the blob before the record can reference it (BUG 4). A concurrent
    // discard holds a `DISCARD` claim for the same URL and would otherwise be
    // free to delete it between our probe and our insert. Claiming and releasing
    // inside the transaction serializes on the unique claim row: a discard whose
    // `DISCARD` claim commits first makes this insert conflict and the create
    // fails with no dangling reference; one that arrives after our commit
    // re-probes and finds the record. The claim is released in the same
    // transaction because the committed record is now the durable protection.
    return prisma.$transaction(async (tx) => {
      const claimed = await claimBlobForRecord(data.fileUrl, actor?.id ?? data.userId, tx);
      if (!claimed) {
        throw Errors.conflict(
          'Berkas lampiran sedang diproses pihak lain; unggah ulang berkas tersebut'
        );
      }
      const document = await tx.employeeDocument.create({
        data: {
          userId: data.userId,
          name: data.name,
          type: data.type,
          fileUrl: data.fileUrl,
          expiryDate: data.expiryDate,
          notes: data.notes,
        },
      });
      await releaseBlobClaim(data.fileUrl, actor?.id ?? data.userId, tx);
      return document;
    });
  },

  async findAll(userId: string, actor?: EmployeeDocumentActor) {
    if (actor) {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          unitId: true,
          userRoles: {
            where: activeUserRoleWhere(),
            orderBy: { isPrimary: 'desc' },
            select: { unitId: true },
          },
        },
      });
      if (!target) throw Errors.notFound('User');
      // Same rule as create/delete: only the owner, a personnel administrator
      // in the owner's unit, or a foundation role may read the metadata. Before
      // this check any TEACHER/STAFF could list any user's documents.
      await assertActorMayManage(actor, {
        userId,
        unitId: target.userRoles[0]?.unitId ?? target.unitId,
      });
    }

    return prisma.employeeDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Delete an employee document.
   *
   * Two ordering rules matter here and both used to be wrong:
   *
   *  1. Authorization runs in the service, before anything is removed. Unit
   *     admins could otherwise pass another unit's document id and destroy it
   *     (the route's `authorize(UNIT_ADMIN)` proves a role, not ownership).
   *  2. The database row is deleted FIRST and the backing blob second. Doing
   *     it the other way round meant a failed delete left the record behind
   *     while its file was already gone — unrecoverable. Best-effort cleanup
   *     after a committed delete can at worst leave an orphan blob, which a
   *     later sweep can reclaim.
   */
  async delete(id: string, actor?: EmployeeDocumentActor) {
    const doc = await findDocumentOwnerTarget(id);
    if (!doc) {
      // Nothing to authorize against; preserve the previous not-found
      // behaviour of `prisma.delete` (P2025 -> error).
      return prisma.employeeDocument.delete({ where: { id } });
    }

    if (actor) {
      await assertActorMayManage(actor, {
        userId: doc.userId,
        unitId: doc.user.userRoles[0]?.unitId ?? doc.user.unitId,
      });
    }

    const deleted = await prisma.employeeDocument.delete({ where: { id } });
    // Best-effort, after the row is gone; never fails the request.
    await cleanupBlobBestEffort(doc.fileUrl);
    return deleted;
  },
};
