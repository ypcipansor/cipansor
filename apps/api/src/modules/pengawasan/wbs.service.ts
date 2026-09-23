import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { WbsTargetLevel, WbsStatus, WbsSenderType, Prisma } from '@prisma/client';
import {
  WBS_FORWARD_ROLE_CODES,
  isClosedWbsStatus,
  isWbsForwardRecipientRole,
  wbsAssignmentBucketsForRole,
  type CreatePublicWbsInput,
  type ForwardWbsReportInput,
  type UpdateWbsStatusInput,
  type WbsForwardRoleCode,
} from '@cipansor/shared';
import crypto from 'crypto';
import { generateWbsTrackingToken, verifyWbsTrackingToken } from '@/utils/wbs-token';

// The payloads come from the shared contract, not a local restatement: the
// controller validates with the same Zod schema and the web client types its
// hooks from it, so a shape change lands in one place instead of three.
export type { CreatePublicWbsInput };

/**
 * True when a Prisma write failed because of a `ticket_code` unique violation.
 *
 * Narrow on purpose: only the ticket-code constraint earns a retry. A generic
 * "unique constraint failed" would retry on some other invariant and mask the
 * real error, and any other failure must surface unchanged.
 */
function isTicketCodeCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes('ticket_code');
  return typeof target === 'string' ? target.includes('ticket_code') : true;
}

/** Identity of the staff member acting on a report. */
export interface WbsActor {
  id: string;
  name: string;
  roleCode?: string;
  unitId?: string | null;
}

/**
 * Statuses that close a WBS case to new public messages AND handler comments.
 *
 * `SELESAI` is a resolution and `TIDAK_DAPAT_DITINDAKLANJUTI` is a decision not
 * to act; both end the case, so the thread stops there for both sides. The DB
 * enum is the source of truth for the values (golden rule #2); the web reads
 * the mirror in `@cipansor/shared`, and a unit test pins the two together so a
 * rename on either side fails loudly rather than silently leaving a terminal
 * status writable.
 */
export const CLOSED_WBS_STATUSES: readonly WbsStatus[] = [
  WbsStatus.SELESAI,
  WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI,
];

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
   *
   * The tracking token is persisted only as an HMAC digest (see
   * `utils/wbs-token.ts`); the raw value is returned here, once, and never
   * stored. The ticket code gets a bounded retry on unique collision so a
   * legitimate report is not dropped when the random suffix happens to repeat.
   */
  async createPublicReport(data: CreatePublicWbsInput) {
    const unitId = data.unitId || null;
    const primaryHandlerRole = this.getPrimaryHandlerRole(data.targetLevel, unitId);

    // Resolve the effective anonymity once, then use it for the flag AND both
    // identity fields. Reading `data.isAnonymous` directly for the identity
    // made the default a lie: an omitted flag stored `isAnonymous: true` but
    // still persisted the reporter's name and contact.
    const isAnonymous = data.isAnonymous ?? true;

    const { raw: trackingToken, digest: trackingTokenDigest } = generateWbsTrackingToken();

    // The random suffix is 4 bytes (32 bits, ~4.3B values) made unique by the
    // `wbs_reports_ticket_code_key` index. A collision is rare but possible;
    // retrying the *insert* (never the validation, never a non-unique DB
    // error) turns a dropped report into a fresh code.
    const MAX_ATTEMPTS = 5;
    let report: Awaited<ReturnType<typeof prisma.wbsReport.create>> | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const datePrefix = new Date().toISOString().slice(0, 7).replace('-', '');
      const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const ticketCode = `WBS-${datePrefix}-${randomSuffix}`;
      try {
        report = await prisma.wbsReport.create({
          data: {
            ticketCode,
            trackingToken: trackingTokenDigest,
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
        break;
      } catch (error) {
        if (isTicketCodeCollision(error) && attempt < MAX_ATTEMPTS) continue;
        if (isTicketCodeCollision(error)) {
          throw Errors.internal('Gagal membuat nomor tiket WBS yang unik. Silakan coba lagi.');
        }
        throw error;
      }
    }

    if (!report) {
      throw Errors.internal('Gagal membuat laporan WBS. Silakan coba lagi.');
    }

    return {
      ticketCode: report.ticketCode,
      // The RAW token, not `report.trackingToken` (which is now the stored
      // digest). This is the only time the bearer value is handed out.
      trackingToken,
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
      },
    });

    if (!report || !verifyWbsTrackingToken(trackingToken, report.trackingToken)) {
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

    // The forwarding audit trail is NOT returned to the public surface.
    //
    // `WbsForwardLog` is an *internal* routing log: `reason` is the free-text
    // triage note the forwarding officer writes ("dugaan menyangkut Kepala
    // Sekolah SD IT", "perlu pemeriksaan keuangan"), and the row also carries
    // `forwardedById` / `toUserId` / internal role codes. Handing it to a
    // bearer of the tracking token would leak the shape of the investigation —
    // who is looking at it, and why they routed it where they did — to the
    // reporter and anyone the ticket was shared with. The reporter's own window
    // into the case is the anonymised comment thread; routing stays internal.
    // (Verified 2026-09-22: no internal/role/identity field is exposed here.)
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
    };
  }

  /**
   * Add a public comment from the reporter.
   *
   * Product decision (2026-09-21): a case in a terminal state
   * (`SELESAI` / `TIDAK_DAPAT_DITINDAKLANJUTI`) is closed to new public
   * messages. The reporter keeps read access through the tracking page — the
   * history stays visible — but the two-way thread ends with the resolution, so
   * the record cannot be reopened informally and a closed case cannot be made
   * to look active again.
   *
   * The status check and the write share one transaction and the report row is
   * locked `FOR UPDATE` first, so a handler cannot flip the case to final
   * between the check and the insert: either the comment commits into a
   * still-open case, or the status change waits for it. Checking the status on
   * the pre-transaction read would have left exactly that window.
   */
  async addPublicComment(
    ticketCode: string,
    trackingToken: string,
    message: string,
    attachments?: string[]
  ) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "wbs_reports" WHERE ticket_code = ${ticketCode} FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw Errors.notFound('Laporan WBS tidak ditemukan atau token akses tidak valid');
      }

      const report = await tx.wbsReport.findUnique({
        where: { id: locked[0].id },
        select: {
          id: true,
          trackingToken: true,
          isAnonymous: true,
          reporterName: true,
          status: true,
        },
      });

      if (!report || !verifyWbsTrackingToken(trackingToken, report.trackingToken)) {
        throw Errors.notFound('Laporan WBS tidak ditemukan atau token akses tidak valid');
      }

      if (CLOSED_WBS_STATUSES.includes(report.status)) {
        throw Errors.conflict(
          'Laporan WBS ini sudah ditutup; percakapan lanjutan tidak dapat dikirim.'
        );
      }

      return tx.wbsComment.create({
        data: {
          reportId: report.id,
          senderType: WbsSenderType.REPORTER,
          senderName: report.isAnonymous ? 'Pelapor Anonim' : report.reporterName || 'Pelapor',
          message,
          attachments: attachments ? (attachments as Prisma.InputJsonValue) : undefined,
        },
      });
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
            attachments: true,
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
   * `loadReportInScope`, or the ID becomes a skeleton key into every unit.
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

    // The unit branch matches the report's *routing* as well as its default
    // target level. `forwardReport` can route any report to the unit bucket
    // (`toRole: 'UNIT_ADMIN'`) without naming a person, and that sets
    // `primaryHandlerRole` while leaving `targetLevel` untouched — so a
    // `KEPALA_UNIT` report forwarded to the unit queue matched neither clause
    // and became invisible to the very unit it was routed into. Matching
    // `primaryHandlerRole` is what makes the role-level destination readable;
    // the target-level clause keeps the default STAF/SISWA routing visible.
    return withAssignment({
      unitId,
      OR: [
        { primaryHandlerRole: 'UNIT_ADMIN' },
        { targetLevel: { in: [WbsTargetLevel.STAF_PEGAWAI, WbsTargetLevel.SISWA_SANTRI] } },
      ],
    });
  }

  /**
   * Load a report only if the actor is within its scope.
   *
   * Returns 404 when no such report exists and 403 when it exists but belongs
   * to another unit's chain of handling — the caller cannot otherwise tell a
   * typo from a probe, and the ID alone must never be enough.
   */
  private async loadReportInScope(
    id: string,
    actor: { id?: string; roleCode?: string; unitId?: string | null }
  ) {
    const report = await prisma.wbsReport.findFirst({
      where: { id, ...this.buildScopeWhere(actor) },
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
  ): Promise<{ status: WbsStatus }> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "wbs_reports" WHERE id = ${id} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
    }

    const inScope = await tx.wbsReport.findFirst({
      where: { id, ...this.buildScopeWhere(actor) },
      select: { id: true, status: true },
    });
    if (!inScope) {
      throw Errors.forbidden('Laporan WBS ini berada di luar wewenang peran/unit Anda');
    }
    // Returned from the *locked* read, so a caller that must branch on the
    // terminal state sees the value that will hold at commit.
    return { status: inScope.status };
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
      // The status is returned from the *locked* read, so the terminal check
      // below and the write it guards are made against the state that will hold
      // at commit. Reading `status` from the unlocked `findFirst` underneath
      // would leave exactly the race this closes: a concurrent handler could
      // commit the closure between the check and the update, and the reopen
      // would land anyway.
      const scope = await this.assertReportInScopeTx(tx, id, actor);

      // A terminal status is a one-way door, so the resolution has to arrive
      // with the closure. `updateReportStatus` refuses every later write once
      // closed (including terminal → terminal), so a close submitted without a
      // resolution leaves a closed case whose outcome can never be recorded.
      // The edge schema requires it for HTTP callers; this is the same guard
      // for internal callers that reach the service directly.
      if (isClosedWbsStatus(data.status) && !data.resolution?.trim()) {
        throw Errors.badRequest(
          'Penyelesaian (resolution) wajib diisi ketika laporan ditutup sebagai SELESAI atau TIDAK_DAPAT_DITINDAKLANJUTI.'
        );
      }

      // A terminal case is immutable. Once `SELESAI` /
      // `TIDAK_DAPAT_DITINDAKLANJUTI`, the status, the resolution and the
      // handler note are frozen together — including terminal → terminal,
      // because there is no re-opening endpoint with its own permission and
      // audit trail. Allowing any write here would let a closed report
      // re-enter an active state (or silently rewrite its resolution) even
      // though the public thread is already closed on both sides by
      // `addPublicComment` / `addHandlerComment`. The predicate is the shared
      // `isClosedWbsStatus`, not a second local list that could drift.
      if (isClosedWbsStatus(scope.status)) {
        throw Errors.conflict(
          'Laporan WBS ini sudah ditutup (SELESAI / TIDAK_DAPAT_DITINDAKLANJUTI) dan status/penyelesaiannya tidak dapat diubah lagi.'
        );
      }

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
   * Fetch a candidate forward recipient with the fields eligibility depends on.
   *
   * The role list is resolved with the same effective-role predicate the
   * assignment scope uses (`isActive` + not expired), so a stale or expired
   * grant cannot qualify someone the scope query would then hide the report
   * from.
   *
   * Each assignment's own `unitId` is selected too. `User.unitId` is a single
   * home unit; a person can hold the same role in several units through
   * `UserRoleAssignment.unitId`, and the token that decides `buildScopeWhere`
   * takes its unit from the *active assignment* (`tokenUnitId`), not the user
   * row. Deciding eligibility from `User.unitId` therefore named recipients
   * whose matching assignment was in the report's unit but whose home unit was
   * elsewhere, and the report landed in a queue its new owner could not read.
   */
  private async loadForwardRecipient(toUserId: string) {
    return prisma.user.findUnique({
      where: { id: toUserId },
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
          select: { unitId: true, role: { select: { code: true } } },
        },
      },
    });
  }

  /**
   * The eligibility rules for a named forward recipient, in one place.
   *
   * Called twice: once before the transaction for an early, log-free refusal,
   * and again inside the transaction on the recipient row locked `FOR UPDATE`.
   * The pre-flight pass is a courtesy — it cannot be the decision, because the
   * recipient's account state, roles and unit can all change in the window
   * between it and the write, and acting on that stale read is exactly how a
   * deactivated or role-revoked user was handed a confidential report.
   *
   * The check is made against the same facts `buildScopeWhere` reads, so a
   * recipient who passes here can actually list, read and mutate the report
   * afterwards:
   *
   * - **Foundation destination** (`YAYASAN_PEMBINA`/`PENGAWAS`/`KETUA`): the
   *   recipient needs an effective assignment for the matching role. Those
   *   roles are foundation-scoped, so no unit restricts them.
   * - **Unit destination** (`UNIT_ADMIN`): the recipient needs an effective
   *   assignment for a role in the unit bucket *whose effective unit is the
   *   report's unit*. An assignment with its own unit uses that unit; only an
   *   assignment with no unit falls back to the user's home unit — the same
   *   rule `tokenUnitId` applies when it mints the recipient's token. A
   *   matching `User.unitId` with a mismatching assignment unit is therefore
   *   refused, which is the bug this replaces.
   */
  private assertForwardRecipientEligible(
    recipient: Awaited<ReturnType<WbsService['loadForwardRecipient']>>,
    data: ForwardWbsReportInput,
    reportUnitId: string | null
  ): void {
    if (!recipient || recipient.deletedAt) {
      throw Errors.badRequest('Pengguna tujuan teruskan tidak ditemukan atau telah dihapus.');
    }
    if (!recipient.isActive) {
      throw Errors.badRequest('Pengguna tujuan teruskan tidak aktif.');
    }

    if (data.toRole === 'UNIT_ADMIN') {
      // A unit-level destination is only readable when the report has a unit
      // and the recipient holds the destination role *in that unit* — through
      // an assignment whose effective unit matches. `buildScopeWhere`'s
      // unit-scoped branch keys on the recipient's token unit, which comes from
      // the active assignment, so an assignment with its own unit is judged on
      // that unit and never on the user's home unit instead.
      if (!reportUnitId) {
        throw Errors.badRequest('Laporan tanpa unit tidak dapat diteruskan ke peran tingkat unit.');
      }
      const hasMatchingUnitAssignment = recipient.userRoles.some((assignment) => {
        if (!isWbsForwardRecipientRole(data.toRole, assignment.role.code)) return false;
        const effectiveUnit = assignment.unitId ?? recipient.unitId ?? null;
        return effectiveUnit === reportUnitId;
      });
      if (!hasMatchingUnitAssignment) {
        throw Errors.forbidden(
          'Pengguna tujuan tidak memiliki penugasan peran yang cocok pada unit laporan ini.'
        );
      }
      return;
    }

    // A foundation destination has no unit restriction, so any effective
    // assignment for the matching role qualifies the recipient.
    const matchesDestination = recipient.userRoles.some((assignment) =>
      isWbsForwardRecipientRole(data.toRole, assignment.role.code)
    );
    if (!matchesDestination) {
      throw Errors.badRequest(
        `Pengguna tujuan tidak memiliki peran efektif yang sesuai untuk tujuan ${data.toRole}.`
      );
    }
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

    if (data.toUserId && data.toUserId === actor.id) {
      throw Errors.badRequest('Laporan tidak dapat diteruskan kepada diri sendiri.');
    }

    // Pre-flight eligibility check, for a prompt refusal. The authoritative
    // check runs inside the transaction below, on the locked recipient row.
    if (data.toUserId) {
      this.assertForwardRecipientEligible(
        await this.loadForwardRecipient(data.toUserId),
        data,
        report.unitId ?? null
      );
    }

    return prisma.$transaction(async (tx) => {
      // Scope is re-resolved under the row lock, not just before the
      // transaction. A concurrent forward can move the report between the
      // pre-check and this write; taking the lock first serialises the two,
      // and the scope query then sees the committed routing rather than the
      // stale snapshot the actor was authorised against.
      //
      // The scope read returns the status of the *locked* row, which is the
      // state that will hold at commit. That is what makes the terminal check
      // below a decision rather than a guess: a handler can close the case
      // between the pre-flight scope check and this write, and a forward that
      // landed anyway would append a `WbsForwardLog`, move the routing and post
      // a timeline comment onto a case the board has already ended — the same
      // immutability `updateReportStatus` and `addHandlerComment` enforce. The
      // check is inside the transaction, on the locked row, not a pre-flight
      // outside it.
      const scope = await this.assertReportInScopeTx(tx, id, actor);
      if (isClosedWbsStatus(scope.status)) {
        throw Errors.conflict(
          'Laporan WBS ini sudah ditutup (SELESAI / TIDAK_DAPAT_DITINDAKLANJUTI) dan tidak dapat diteruskan lagi.'
        );
      }

      // The report is now locked, so its unit cannot move under the recipient
      // decision below. Read it fresh rather than reusing the pre-transaction
      // snapshot: the unit and routing that will hold at commit are the ones the
      // eligibility check must be made against.
      const lockedReport = await tx.wbsReport.findUnique({
        where: { id },
        select: { unitId: true, assignedUserId: true, primaryHandlerRole: true },
      });
      if (!lockedReport) {
        throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
      }

      // Lock ordering: report first (above), then recipient, then the
      // recipient's role assignments. Every forward and status/comment path
      // takes the report lock first, so a recipient lock taken strictly after it
      // cannot cycle with another WBS mutation. `BoardSuspensionService` locks
      // the delegate's user row and then its assignment rows in the same order,
      // and every role writer mutates assignments with `UPDATE`/`DELETE`, which
      // takes the row lock implicitly — so this is a compatible lock order with
      // the writers, not a lock only forwarding honours.
      if (data.toUserId) {
        const lockedRecipient = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "users" WHERE id = ${data.toUserId} FOR UPDATE
        `;
        if (lockedRecipient.length !== 1) {
          throw Errors.badRequest('Pengguna tujuan teruskan tidak ditemukan atau telah dihapus.');
        }

        // Lock the recipient's effective-role rows, in a deterministic (uuid)
        // order, *before* reading them.
        //
        // Locking the `users` row does not serialise a `UserRoleAssignment`
        // change: a concurrent revocation deletes/updates the assignment row,
        // which is a different row and takes a different lock. Without this,
        // the eligibility decision below is made on a read the revocation can
        // invalidate before the forward commits, and the report ends up routed
        // to someone whose role is gone — the lost update the review asked to
        // close. Holding these rows `FOR UPDATE` makes the revocation wait
        // until the forward finishes; the read that follows therefore sees
        // either the assignment as it was when the lock was taken (forward
        // committed first) or, when the revocation committed first and released
        // the lock, its removal — and the eligibility check refuses. An insert
        // of a *new* assignment cannot be locked and cannot remove a role, so
        // it cannot make an eligible recipient ineligible; the
        // organ-exclusivity trigger remains the backstop for a conflicting
        // insert.
        await tx.$queryRaw`
          SELECT id FROM "user_role_assignments" WHERE user_id = ${data.toUserId} ORDER BY id FOR UPDATE
        `;

        const recipient = await tx.user.findUnique({
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
              select: { unitId: true, role: { select: { code: true } } },
            },
          },
        });
        this.assertForwardRecipientEligible(recipient, data, lockedReport.unitId ?? null);
      }

      await tx.wbsForwardLog.create({
        data: {
          reportId: id,
          forwardedById: actor.id,
          fromRole: actor.roleCode || lockedReport.primaryHandlerRole,
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

      // The handler's *own* timeline entry is a neutral status note. The
      // internal routing reason stays in `WbsForwardLog.reason` (above), which
      // `getPublicTracking` no longer returns: `WbsComment` rows of type
      // HANDLER are rendered on the reporter's public page, so putting
      // `Alasan: <internal triage note>` here published the investigation's
      // reasoning to whoever held the tracking token. The action (that the case
      // moved to the next tier) is still visible; the why stays internal.
      await tx.wbsComment.create({
        data: {
          reportId: id,
          senderType: WbsSenderType.HANDLER,
          senderId: actor.id,
          senderName: `${actor.name} (${actor.roleCode || 'Pemeriksa'})`,
          message: `[Laporan Diteruskan ke ${data.toRole}] Laporan dialihkan ke tingkat penanganan berikutnya.`,
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
    //
    // A terminal case is immutable for BOTH sides of the thread. A public reply
    // is refused once `SELESAI` / `TIDAK_DAPAT_DITINDAKLANJUTI`, and a handler
    // comment is refused too: it is stored as `WbsSenderType.HANDLER`, which
    // `getPublicTracking` renders on the reporter's page (anonymised, but
    // visible). Letting a handler append after closure would therefore reopen
    // the public thread the reporter can no longer answer, and make a closed
    // case look active again — exactly what the public-comment rule exists to
    // prevent. The status is read under the same `FOR UPDATE` lock, so a
    // handler cannot close the case between the check and the insert.
    return prisma.$transaction(async (tx) => {
      const report = await this.assertReportInScopeTx(tx, id, actor);

      if (CLOSED_WBS_STATUSES.includes(report.status)) {
        throw Errors.conflict(
          'Laporan WBS ini sudah ditutup; catatan pemeriksa tidak dapat ditambahkan.'
        );
      }

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
