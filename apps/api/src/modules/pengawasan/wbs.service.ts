import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { WbsCategory, WbsTargetLevel, WbsStatus, WbsSenderType } from '@prisma/client';
import crypto from 'crypto';

export interface CreatePublicWbsInput {
  unitId?: string;
  category: WbsCategory;
  targetLevel: WbsTargetLevel;
  targetName?: string;
  subject: string;
  description: string;
  location?: string;
  incidentDate?: string;
  isAnonymous?: boolean;
  reporterName?: string;
  reporterContact?: string;
  attachments?: string[];
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
        isAnonymous: data.isAnonymous ?? true,
        reporterName: data.isAnonymous ? null : (data.reporterName || null),
        reporterContact: data.isAnonymous ? null : (data.reporterContact || null),
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
  async addPublicComment(ticketCode: string, trackingToken: string, message: string, attachments?: string[]) {
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
        senderName: report.isAnonymous ? 'Pelapor Anonim' : (report.reporterName || 'Pelapor'),
        message,
        attachments: attachments ? (attachments as any) : undefined,
      },
    });
  }

  /**
   * Query WBS reports for authenticated staff/governance according to role hierarchy.
   */
  async getReportsForUser(actor: { roleCode?: string; unitId?: string | null }) {
    const role = actor.roleCode || '';
    const unitId = actor.unitId;

    let whereCondition: any = {};

    if (role === 'SUPER_ADMIN' || role === 'YAYASAN_PEMBINA') {
      // Pembina has access to all reports (especially PENGAWAS_YAYASAN targets & CC oversight)
      whereCondition = {};
    } else if (role === 'YAYASAN_PENGAWAS') {
      // Pengawas handles PENGURUS_YAYASAN targets, plus CC visibility over KEPALA_UNIT, STAF, SISWA
      whereCondition = {
        OR: [
          { primaryHandlerRole: 'YAYASAN_PENGAWAS' },
          { targetLevel: { in: ['PENGURUS_YAYASAN', 'KEPALA_UNIT', 'STAF_PEGAWAI', 'SISWA_SANTRI'] } },
        ],
      };
    } else if (['YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA'].includes(role)) {
      // Pengurus handles KEPALA_UNIT targets, plus CC visibility over STAF and SISWA
      whereCondition = {
        OR: [
          { primaryHandlerRole: 'YAYASAN_KETUA' },
          { targetLevel: { in: ['KEPALA_UNIT', 'STAF_PEGAWAI', 'SISWA_SANTRI'] } },
        ],
      };
    } else {
      // Unit heads / Unit admins handle STAF_PEGAWAI and SISWA_SANTRI in their unit
      whereCondition = {
        targetLevel: { in: ['STAF_PEGAWAI', 'SISWA_SANTRI'] },
        ...(unitId ? { unitId } : {}),
      };
    }

    return prisma.wbsReport.findMany({
      where: whereCondition,
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
   * Get WBS report details by ID for handler.
   */
  async getReportById(id: string) {
    const report = await prisma.wbsReport.findUnique({
      where: { id },
      include: {
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
      },
    });

    if (!report) {
      throw Errors.notFound(`Laporan WBS dengan ID ${id} tidak ditemukan`);
    }

    return report;
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
    user: { id: string; name: string }
  ) {
    const report = await prisma.wbsReport.findUnique({ where: { id } });
    if (!report) {
      throw Errors.notFound(`Laporan WBS tidak ditemukan`);
    }

    const updated = await prisma.wbsReport.update({
      where: { id },
      data: {
        status: data.status,
        resolution: data.resolution !== undefined ? data.resolution : report.resolution,
        assignedUserId: user.id,
      },
    });

    if (data.handlerNote) {
      await prisma.wbsComment.create({
        data: {
          reportId: id,
          senderType: WbsSenderType.HANDLER,
          senderId: user.id,
          senderName: `${user.name} (Pemeriksa)`,
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
    actor: { id: string; name: string; roleCode?: string }
  ) {
    const report = await prisma.wbsReport.findUnique({ where: { id } });
    if (!report) {
      throw Errors.notFound(`Laporan WBS tidak ditemukan`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create Forward Log
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

      // 2. Update Primary Handler Role on Report
      const updated = await tx.wbsReport.update({
        where: { id },
        data: {
          primaryHandlerRole: data.toRole,
          assignedUserId: data.toUserId || null,
        },
      });

      // 3. Add system comment in WBS history
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
    user: { id: string; name: string; roleCode?: string }
  ) {
    const report = await prisma.wbsReport.findUnique({ where: { id } });
    if (!report) {
      throw Errors.notFound(`Laporan WBS tidak ditemukan`);
    }

    return prisma.wbsComment.create({
      data: {
        reportId: id,
        senderType: WbsSenderType.HANDLER,
        senderId: user.id,
        senderName: `${user.name} (${user.roleCode || 'Pemeriksa'})`,
        message,
        attachments: attachments ? (attachments as any) : undefined,
      },
    });
  }
}

export const wbsService = new WbsService();
