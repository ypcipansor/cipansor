import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { WbsCategory, WbsTargetLevel, WbsStatus, WbsSenderType, Prisma } from '@prisma/client';
import crypto from 'crypto';

export interface CreatePublicWbsInput {
  unitId?: string | null;
  category: WbsCategory;
  targetLevel: WbsTargetLevel;
  targetName?: string;
  subject: string;
  description: string;
  location?: string;
  incidentDate?: string | null;
  isAnonymous?: boolean;
  reporterName?: string;
  reporterContact?: string;
  attachments?: string[];
}

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
   */
  private getPrimaryHandlerRole(targetLevel: WbsTargetLevel): string {
    switch (targetLevel) {
      case 'PENGURUS_YAYASAN':
        return 'YAYASAN_PENGAWAS';
      case 'PENGAWAS_YAYASAN':
        return 'YAYASAN_PEMBINA';
      case 'KEPALA_UNIT':
        return 'YAYASAN_KETUA';
      case 'STAF_PEGAWAI':
      case 'SISWA_SANTRI':
        return 'UNIT_ADMIN';
      default:
        return 'YAYASAN_PENGAWAS';
    }
  }

  /**
   * Create public anonymous/identified WBS report.
   */
  async createPublicReport(data: CreatePublicWbsInput) {
    const primaryHandlerRole = this.getPrimaryHandlerRole(data.targetLevel);

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
        unitId: data.unitId || null,
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
        attachments: data.attachments ? (data.attachments as any) : undefined,
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
      comments: report.comments,
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
        attachments: attachments ? (attachments as any) : undefined,
      },
    });
  }

  /**
   * Query WBS reports for authenticated staff/governance according to role hierarchy.
   */
  async getReportsForUser(actor: { roleCode?: string; unitId?: string | null }) {
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
   */
  private buildScopeWhere(actor: {
    roleCode?: string;
    unitId?: string | null;
  }): Prisma.WbsReportWhereInput {
    const role = actor.roleCode || '';
    const unitId = actor.unitId;

    if (role === 'SUPER_ADMIN' || role === 'YAYASAN_PEMBINA') {
      return {};
    }
    if (role === 'YAYASAN_PENGAWAS') {
      return {
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
      };
    }
    if (
      ['YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA'].includes(role)
    ) {
      return {
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
      };
    }
    return {
      targetLevel: { in: [WbsTargetLevel.STAF_PEGAWAI, WbsTargetLevel.SISWA_SANTRI] },
      ...(unitId ? { unitId } : {}),
    };
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
    actor: { roleCode?: string; unitId?: string | null },
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
   * Get WBS report details by ID for handler.
   */
  async getReportById(id: string, actor: { roleCode?: string; unitId?: string | null }) {
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
  async updateReportStatus(
    id: string,
    data: {
      status: WbsStatus;
      resolution?: string;
      handlerNote?: string;
    },
    actor: WbsActor
  ) {
    const report = await this.loadReportInScope(id, actor);

    const updated = await prisma.wbsReport.update({
      where: { id },
      data: {
        status: data.status,
        resolution: data.resolution !== undefined ? data.resolution : report.resolution,
        assignedUserId: actor.id,
      },
    });

    if (data.handlerNote) {
      await prisma.wbsComment.create({
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
  }

  /**
   * Forward / Refer report to another role e.g. from Pengawas to Pengurus or vice versa.
   */
  async forwardReport(
    id: string,
    data: {
      toRole: string;
      toUserId?: string;
      reason: string;
    },
    actor: WbsActor
  ) {
    // Scope is resolved before the transaction so an out-of-scope caller is
    // refused without writing a forward log.
    const report = await this.loadReportInScope(id, actor);

    return prisma.$transaction(async (tx) => {
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
    await this.loadReportInScope(id, actor);

    return prisma.wbsComment.create({
      data: {
        reportId: id,
        senderType: WbsSenderType.HANDLER,
        senderId: actor.id,
        senderName: `${actor.name} (${actor.roleCode || 'Pemeriksa'})`,
        message,
        attachments: attachments ? (attachments as any) : undefined,
      },
    });
  }
}

export const wbsService = new WbsService();
