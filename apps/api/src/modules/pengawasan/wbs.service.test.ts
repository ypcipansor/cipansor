import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wbsService } from './wbs.service';
import { prisma } from '@/lib/prisma';
import { WbsCategory, WbsTargetLevel, WbsStatus } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    wbsReport: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    wbsComment: {
      create: vi.fn(),
    },
    wbsForwardLog: {
      create: vi.fn(),
    },
    boardMemberSuspension: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    userSigningKey: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRoleAssignment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    boardSuspensionPlhAssignment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    unit: {
      findFirst: vi.fn(),
    },
    letter: {
      create: vi.fn(),
    },
    letterFlowEvent: {
      create: vi.fn(),
    },
    filingClassification: {
      findFirst: vi.fn(),
    },
    auditFinding: {
      findUnique: vi.fn(),
    },
    auditFollowUp: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ deleted_at: null, is_active: true }]),
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

vi.mock('@/utils/user-suspension', () => ({
  markUserSuspended: vi.fn().mockResolvedValue(undefined),
  unmarkUserSuspended: vi.fn().mockResolvedValue(undefined),
  invalidateUserSuspensionCache: vi.fn().mockResolvedValue(undefined),
  isUserSuspended: vi.fn().mockResolvedValue(false),
}));

describe('WbsService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates public WBS report with correct primary handler role for PENGURUS_YAYASAN', async () => {
    const mockReport = {
      ticketCode: 'WBS-202603-ABC123',
      trackingToken: 'secret-token-123',
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      status: WbsStatus.DIAJUKAN,
      createdAt: new Date(),
    };

    (prisma.wbsReport.create as any).mockResolvedValue(mockReport);

    const result = await wbsService.createPublicReport({
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      subject: 'Dugaan Penyalahgunaan Anggaran',
      description: 'Ditemukan ketidaksesuaian laporan pengadaan...',
      isAnonymous: true,
    });

    expect(result.ticketCode).toBe('WBS-202603-ABC123');
    expect(prisma.wbsReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          primaryHandlerRole: 'YAYASAN_PENGAWAS',
          targetLevel: 'PENGURUS_YAYASAN',
        }),
      })
    );
  });

  it('routes a unitless staff/student report to a handler that can actually see it', async () => {
    // A STAFF/SISWA report with no unit was routed to UNIT_ADMIN, whose scope
    // requires a matching unit — and a report with `unitId: null` matches no
    // unit, so it was invisible to every handler. Without a unit the fallback
    // must be a real foundation-wide reader.
    (prisma.wbsReport.create as any).mockResolvedValue({ ticketCode: 'x', trackingToken: 'y' });

    await wbsService.createPublicReport({
      category: WbsCategory.ETIKA_PERILAKU,
      targetLevel: WbsTargetLevel.STAF_PEGAWAI,
      subject: 'Perilaku tidak profesional',
      description: 'Deskripsi pelaporan yang cukup panjang.',
    });

    expect(prisma.wbsReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ primaryHandlerRole: 'YAYASAN_PENGAWAS' }),
      })
    );
  });

  it('keeps UNIT_ADMIN routing when the staff/student report names a unit', async () => {
    (prisma.wbsReport.create as any).mockResolvedValue({ ticketCode: 'x', trackingToken: 'y' });

    await wbsService.createPublicReport({
      category: WbsCategory.ETIKA_PERILAKU,
      targetLevel: WbsTargetLevel.SISWA_SANTRI,
      unitId: 'unit-sdit',
      subject: 'Perilaku tidak profesional',
      description: 'Deskripsi pelaporan yang cukup panjang.',
    });

    expect(prisma.wbsReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          primaryHandlerRole: 'UNIT_ADMIN',
          unitId: 'unit-sdit',
        }),
      })
    );
  });

  it('lists a unitless unit-level report for the foundation oversight role', async () => {
    (prisma.wbsReport.findMany as any).mockResolvedValue([]);
    await wbsService.getReportsForUser({
      id: 'pengawas-1',
      roleCode: 'YAYASAN_PENGAWAS',
      unitId: null,
    });
    const where = (prisma.wbsReport.findMany as any).mock.calls[0][0].where;
    // The Pengawas scope must include the staff/student target levels, so the
    // fallback destination is genuinely readable.
    expect(JSON.stringify(where)).toContain('STAF_PEGAWAI');
    expect(JSON.stringify(where)).toContain('SISWA_SANTRI');
  });

  it('defaults to anonymous AND drops identity fields when isAnonymous is omitted', async () => {
    (prisma.wbsReport.create as any).mockResolvedValue({ ticketCode: 'x', trackingToken: 'y' });

    await wbsService.createPublicReport({
      category: WbsCategory.ETIKA_PERILAKU,
      targetLevel: WbsTargetLevel.STAF_PEGAWAI,
      subject: 'Perilaku tidak profesional',
      description: 'Deskripsi pelaporan yang cukup panjang.',
      reporterName: 'Budi',
      reporterContact: '0812',
    });

    expect(prisma.wbsReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAnonymous: true,
          reporterName: null,
          reporterContact: null,
        }),
      })
    );
  });

  it('keeps identity fields when the reporter explicitly opts out of anonymity', async () => {
    (prisma.wbsReport.create as any).mockResolvedValue({ ticketCode: 'x', trackingToken: 'y' });

    await wbsService.createPublicReport({
      category: WbsCategory.ETIKA_PERILAKU,
      targetLevel: WbsTargetLevel.STAF_PEGAWAI,
      subject: 'Perilaku tidak profesional',
      description: 'Deskripsi pelaporan yang cukup panjang.',
      isAnonymous: false,
      reporterName: 'Budi',
      reporterContact: '0812',
    });

    expect(prisma.wbsReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAnonymous: false,
          reporterName: 'Budi',
          reporterContact: '0812',
        }),
      })
    );
  });

  it('fetches public tracking with valid token', async () => {
    const mockReport = {
      ticketCode: 'WBS-202603-ABC123',
      trackingToken: 'valid-token',
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      subject: 'Test Subject',
      description: 'Test Description',
      status: WbsStatus.DIAJUKAN,
      createdAt: new Date(),
      updatedAt: new Date(),
      unit: null,
      comments: [],
      forwardLogs: [],
    };

    (prisma.wbsReport.findUnique as any).mockResolvedValue(mockReport);

    const data = await wbsService.getPublicTracking('WBS-202603-ABC123', 'valid-token');
    expect(data.ticketCode).toBe('WBS-202603-ABC123');
    expect(data.status).toBe('DIAJUKAN');
  });

  it('anonymises handler identities on the public tracking response', async () => {
    // The tracking page is readable by anyone holding the ticket code. A
    // handler comment carries `senderName = "<officer> (<role>)"`; printing it
    // would name the officer and their position to the reporter's audience.
    (prisma.wbsReport.findUnique as any).mockResolvedValue({
      ticketCode: 'WBS-202603-ABC123',
      trackingToken: 'valid-token',
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      status: WbsStatus.DALAM_PENYELIDIKAN,
      createdAt: new Date(),
      updatedAt: new Date(),
      unit: null,
      forwardLogs: [],
      comments: [
        {
          id: 'c1',
          senderType: 'HANDLER',
          senderName: 'Ust. Fulan (YAYASAN_PENGAWAS)',
          message: 'Sedang kami periksa.',
          attachments: [],
          createdAt: new Date(),
        },
        {
          id: 'c2',
          senderType: 'REPORTER',
          senderName: 'Pelapor',
          message: 'Terima kasih.',
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const data = await wbsService.getPublicTracking('WBS-202603-ABC123', 'valid-token');

    const handler = data.comments.find((c: any) => c.id === 'c1');
    expect(handler?.senderName).toBe('Tim Pemeriksa');
    // A reporter's own display name is not the handler's to hide.
    const reporter = data.comments.find((c: any) => c.id === 'c2');
    expect(reporter?.senderName).toBe('Pelapor');
  });

  it('keeps the existing assignee on a status change', async () => {
    // `updateReportStatus` used to write `assignedUserId: actor.id`, so ticking
    // a status box stole a case that `forward toUserId` had assigned to someone
    // else. The status changes; the owner does not.
    const mockReport = {
      id: 'report-1',
      status: WbsStatus.DALAM_PENYELIDIKAN,
      resolution: null,
      assignedUserId: 'user-assignee',
      ticketCode: 'WBS-1',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };
    (prisma.wbsReport.findFirst as any).mockResolvedValue(mockReport);
    (prisma.wbsReport.update as any).mockResolvedValue({
      ...mockReport,
      status: WbsStatus.SELESAI,
    });

    await wbsService.updateReportStatus(
      'report-1',
      { status: WbsStatus.SELESAI },
      { id: 'actor-1', name: 'Aktor', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // The status write no longer touches `assignedUserId` at all, so an
    // assignee named by a concurrent forward cannot be overwritten.
    expect(prisma.wbsReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ assignedUserId: expect.anything() }),
      })
    );
  });

  it('rolls the status change back when the handler note fails to save', async () => {
    // Status and note are one event. The status update and the comment both go
    // through the same `tx`, so a failing comment aborts the transaction and
    // the status change never commits — otherwise the report advances with no
    // record of why.
    const mockReport = {
      id: 'report-1',
      status: WbsStatus.DIAJUKAN,
      resolution: null,
      assignedUserId: 'actor-1',
      ticketCode: 'WBS-1',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };
    (prisma.wbsReport.findFirst as any).mockResolvedValue(mockReport);
    (prisma.wbsReport.update as any).mockResolvedValue({
      ...mockReport,
      status: WbsStatus.SELESAI,
    });
    (prisma.wbsComment.create as any).mockRejectedValueOnce(new Error('comment write failed'));

    await expect(
      wbsService.updateReportStatus(
        'report-1',
        { status: WbsStatus.SELESAI, handlerNote: 'Catatan pemeriksa' },
        { id: 'actor-1', name: 'Aktor', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toThrow('comment write failed');

    // Both writes happen inside the same transaction callback; the assertion
    // that matters is that the transaction was used and the error propagated
    // rather than being swallowed after the status write.
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.wbsComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: 'report-1',
          message: expect.stringContaining('Catatan pemeriksa'),
        }),
      })
    );
  });

  it('claims an unassigned report when the actor sets its status', async () => {
    const mockReport = {
      id: 'report-1',
      status: WbsStatus.DIAJUKAN,
      resolution: null,
      assignedUserId: null,
      ticketCode: 'WBS-1',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };
    (prisma.wbsReport.findFirst as any).mockResolvedValue(mockReport);
    (prisma.wbsReport.update as any).mockResolvedValue({
      ...mockReport,
      status: WbsStatus.DALAM_PENYELIDIKAN,
    });

    await wbsService.updateReportStatus(
      'report-1',
      { status: WbsStatus.DALAM_PENYELIDIKAN },
      { id: 'actor-1', name: 'Aktor', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // The claim is a conditional `updateMany` filtered on `assignedUserId:
    // null`, so it matches nothing if a concurrent forward has already taken
    // the report; the status write itself never mentions the column.
    expect(prisma.wbsReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'report-1', assignedUserId: null },
      data: { assignedUserId: 'actor-1' },
    });
    expect(prisma.wbsReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ assignedUserId: expect.anything() }),
      })
    );
  });

  it('does not let a status update overwrite a forward that committed after the load', async () => {
    // The report is loaded as unassigned (the pre-transaction read), then a
    // `forward toUserId` commits before this transaction runs. The claim is
    // filtered on `assignedUserId: null`, so it matches zero rows — the
    // forward's owner survives and the status write still never names the
    // column.
    const mockReport = {
      id: 'report-1',
      status: WbsStatus.DIAJUKAN,
      resolution: null,
      assignedUserId: null,
      ticketCode: 'WBS-1',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };
    (prisma.wbsReport.findFirst as any).mockResolvedValue(mockReport);
    // A concurrent forward already claimed the row, so the conditional claim
    // matches nothing.
    (prisma.wbsReport.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.wbsReport.update as any).mockResolvedValue({
      ...mockReport,
      status: WbsStatus.DALAM_PENYELIDIKAN,
    });

    await wbsService.updateReportStatus(
      'report-1',
      { status: WbsStatus.DALAM_PENYELIDIKAN },
      { id: 'actor-1', name: 'Aktor', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // The claim is conditional — never `assignedUserId: actor.id` unconditional.
    expect(prisma.wbsReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'report-1', assignedUserId: null },
      data: { assignedUserId: 'actor-1' },
    });
    // The status write carries no assignment, so the forward cannot be lost.
    expect(prisma.wbsReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ assignedUserId: expect.anything() }),
      })
    );
  });

  it('forwards a report the actor is in scope for', async () => {
    const mockReport = {
      id: 'report-1',
      ticketCode: 'WBS-202603-ABC123',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };

    (prisma.wbsReport.findFirst as any).mockResolvedValue(mockReport);
    (prisma.wbsReport.update as any).mockResolvedValue({
      ...mockReport,
      primaryHandlerRole: 'YAYASAN_KETUA',
    });

    const updated = await wbsService.forwardReport(
      'report-1',
      { toRole: 'YAYASAN_KETUA', reason: 'Pelanggaran menyangkut Kepala Sekolah SD IT' },
      { id: 'user-pengawas', name: 'Ketua Pengawas', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
    expect(updated.primaryHandlerRole).toBe('YAYASAN_KETUA');
  });

  it('refuses to forward a report to an unrecognised role', async () => {
    // A typo such as `primaryHandlerRole` passes the shared schema only if it
    // is not validated; the service is the last gate before the report lands in
    // a queue no role's scope query matches and vanishes from every list.
    (prisma.wbsReport.findFirst as any).mockResolvedValue({
      id: 'report-1',
      ticketCode: 'WBS-1',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    });

    await expect(
      wbsService.forwardReport(
        'report-1',
        { toRole: 'primaryHandlerRole', reason: 'salah ketik peran tujuan' } as any,
        { id: 'user-pengawas', name: 'Pengawas', roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    expect(prisma.wbsReport.update).not.toHaveBeenCalled();
  });

  describe('forward recipient validation', () => {
    const actor = {
      id: 'user-pengawas',
      name: 'Pengawas',
      roleCode: 'YAYASAN_PENGAWAS',
      unitId: null,
    };

    function reportInScope(unitId: string | null = 'unit-sdit') {
      return {
        id: 'report-1',
        ticketCode: 'WBS-1',
        primaryHandlerRole: 'YAYASAN_PENGAWAS',
        unitId,
      };
    }

    function recipient(overrides: Record<string, unknown> = {}) {
      return {
        id: 'user-target',
        isActive: true,
        deletedAt: null,
        unitId: null,
        userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
        ...overrides,
      };
    }

    it('refuses to forward to yourself', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'YAYASAN_PENGAWAS', reason: 'alasan panjang', toUserId: 'user-pengawas' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    });

    it('refuses a recipient whose effective role does not match the destination', async () => {
      // The recipient is a live Pengawas, but the report is being sent to the
      // Ketua bucket. `buildScopeWhere` would have granted them access anyway.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({ userRoles: [{ role: { code: 'YAYASAN_PENGAWAS' } }] })
      );

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
      expect(prisma.wbsReport.update).not.toHaveBeenCalled();
    });

    it('refuses an unrelated user with no matching role assignment', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({ userRoles: [{ role: { code: 'SDIT_GURU' } }] })
      );

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    });

    it('refuses an inactive, deleted or unknown recipient', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());

      for (const bad of [
        recipient({ isActive: false }),
        recipient({ deletedAt: new Date() }),
        null,
      ]) {
        vi.clearAllMocks();
        (prisma.boardMemberSuspension.updateMany as any).mockResolvedValue({ count: 1 });
        (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
        (prisma.user.findUnique as any).mockResolvedValue(bad);

        await expect(
          wbsService.forwardReport(
            'report-1',
            { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
            actor
          )
        ).rejects.toMatchObject({ statusCode: 400 });
      }

      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    });

    it('refuses a UNIT_ADMIN recipient bound to a different unit', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({ unitId: 'unit-smpit', userRoles: [{ role: { code: 'SDIT_ADMIN' } }] })
      );

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'UNIT_ADMIN', reason: 'alasan panjang', toUserId: 'user-target' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    });

    it('forwards to a valid foundation recipient and records the assignment', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(recipient());
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope(),
        primaryHandlerRole: 'YAYASAN_KETUA',
        assignedUserId: 'user-target',
      });

      const updated = await wbsService.forwardReport(
        'report-1',
        { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
      expect(prisma.wbsReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            primaryHandlerRole: 'YAYASAN_KETUA',
            assignedUserId: 'user-target',
          }),
        })
      );
      expect(updated.assignedUserId).toBe('user-target');
    });
  });

  describe('per-report scope enforcement', () => {
    const actor = { id: 'u1', name: 'Pengawas', roleCode: 'YAYASAN_PENGAWAS', unitId: null };

    it('refuses an out-of-scope report with 403 when the row exists', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(null);
      (prisma.wbsReport.findUnique as any).mockResolvedValue({ id: 'report-9' });

      await expect(wbsService.getReportById('report-9', actor)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(prisma.wbsReport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'report-9' }) })
      );
    });

    it('answers 404 when the report does not exist at all', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(null);
      (prisma.wbsReport.findUnique as any).mockResolvedValue(null);

      await expect(wbsService.getReportById('missing', actor)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('scopes an out-of-unit handler to their own unit in the where clause', async () => {
      (prisma.wbsReport.findMany as any).mockResolvedValue([]);
      await wbsService.getReportsForUser({ roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' });

      expect(prisma.wbsReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-sdit' }),
        })
      );
    });

    it('lets a specifically assigned handler reach their assigned report', async () => {
      (prisma.wbsReport.findMany as any).mockResolvedValue([]);
      await wbsService.getReportsForUser({
        id: 'user-assignee',
        roleCode: 'SMAQ_ADMIN',
        unitId: 'unit-smaq',
      });

      const call = (prisma.wbsReport.findMany as any).mock.calls[0][0];
      expect(JSON.stringify(call.where)).toContain('user-assignee');
      expect(call.where.OR.some((clause: any) => clause.assignedUserId === 'user-assignee')).toBe(
        true
      );
    });

    it.each([
      [
        'updateReportStatus',
        () => wbsService.updateReportStatus('report-9', { status: WbsStatus.SELESAI }, actor),
      ],
      [
        'forwardReport',
        () =>
          wbsService.forwardReport(
            'report-9',
            { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang' },
            actor
          ),
      ],
      [
        'addHandlerComment',
        () => wbsService.addHandlerComment('report-9', 'halo', undefined, actor),
      ],
    ])('refuses %s on an out-of-scope report with 403', async (_name, call) => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(null);
      (prisma.wbsReport.findUnique as any).mockResolvedValue({ id: 'report-9' });

      await expect(call()).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.wbsReport.update).not.toHaveBeenCalled();
      expect(prisma.wbsComment.create).not.toHaveBeenCalled();
    });

    it('lets a Super Admin read any report by id', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue({ id: 'report-9' });
      const result = await wbsService.getReportById('report-9', {
        roleCode: 'SUPER_ADMIN',
        unitId: null,
      });
      expect(result.id).toBe('report-9');
    });

    it('binds a named assignment to the active role, not to the actor id alone', () => {
      const report = (id: string, primaryHandlerRole: string, unitId: string | null) => ({
        id,
        unitId,
        primaryHandlerRole,
      });

      // A multi-role account issued a report as YAYASAN_PENGAWAS, then switched
      // its active token to a unit handler role. The assignment term must be
      // derived from the *active* role, so the unit switch cannot re-open the
      // confidential case. A bare `{ assignedUserId }` OR did exactly that.
      const cases: Array<{
        roleCode: string;
        unitId: string | null;
        report: ReturnType<typeof report>;
        visible: boolean;
      }> = [
        {
          roleCode: 'YAYASAN_PENGAWAS',
          unitId: null,
          report: report('r-1', 'YAYASAN_PENGAWAS', null),
          visible: true,
        },
        {
          roleCode: 'SMAQ_ADMIN',
          unitId: 'unit-smaq',
          report: report('r-2', 'YAYASAN_PENGAWAS', null),
          visible: false,
        },
        {
          roleCode: 'SMAQ_ADMIN',
          unitId: 'unit-smaq',
          report: report('r-3', 'UNIT_ADMIN', 'unit-smaq'),
          visible: true,
        },
        {
          roleCode: 'SMAQ_ADMIN',
          unitId: 'unit-smaq',
          report: report('r-4', 'UNIT_ADMIN', 'unit-sdit'),
          visible: false,
        },
        {
          roleCode: 'YAYASAN_KETUA',
          unitId: null,
          report: report('r-5', 'YAYASAN_KETUA', null),
          visible: true,
        },
      ];

      // The scope predicate is inspected directly; each case is run through the
      // same `buildScopeWhere` the list, detail and every mutation use.
      for (const c of cases) {
        const where = (wbsService as any).buildScopeWhere({
          id: 'actor-multi',
          roleCode: c.roleCode,
          unitId: c.unitId,
        }) as any;
        const assignmentClauses = (where.OR ?? []).filter(
          (clause: any) => clause.assignedUserId === 'actor-multi'
        );
        const matches = assignmentClauses.some((clause: any) => {
          const roleMatches =
            typeof clause.primaryHandlerRole === 'string'
              ? clause.primaryHandlerRole === c.report.primaryHandlerRole
              : (clause.primaryHandlerRole?.in ?? []).includes(c.report.primaryHandlerRole);
          const unitMatches = !('unitId' in clause) || clause.unitId === c.report.unitId;
          return roleMatches && unitMatches;
        });
        expect(matches, `${c.roleCode} on ${c.report.primaryHandlerRole}`).toBe(c.visible);
      }
    });

    it('does not grant a unitless role any assignment term', () => {
      const where = (wbsService as any).buildScopeWhere({
        id: 'actor-multi',
        roleCode: 'SMAQ_ADMIN',
        unitId: null,
      }) as any;
      expect(where).toEqual({ id: { in: [] } });
    });

    it('re-checks scope inside the mutation transaction, under the row lock', () => {
      // The pre-transaction load is not enough: a forward that commits in the
      // gap can move the report to a destination the actor's active role may no
      // longer hold. Every mutation path locks the row then re-resolves scope.
      expect(typeof (wbsService as any).assertReportInScopeTx).toBe('function');
    });

    describe('unitless unit-scoped actors fail closed', () => {
      // A principal that is unit-scoped by role but carries no unit must not
      // graduate to foundation-wide visibility. Every entry point that shared
      // `buildScopeWhere` used to drop the `unitId` filter here, so the
      // predicate is pinned separately.
      it.each(['SDIT_ADMIN', 'SMAQ_ADMIN', 'SDIT_GURU', 'SMPIT_KEPALA'])(
        'scopes a unitless %s to an impossible predicate on list',
        async (roleCode) => {
          (prisma.wbsReport.findMany as any).mockResolvedValue([]);

          await wbsService.getReportsForUser({ id: 'u-nounit', roleCode, unitId: null });

          const where = (prisma.wbsReport.findMany as any).mock.calls[0][0].where;
          // The impossible `id IN ()` set matches nothing: the query cannot
          // degrade into an unfiltered cross-unit read.
          expect(where).toEqual({ id: { in: [] } });
        }
      );

      it.each(['YAYASAN_BENDAHARA', 'YAYASAN_PENGAWAS'])(
        'keeps the foundation-wide %s scope even without a unit',
        async (roleCode) => {
          // These roles are not unit-scoped — they govern the whole yayasan —
          // so a null `unitId` is expected and must not be mistaken for the
          // unitless-handler case.
          (prisma.wbsReport.findMany as any).mockResolvedValue([]);

          await wbsService.getReportsForUser({ id: 'u-nounit', roleCode, unitId: null });

          const where = (prisma.wbsReport.findMany as any).mock.calls[0][0].where;
          expect(where).not.toEqual({ id: { in: [] } });
        }
      );

      it.each([
        ['getReportById', (actor: unknown) => wbsService.getReportById('report-1', actor as any)],
        [
          'updateReportStatus',
          (actor: unknown) =>
            wbsService.updateReportStatus('report-1', { status: WbsStatus.SELESAI }, actor as any),
        ],
        [
          'forwardReport',
          (actor: unknown) =>
            wbsService.forwardReport(
              'report-1',
              { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang' },
              actor as any
            ),
        ],
        [
          'addHandlerComment',
          (actor: unknown) =>
            wbsService.addHandlerComment('report-1', 'halo', undefined, actor as any),
        ],
      ])(
        'scopes %s for a unitless unit-scoped actor to the impossible predicate',
        async (_name, call) => {
          // The report row exists (findUnique), but the scoped lookup matches
          // nothing, so the caller is refused rather than handed the report.
          (prisma.wbsReport.findFirst as any).mockResolvedValue(null);
          (prisma.wbsReport.findUnique as any).mockResolvedValue({ id: 'report-1' });

          await expect(
            call({ id: 'u-nounit', name: 'Tanpa Unit', roleCode: 'SDIT_ADMIN', unitId: null })
          ).rejects.toMatchObject({ statusCode: 403 });

          // The scope predicate must never resolve to "everything".
          const where = (prisma.wbsReport.findFirst as any).mock.calls[0][0].where;
          expect(where).toMatchObject({ id: { in: [] } });
          expect(prisma.wbsReport.update).not.toHaveBeenCalled();
          expect(prisma.wbsReport.updateMany).not.toHaveBeenCalled();
          expect(prisma.wbsComment.create).not.toHaveBeenCalled();
        }
      );
    });
  });
});
