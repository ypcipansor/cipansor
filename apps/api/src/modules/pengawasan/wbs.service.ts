import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { WbsTargetLevel, WbsStatus, WbsSenderType, Prisma } from '@prisma/client';
import {
  WBS_FORWARD_ROLE_CODES,
  isWbsForwardRecipientRole,
  wbsAssignmentBucketsForRole,
  type CreatePublicWbsInput,
  type ForwardWbsReportInput,
  type UpdateWbsStatusInput,
  type WbsForwardRoleCode,
} from '@cipansor/shared';
import crypto from 'crypto';

// The payloads come from the shared contract, not a local restatement: the
// controller validates with the same Zod schema and the web client types its
// hooks from it, so a shape change lands in one place instead of three.
export type { CreatePublicWbsInput };

/** Identity of the staff member acting on a report. */
export interface WbsActor {
  id: string;
  name: string;
  roleCode?: string;
  unitId?: string | null;
}

export class WbsService {
  /**
   * Determine primary handler role based on target level.
   *
   * Every value returned must be a role whose scope query can actually match
   * the report it is handed, or the report enters a queue no handler reads.
   * That was exactly the case for `STAF_PEGAWAI` / `SISWA_SANTRI` reports filed
   * without a unit: they were routed to `UNIT_ADMIN`, but the unit-handler
   * scope requires the actor's unit to equal the report's, and a report with
   * `unitId: null` matches no unit — so it was visible to nobody.
   *
   * The routing therefore depends on whether the report *has* a unit. With a
   * unit, the unit's administrator handles it as before. Without one, the
   * foundation oversight role (`YAYASAN_PENGAWAS`, whose scope covers every
   * staff/student report by target level) is the fallback, so the report is
   * never stored into an empty queue.
   */
  private getPrimaryHandlerRole(targetLevel: WbsTargetLevel, unitId?: string | null): string {
    switch (targetLevel) {
      case 'PENGURUS_YAYASAN':
        return 'YAYASAN_PENGAWAS';
      case 'PENGAWAS_YAYASAN':
        return 'YAYASAN_PEMBINA';
      case 'KEPALA_UNIT':
        return 'YAYASAN_KETUA';
      case 'STAF_PEGAWAI':
      case 'SISWA_SANTRI':
        return unitId ? 'UNIT_ADMIN' : 'YAYASAN_PENGAWAS';
      default:
        return 'YAYASAN_PENGAWAS';
    }
  }

  /**
   * Create public anonymous/identified WBS report.
   */
  async createPublicReport(data: CreatePublicWbsInput) {
    const unitId = data.unitId || null;
    const primaryHandlerRole = this.getPrimaryHandlerRole(data.targetLevel, unitId);

    // Generate ticketCode e.g. WBS-YYYYMM-XXXXX
    const datePrefix = new Date().toISOString().slice(0, 7).replace('-', '');
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketCode = `WBS-${datePrefix}-${randomSuffix}`;
    const trackingToken = crypto.randomBytes(16).toString('hex');

    // Resolve the effective anonymity once, then use it for the flag AND both
    // identity fields. Reading `data.isAnonymous` directly for the identity
    // made the default a lie: an omitted flag stored `isAnonymous: true` but
    // still persisted the reporter's name and contact.
    const isAnonymous = data.isAnonymous ?? true;

    const report = await prisma.wbsReport.create({
      data: {
        ticketCode,
        trackingToken,
        unitId,
        category: data.category,
        targetLevel: data.targetLevel,
        targetName: data.targetName || null,
        subject: data.subject,
        description: data.description,
        location: data.location || null,
        incidentDate: data.incidentDate ? new Date(data.incidentDate) : null,
        isAnonymous,
        reporterName: isAnonymous ? null : data.reporterName || null,
        reporterContact: isAnonymous ? null : data.reporterContact || null,
        attachments: data.attachments ? (data.attachments as Prisma.InputJsonValue) : undefined,
        status: WbsStatus.DIAJUKAN,
        primaryHandlerRole,
      },
      include: {
        unit: { select: { id: true, name: true } },
      },
    });

    return {
      ticketCode: report.ticketCode,
      trackingToken: report.trackingToken,
      category: report.category,
      targetLevel: report.targetLevel,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  /**
   * Get public tracking status and anonymous conversation history.
   */
  async getPublicTracking(ticketCode: string, trackingToken: string) {
    const report = await prisma.wbsReport.findUnique({
      where: { ticketCode },
      include: {
        unit: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderType: true,
            senderName: true,
            message: true,
            attachments: true,
            createdAt: true,
          },
        },
        forwardLogs: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromRole: true,
            toRole: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!report || report.trackingToken !== trackingToken) {
      throw Errors.notFound('Laporan WBS tidak ditemukan atau token akses tidak valid');
    }

    // The public tracking page is read by whoever holds the ticket code — the
    // reporter, and anyone they shared it with. `senderName` on a handler
    // comment was written as `${name} (${roleCode})`, which prints the officer's
    // identity and their position to that audience. A confidential channel
    // protects the reporter; it should not expose the staff member answering
    // them either, so public replies are attributed to the team.
    const comments = report.comments.map((comment) =>
      comment.senderType === WbsSenderType.HANDLER
        ? { ...comment, senderName: 'Tim Pemeriksa' }
        : comment
    );

    return {
      ticketCode: report.ticketCode,
      category: report.category,
      targetLevel: report.targetLevel,
      targetName: report.targetName,
      unitName: report.unit?.name || 'Yayasan Pusat',
      subject: report.subject,
      description: report.description,
      status: report.status,
      resolution: report.resolution,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      comments,
      forwardTimeline: report.forwardLogs,
    };
  }

  /**
   * Add public comment from reporter.
   */
  async addPublicComment(
    ticketCode: string,
    trackingToken: string,
    message: string,
    attachments?: string[]
  ) {
    const report = await prisma.wbsReport.findUnique({
      where: { ticketCode },
      select: { id: true, trackingToken: true, isAnonymous: true, reporterName: true },
    });

    if (!report || report.trackingToken !== trackingToken) {
      throw Errors.notFound('Laporan WBS tidak ditemukan atau token akses tidak valid');
    }

    return prisma.wbsComment.create({
      data: {
        reportId: report.id,
        senderType: WbsSenderType.REPORTER,
        senderName: report.isAnonymous ? 'Pelapor Anonim' : report.reporterName || 'Pelapor',
        message,
        attachments: attachments ? (attachments as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Query WBS reports for authenticated staff/governance according to role hierarchy.
   */
  async getReportsForUser(actor: { id?: string; roleCode?: string; unitId?: string | null }) {
    return prisma.wbsReport.findMany({
      where: this.buildScopeWhere(actor),
      include: {
        unit: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderType: true,
            senderName: true,
            message: true,
            createdAt: true,
          },
        },
        forwardLogs: {
          orderBy: { createdAt: 'asc' },
          include: {
            forwardedBy: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The single definition of "which reports may this actor see".
   *
   * Used for the list AND for the per-report authorization below, so the two
   * can never disagree — a report hidden from the list must also be refused by
   * `getReportById`, or the ID becomes a skeleton key into every unit.
   *
   * Governance roles see the foundation; unit-scoped handlers see only reports
   * whose unit is their own.
   *
   * A unit-scoped role with no `unitId` gets the impossible predicate, not an
   * unfiltered one. The final branch used to spread `...(unitId ? { unitId }
   * : {})`, so a principal/admin whose token carried no unit silently read and
   * mutated every unit's staff and student reports — the filter it was supposed
   * to add simply vanished. Dropping the `unitId` term is only ever safe when
   * the role is foundation-wide, which the branches above already handled.
   *
   * **The assignment term is role-bound and unit-bound, not a bare OR.** It
   * used to be `{ assignedUserId: actor.id }` added unconditionally, which
   * made a named assignment a grant independent of the role the request
   * carried: an account holding both a foundation role and a unit role could
   * be handed a confidential report as Pengawas, then switch its active token
   * to the unit role and still read and mutate the case. The term now also
   * requires the report's current routing (`primaryHandlerRole`) to be a
   * destination this actor's active role may hold, and — for the unit-level
   * destination — that the assignment lives inside the actor's own unit.
   */
  private buildScopeWhere(actor: {
    roleCode?: string;
    unitId?: string | null;
    id?: string;
  }): Prisma.WbsReportWhereInput {
    const role = actor.roleCode || '';
    const unitId = actor.unitId;

    // A report forwarded to a named person must stay readable by that person —
    // `forwardReport` stores the assignee in `assignedUserId`, and before this
    // term existed the explicitly designated handler could be locked out of the
    // report assigned to them. What it must NOT be is a grant that outlives the
    // role that justified it, so the term is derived from the actor's *active*
    // role: only the buckets that role may be assigned into are matched, and a
    // unit-level bucket additionally requires the report to be in this actor's
    // unit. An actor with no unit therefore has no assignment term at all, and
    // never reaches the impossible-predicate branch below with a way around it.
    const buckets = wbsAssignmentBucketsForRole(role);
    const assignmentTerms: Prisma.WbsReportWhereInput[] = [];
    if (actor.id && buckets.length > 0) {
      const foundationBuckets = buckets.filter((bucket) => bucket !== 'UNIT_ADMIN');
      if (foundationBuckets.length > 0) {
        assignmentTerms.push({
          assignedUserId: actor.id,
          primaryHandlerRole: { in: foundationBuckets },
        });
      }
      if (unitId && buckets.includes('UNIT_ADMIN')) {
        assignmentTerms.push({
          assignedUserId: actor.id,
          primaryHandlerRole: 'UNIT_ADMIN',
          unitId,
        });
      }
    }

    const withAssignment = (scope: Prisma.WbsReportWhereInput): Prisma.WbsReportWhereInput => {
      // An empty scope already means "the whole foundation" — OR-ing an
      // assignment term into it changes nothing, and replacing it with the
      // term would wrongly narrow a Pembina to only the reports named to them.
      if (Object.keys(scope).length === 0) return {};
      if (assignmentTerms.length === 0) return scope;
      return { OR: [scope, ...assignmentTerms] };
    };

    if (role === 'SUPER_ADMIN' || role === 'YAYASAN_PEMBINA') {
      return {};
    }
    if (role === 'YAYASAN_PENGAWAS') {
      return withAssignment({
        OR: [
          { primaryHandlerRole: 'YAYASAN_PENGAWAS' },
          {
            targetLevel: {
              in: [
                WbsTargetLevel.PENGURUS_YAYASAN,
                WbsTargetLevel.KEPALA_UNIT,
                WbsTargetLevel.STAF_PEGAWAI,
                WbsTargetLevel.SISWA_SANTRI,
              ],
            },
          },
        ],
      });
    }
    if (
      ['YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA'].includes(role)
    ) {
      return withAssignment({
        OR: [
          { primaryHandlerRole: 'YAYASAN_KETUA' },
          {
            targetLevel: {
              in: [
                WbsTargetLevel.KEPALA_UNIT,
                WbsTargetLevel.STAF_PEGAWAI,
                WbsTargetLevel.SISWA_SANTRI,
              ],
            },
          },
        ],
      });
    }
    // A unit-scoped role with no unit has no reports it may see. Returning the
    // unscoped branch here (which the spread produced by omitting `unitId`)
    // would hand it the whole foundation; an empty `id IN ()` set matches
    // nothing on every query that consumes this scope — list, detail, status,
    // forward and comment — so the fail-closed decision is made once. No
    // assignment term is added ahead of it: a unitless actor cannot own a
    // unit-level assignment, and the foundation buckets are not theirs to hold.
    if (!unitId) {
      return { id: { in: [] } };
    }

    return withAssignment({
      targetLevel: { in: [WbsTargetLevel.STAF_PEGAWAI, WbsTargetLevel.SISWA_SANTRI] },
      unitId,
    });
  }

  /**
   * Load a report only if the actor is within its scope.
   *
   * Returns 404 when no such report exists and 403 when it exists but belongs
   * to another unit's chain of handling — the caller cannot otherwise tell a
   * typo from a probe, and the ID alone must never be enough.
   */
  private async loadReportInScope<T extends Prisma.WbsReportInclude | undefined = undefined>(
    id: string,
    actor: { id?: string; roleCode?: string; unitId?: string | null },
    include?: T
  ) {
    const report = await prisma.wbsReport.findFirst({
      where: { id, ...this.buildScopeWhere(actor) },
      ...(include ? { include } : {}),
    });

    if (!report) {
      const exists = await prisma.wbsReport.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) {
        throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
      }
      throw Errors.forbidden('Laporan WBS ini berada di luar wewenang peran/unit Anda');
    }

    return report;
  }

  /**
   * Re-assert scope *inside* a transaction, with the report row locked.
   *
   * `loadReportInScope` runs before the transaction opens, which leaves the
   * window the caller asked about: a forward can commit between that check and
   * the write, moving the report to a destination the actor's role may no
   * longer hold. Because the scope term is now bound to `primaryHandlerRole`
   * and unit, that window would otherwise let a role switch plus a concurrent
   * forward open or close access with a stale decision.
   *
   * `SELECT … FOR UPDATE` serialises against a concurrent `forwardReport`, which
   * takes the same lock first; a blocked caller re-reads the committed routing
   * when it proceeds, and the scope query that follows sees the state that will
   * actually hold at commit. The lock is taken before the row is read, so every
   * mutation path (status, forward, comment) resolves scope and writes in one
   * order.
   */
  private async assertReportInScopeTx(
    tx: Prisma.TransactionClient,
    id: string,
    actor: { id?: string; roleCode?: string; unitId?: string | null }
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "wbs_reports" WHERE id = ${id} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
    }

    const inScope = await tx.wbsReport.findFirst({
      where: { id, ...this.buildScopeWhere(actor) },
      select: { id: true },
    });
    if (!inScope) {
      throw Errors.forbidden('Laporan WBS ini berada di luar wewenang peran/unit Anda');
    }
  }

  /**
   * Get WBS report details by ID for handler.
   */
  async getReportById(
    id: string,
    actor: { id?: string; roleCode?: string; unitId?: string | null }
  ) {
    return this.loadReportInScope(id, actor, {
      unit: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, name: true } },
        },
      },
      forwardLogs: {
        orderBy: { createdAt: 'asc' },
        include: {
          forwardedBy: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
        },
      },
    });
  }

  /**
   * Update report status (DIAJUKAN, DALAM_PENYELIDIKAN, DITINDAKLANJUTI, SELESAI, TIDAK_DAPAT_DITINDAKLANJUTI).
   */
  async updateReportStatus(id: string, data: UpdateWbsStatusInput, actor: WbsActor) {
    // The status change and the handler's note are one event: a note that
    // explains a transition no reader can find in the history is worse than no
    // note, and a status that moved without its audit trail is untraceable.
    // Both writes therefore commit together or not at all — a failed comment
    // used to leave the report advanced but its history silent.
    //
    // Scope is re-resolved inside the transaction, under the row lock, rather
    // than only before it: a forward committed in the gap can move the report
    // to a destination the actor's active role may not hold, and the stale
    // pre-check would have allowed the mutation anyway.
    return prisma.$transaction(async (tx) => {
      await this.assertReportInScopeTx(tx, id, actor);

      const report = await tx.wbsReport.findFirst({
        where: { id },
        select: { assignedUserId: true, resolution: true },
      });
      if (!report) {
        throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
      }

      // Claim the report only if nobody holds it yet, in the same statement
      // that reads the column.
      //
      // The old code wrote `assignedUserId: report.assignedUserId ?? actor.id`
      // from a row loaded *before* the transaction. A `forward toUserId` that
      // committed in between was invisible to that read, so the status update
      // stamped `actor.id` over the freshly named owner — a lost update, and
      // the case silently moved back to whoever ticked the next box. A
      // conditional `updateMany` filtered on `assignedUserId: null` matches
      // zero rows once a forward has claimed the report, and the status write
      // below never mentions the column, so a concurrent assignment survives.
      if (!report.assignedUserId) {
        await tx.wbsReport.updateMany({
          where: { id, assignedUserId: null },
          data: { assignedUserId: actor.id },
        });
      }

      const updated = await tx.wbsReport.update({
        where: { id },
        data: {
          status: data.status,
          resolution: data.resolution !== undefined ? data.resolution : report.resolution,
        },
      });

      if (data.handlerNote) {
        await tx.wbsComment.create({
          data: {
            reportId: id,
            senderType: WbsSenderType.HANDLER,
            senderId: actor.id,
            senderName: `${actor.name} (Pemeriksa)`,
            message: `[Status Diperbarui ke ${data.status}] ${data.handlerNote}`,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Forward / Refer report to another role e.g. from Pengawas to Pengurus or vice versa.
   */
  async forwardReport(id: string, data: ForwardWbsReportInput, actor: WbsActor) {
    // Scope is resolved before the transaction so an out-of-scope caller is
    // refused without writing a forward log.
    const report = await this.loadReportInScope(id, actor);

    // The shared schema already narrows `toRole` at the edge; this is the same
    // guard for callers that reach the service directly (internal jobs, other
    // modules). An unrecognised role here means the report is routed to a queue
    // no role's scope query matches, and it disappears from every handler's
    // list — silent, and indistinguishable from "nothing to do".
    if (!(WBS_FORWARD_ROLE_CODES as readonly string[]).includes(data.toRole)) {
      throw Errors.badRequest(
        `Peran tujuan teruskan tidak sah: ${data.toRole}. Pilih salah satu dari ${WBS_FORWARD_ROLE_CODES.join(', ')}.`
      );
    }

    // A named recipient must actually be able to hold the destination role.
    // `buildScopeWhere` grants the `assignedUserId` read access unconditionally,
    // so before this check the caller could name any user — the report's own
    // subject, an unrelated staff member, a deleted account — and hand them the
    // case regardless of role or unit.
    if (data.toUserId) {
      if (data.toUserId === actor.id) {
        throw Errors.badRequest('Laporan tidak dapat diteruskan kepada diri sendiri.');
      }

      const recipient = await prisma.user.findUnique({
        where: { id: data.toUserId },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
          unitId: true,
          userRoles: {
            where: {
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { role: { select: { code: true } } },
          },
        },
      });

      if (!recipient || recipient.deletedAt) {
        throw Errors.badRequest('Pengguna tujuan teruskan tidak ditemukan atau telah dihapus.');
      }
      if (!recipient.isActive) {
        throw Errors.badRequest('Pengguna tujuan teruskan tidak aktif.');
      }

      const recipientRoleCodes = recipient.userRoles.map((ur) => ur.role.code);
      const matchesDestination = recipientRoleCodes.some((code) =>
        isWbsForwardRecipientRole(data.toRole, code)
      );
      if (!matchesDestination) {
        throw Errors.badRequest(
          `Pengguna tujuan tidak memiliki peran efektif yang sesuai untuk tujuan ${data.toRole}.`
        );
      }

      // A unit-level destination must stay inside the report's unit. A
      // foundation-wide recipient has no unit restriction, but a KEPALA_UNIT /
      // UNIT_ADMIN named from another unit would otherwise gain access to a
      // report its own scope query hides from it.
      if (data.toRole === 'UNIT_ADMIN') {
        if (!recipient.unitId) {
          throw Errors.badRequest(
            'Pengguna tujuan tingkat unit harus terikat pada satu unit organisasi.'
          );
        }
        const reportUnitId = report.unitId ?? null;
        if (!reportUnitId) {
          throw Errors.badRequest(
            'Laporan tanpa unit tidak dapat diteruskan ke peran tingkat unit.'
          );
        }
        if (recipient.unitId !== reportUnitId) {
          throw Errors.forbidden(
            'Pengguna tujuan berada di unit yang berbeda dengan unit laporan.'
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      // Scope is re-resolved under the row lock, not just before the
      // transaction. A concurrent forward can move the report between the
      // pre-check and this write; taking the lock first serialises the two,
      // and the scope query then sees the committed routing rather than the
      // stale snapshot the actor was authorised against.
      await this.assertReportInScopeTx(tx, id, actor);

      await tx.wbsForwardLog.create({
        data: {
          reportId: id,
          forwardedById: actor.id,
          fromRole: actor.roleCode || report.primaryHandlerRole,
          toRole: data.toRole,
          toUserId: data.toUserId || null,
          reason: data.reason,
        },
      });

      const updated = await tx.wbsReport.update({
        where: { id },
        data: {
          primaryHandlerRole: data.toRole,
          assignedUserId: data.toUserId || null,
        },
      });

      await tx.wbsComment.create({
        data: {
          reportId: id,
          senderType: WbsSenderType.HANDLER,
          senderId: actor.id,
          senderName: `${actor.name} (${actor.roleCode || 'Pemeriksa'})`,
          message: `[Laporan Diteruskan ke ${data.toRole}] Alasan: ${data.reason}`,
        },
      });

      return updated;
    });
  }

  /**
   * Add handler internal/external comment.
   */
  async addHandlerComment(
    id: string,
    message: string,
    attachments: string[] | undefined,
    actor: WbsActor
  ) {
    // Comment is the third mutation path, so it takes the same lock and
    // re-resolves the same scope before writing — otherwise a role switch plus
    // a concurrent forward would let a comment land on a case the actor no
    // longer holds.
    return prisma.$transaction(async (tx) => {
      await this.assertReportInScopeTx(tx, id, actor);

      return tx.wbsComment.create({
        data: {
          reportId: id,
          senderType: WbsSenderType.HANDLER,
          senderId: actor.id,
          senderName: `${actor.name} (${actor.roleCode || 'Pemeriksa'})`,
          message,
          attachments: attachments ? (attachments as Prisma.InputJsonValue) : undefined,
        },
      });
    });
  }
}

export const wbsService = new WbsService();
