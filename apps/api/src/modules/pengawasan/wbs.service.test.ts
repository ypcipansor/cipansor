import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wbsService } from './wbs.service';
import { boardSuspensionService, SIGNING_KEY_SUSPENSION_LOCK } from './board-suspension.service';
import { pengawasanService } from './pengawasan.service';
import { invalidateUserSuspensionCache } from '@/utils/user-suspension';
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

describe('BoardSuspensionService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The lift claims the row with a conditional update; one caller wins.
    (prisma.boardMemberSuspension.updateMany as any).mockResolvedValue({ count: 1 });
    // E-Sign soft-locks are claimed per key with a conditional update; one
    // caller wins.
    (prisma.userSigningKey.updateMany as any).mockResolvedValue({ count: 1 });
    // The suspension claims the account with a conditional update; one caller
    // wins unless a test overrides this to simulate a concurrent admin change.
    (prisma.user.updateMany as any).mockResolvedValue({ count: 1 });
    // Rows written before the dependency table existed have no dependency
    // rows; the legacy single-assignment path is exercised explicitly below.
    (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([]);
    (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);
    // Defaults; a test that cares overrides them.
    (prisma.userSigningKey.findMany as any).mockResolvedValue([]);
    (prisma.role.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
  });

  it('suspends board member, deactivates account, soft-locks e-sign keys, and delegates Plh role', async () => {
    const mockUser = {
      id: 'user-pengurus',
      name: 'Pengurus Fulan',
      email: 'pengurus@cipansor.or.id',
      isActive: true,
      userRoles: [{ role: { code: 'YAYASAN_BENDAHARA' } }],
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockUser);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({
      id: 'susp-1',
      userId: 'user-pengurus',
      skNumber: 'SK/PENGAWAS/2026/001',
      status: 'ACTIVE',
    });
    (prisma.user.update as any).mockResolvedValue({
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([
      { id: 'key-1', lockedUntil: null },
      { id: 'key-2', lockedUntil: new Date('2026-02-01T00:00:00.000Z') },
    ]);
    (prisma.role.findFirst as any).mockResolvedValue({
      id: 'role-ketua-id',
      code: 'YAYASAN_KETUA',
    });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue(null);
    (prisma.userRoleAssignment.create as any).mockResolvedValue({ id: 'assign-1' });

    const suspension = await boardSuspensionService.suspendBoardMember(
      {
        userId: 'user-pengurus',
        skNumber: 'SK/PENGAWAS/2026/001',
        auditReason: 'Indikasi penyalahgunaan wewenang keuangan yayasan',
        plhUserId: 'user-sekretaris',
        plhRoleCode: 'YAYASAN_KETUA',
      },
      'issuer-pengawas'
    );

    expect(suspension.id).toBe('susp-1');
    // The deactivation is a conditional claim on the state that was just read,
    // stamped with a fresh ownership token so a later lift can prove the
    // `false` is still this suspension's own write.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
      },
      data: { isActive: false, accountStateWriter: expect.stringMatching(/^asw_/) },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-pengurus' },
    });
    // E-Sign keys are soft-locked per key, conditionally on the observed
    // `lockedUntil`, so a lockout that lands in between is not clobbered.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: expect.any(Date) },
    });
    expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-sekretaris',
        roleId: 'role-ketua-id',
        isPrimary: false,
      },
    });
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plhAssignmentCreated: true,
          plhAssignmentId: 'assign-1',
        }),
      })
    );
  });

  it('aborts when an admin changes the account state between the read and the claim', async () => {
    // The snapshot read `isActive: true` / no writer, then an admin deactivated
    // the account before the conditional claim ran. The claim matches nothing
    // (count 0), so the suspension must not be created and must not overwrite
    // the admin's state with its own writer token.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      accountStateWriter: null,
      userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.user.updateMany as any).mockResolvedValue({ count: 0 });

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/PENGAWAS/2026/009',
          auditReason: 'Indikasi penyalahgunaan wewenang keuangan yayasan',
        },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    // The compare-and-set is filtered on the values just read, including the
    // `null` writer and the `deletedAt: null` soft-delete guard — not on
    // `updatedAt`, and not unconditioned.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
      },
      data: { isActive: false, accountStateWriter: expect.stringMatching(/^asw_/) },
    });
  });

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA', 'SDIT_SISWA', 'SDIT_GURU'])(
    'refuses to suspend a non-Pengurus target (%s)',
    async (code) => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-x',
        isActive: true,
        deletedAt: null,
        userRoles: [{ role: { code } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-x', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    }
  );

  it('refuses a soft-deleted target even when isActive is still true', async () => {
    // A soft delete clears nothing about `isActive`, so the ACTIVE gate alone
    // let a removed account through: the suspension switched it off (a no-op
    // on paper) and minted a Plh role to replace someone the app had already
    // deleted.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: new Date('2026-04-01T00:00:00.000Z'),
      userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
    });

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the target is soft-deleted between the pre-flight read and the claim', async () => {
    // The pre-flight read saw a live row; the delete lands before the claim
    // acquires the row lock. The in-transaction `FOR UPDATE` re-check sees
    // `deleted_at` and the whole suspension aborts.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any).mockResolvedValueOnce([
      { deleted_at: new Date('2026-04-01T00:00:00.000Z') },
    ]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the Plh delegate is deactivated between the pre-flight read and the grant', async () => {
    // The delegate was active at pre-flight; an admin deactivates them before
    // the grant. Without the in-transaction re-claim under `FOR UPDATE`, the
    // suspension would still mint a Pengurus role for someone who cannot act.
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      })
      .mockResolvedValueOnce({ id: 'user-sekretaris', isActive: true, deletedAt: null });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    // The locked re-read (target lock, then Plh lock) sees the new state.
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ deleted_at: null }])
      .mockResolvedValueOnce([{ is_active: false, deleted_at: null }]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          plhUserId: 'user-sekretaris',
          plhRoleCode: 'YAYASAN_KETUA',
        },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('aborts when the Plh delegate is soft-deleted between the pre-flight read and the grant', async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        accountStateWriter: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      })
      .mockResolvedValueOnce({ id: 'user-sekretaris', isActive: true, deletedAt: null });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ deleted_at: null }])
      .mockResolvedValueOnce([{ is_active: true, deleted_at: new Date('2026-04-01') }]);

    await expect(
      boardSuspensionService.suspendBoardMember(
        {
          userId: 'user-pengurus',
          skNumber: 'SK/1',
          auditReason: 'alasan audit yang panjang',
          plhUserId: 'user-sekretaris',
          plhRoleCode: 'YAYASAN_KETUA',
        },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
  });

  it('keeps the per-key conditional lock so a lockout re-armed mid-flight survives', async () => {
    // Both keys are read with `lockedUntil: null`. The first claim matches,
    // the second does not (an unrelated lockout was armed after the read), so
    // only the claimed key enters the snapshot — the lift then cannot write a
    // stale `null` back over the newer lockout.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      deletedAt: null,
      accountStateWriter: null,
      userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({ id: 'susp-lock' });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([
      { id: 'key-1', lockedUntil: null },
      { id: 'key-2', lockedUntil: null },
    ]);
    (prisma.userSigningKey.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await boardSuspensionService.suspendBoardMember(
      { userId: 'user-pengurus', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
      'issuer-pengawas'
    );

    // Each key is claimed against the value just observed, not blanket-matched.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', userId: 'user-pengurus', lockedUntil: null },
      data: { lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
    });
    // Only the claimed key is captured, so the snapshot never claims a key it
    // did not actually replace.
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signingKeyLocks: { 'key-1': null },
        }),
      })
    );
  });

  it('refuses a second ACTIVE suspension for the same user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue({ skNumber: 'SK/LAMA' });

    await expect(
      boardSuspensionService.suspendBoardMember(
        { userId: 'user-pengurus', skNumber: 'SK/BARU', auditReason: 'alasan audit yang panjang' },
        'issuer-pengawas'
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reactivates an expired Plh assignment and records what to restore', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user-pengurus',
      isActive: true,
      userRoles: [{ role: { code: 'YAYASAN_ANGGOTA' } }],
    });
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({ id: 'susp-1' });
    (prisma.userSigningKey.findMany as any).mockResolvedValue([]);
    (prisma.role.findFirst as any).mockResolvedValue({ id: 'role-ketua-id' });
    (prisma.userRoleAssignment.findFirst as any).mockResolvedValue({
      id: 'assign-old',
      isActive: false,
      expiresAt: new Date('2020-01-01'),
    });

    await boardSuspensionService.suspendBoardMember(
      {
        userId: 'user-pengurus',
        skNumber: 'SK/1',
        auditReason: 'alasan audit yang panjang',
        plhUserId: 'user-sekretaris',
        plhRoleCode: 'YAYASAN_KETUA',
      },
      'issuer-pengawas'
    );

    expect(prisma.userRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-old' },
      data: { isActive: true, expiresAt: null },
    });
    expect(prisma.boardMemberSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plhAssignmentCreated: false,
          plhAssignmentId: 'assign-old',
          plhAssignmentRestore: expect.objectContaining({ isActive: false }),
        }),
      })
    );
  });

  it('lifts suspension, reactivates account, restores captured e-sign lockouts and removes the Plh it created', async () => {
    const mockSuspension = {
      id: 'susp-1',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhUserId: 'user-sekretaris',
      plhRoleCode: 'YAYASAN_KETUA',
      plhAssignmentCreated: true,
      plhAssignmentId: 'assign-new',
      plhAssignmentRestore: null,
      signingKeyLocks: { 'key-1': null, 'key-2': '2026-01-01T00:00:00.000Z' },
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    // The row still carries the suspension's own write, so it is restored.
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const updated = await boardSuspensionService.liftBoardSuspension(
      'susp-1',
      'lifter-pembina',
      'Penyelidikan selesai'
    );

    expect(updated.status).toBe('LIFTED');
    // The reactivation is a conditional claim: `id`, `isActive: false`,
    // `deletedAt: null` and the exact writer token all in one statement.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      },
      data: { isActive: true, accountStateWriter: expect.stringMatching(/^asw_/) },
    });
    // Both restores are gated on the sentinel the suspension itself wrote, so
    // a key whose lock state changed in the meantime is left alone.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: null },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'assign-new' },
    });
  });

  it('does not erase a lockout re-armed after the suspension', async () => {
    // Suspension captured `key-1: null` and wrote the sentinel. Someone then
    // locked that key for a newer, unrelated reason, so `lockedUntil` no longer
    // matches the sentinel the suspension wrote. The lift must leave it alone
    // rather than writing the stale `null` back and clearing the lockout.
    const mockSuspension = {
      id: 'susp-lock',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhUserId: null,
      plhRoleCode: null,
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      plhAssignmentRestore: null,
      signingKeyLocks: { 'key-1': null },
      accountStateSnapshot: { isActiveBefore: false },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      accountStateWriter: 'asw_admin_other',
    });

    await boardSuspensionService.liftBoardSuspension('susp-lock', 'lifter', 'Pulih');

    // The restore is scoped to the sentinel, so a key re-armed in the meantime
    // is not matched and survives.
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus', lockedUntil: SIGNING_KEY_SUSPENSION_LOCK },
      data: { lockedUntil: null },
    });
  });

  it('leaves a pre-existing effective Plh assignment alone on lift', async () => {
    const mockSuspension = {
      id: 'susp-2',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      plhAssignmentRestore: null,
      signingKeyLocks: null,
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await boardSuspensionService.liftBoardSuspension('susp-2', 'lifter-pembina', 'Pulih');

    expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('restores a reactivated (previously inactive) Plh assignment on lift instead of deleting it', async () => {
    const mockSuspension = {
      id: 'susp-3',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_test',
      plhAssignmentCreated: false,
      plhAssignmentId: 'assign-old',
      plhAssignmentRestore: { isActive: false, expiresAt: '2020-01-01T00:00:00.000Z' },
      signingKeyLocks: null,
      accountStateSnapshot: {
        isActiveBefore: true,
      },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      accountStateWriter: 'asw_test',
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await boardSuspensionService.liftBoardSuspension('susp-3', 'lifter-pembina', 'Pulih');

    expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: 'assign-old' },
      data: { isActive: false, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
  });

  it('does not undo an admin deactivation that landed during the suspension', async () => {
    // The suspension switched the account off and stamped `asw_ours`. An
    // admin then deactivated it again for an unrelated reason, stamping a new
    // token. The lift must not claim that `false` as its own.
    const mockSuspension = {
      id: 'susp-adm',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_ours',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      signingKeyLocks: null,
      accountStateSnapshot: { isActiveBefore: true, writer: 'asw_ours' },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      // A different writer owns the current value.
      accountStateWriter: 'asw_admin',
    });

    await boardSuspensionService.liftBoardSuspension('susp-adm', 'lifter', 'Pulih');

    // The write is attempted, but its `where` requires the suspension's own
    // writer token — which the admin's deactivation replaced. The database
    // therefore matches zero rows and the admin's `false` survives.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_ours',
      },
      data: { isActive: true, accountStateWriter: expect.stringMatching(/^asw_/) },
    });
  });

  it('reactivates when the suspension still owns the current deactivation', async () => {
    const mockSuspension = {
      id: 'susp-own',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      accountStateWriter: 'asw_ours',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      signingKeyLocks: null,
      accountStateSnapshot: { isActiveBefore: true, writer: 'asw_ours' },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      isActive: false,
      deletedAt: null,
      accountStateWriter: 'asw_ours',
    });

    await boardSuspensionService.liftBoardSuspension('susp-own', 'lifter', 'Pulih');

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-pengurus',
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_ours',
      },
      data: { isActive: true, accountStateWriter: expect.stringMatching(/^asw_/) },
    });
  });

  it('refuses to lift a suspension that is not ACTIVE', async () => {
    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
      id: 'susp-4',
      status: 'LIFTED',
    });

    await expect(
      boardSuspensionService.liftBoardSuspension('susp-4', 'lifter', 'Pulih')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('shared Plh delegation dependencies', () => {
    const sharedAssignmentId = 'assign-shared';

    function suspension(id: string, created: boolean) {
      return {
        id,
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: created,
        plhAssignmentId: sharedAssignmentId,
        plhAssignmentRestore: null,
        signingKeyLocks: null,
        accountStateSnapshot: { isActiveBefore: true },
      };
    }

    it('keeps a shared Plh assignment alive until the last ACTIVE dependent is lifted (creator first)', async () => {
      // Suspension A minted the assignment; B reused the same effective
      // delegate+role. Lifting A must not delete what B still relies on.
      const a = suspension('susp-a', true);
      const b = suspension('susp-b', false);

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      // B is still ACTIVE and depends on the same assignment.
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(1);
      // B's dependency row is the heir that must inherit the `created` flag.
      (prisma.boardSuspensionPlhAssignment.findFirst as any).mockResolvedValue({
        id: 'dep-b',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      // Provenance is handed to the surviving dependent *before* A's row is
      // deleted, so B still knows it must ultimately delete the assignment.
      expect(prisma.boardSuspensionPlhAssignment.update).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
        data: { created: true },
      });
      expect(prisma.boardSuspensionPlhAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dep-a' },
      });
      // The shared assignment survives: the last dependent has not lifted yet.
      expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the suspension-minted assignment when the last dependent lifts after the creator (creator first)', async () => {
      // Follow-on to the test above: A minted it and transferred `created` to
      // B on the way out; B is now the last dependent and must delete it. This
      // is the regression the old code failed — B lifted with `created: false`
      // and left the assignment active forever.
      const b = suspension('susp-b', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(b);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...b,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      // B inherited provenance, so its row now carries `created: true`.
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-b', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-b', 'lifter', 'Pulih');

      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: sharedAssignmentId },
      });
    });

    it('transfers the reactivation restore payload to the surviving dependent', async () => {
      // The creator had *reactivated* an expired pre-existing row, so its
      // provenance is a restore payload rather than `created`. Lifting it while
      // a dependent remains must move the payload, or the last dependent would
      // leave the reactivated row active instead of restoring it.
      const a = suspension('susp-a', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      const restore = { isActive: false, expiresAt: null };
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: false, restore },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(1);
      (prisma.boardSuspensionPlhAssignment.findFirst as any).mockResolvedValue({
        id: 'dep-b',
        created: false,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      expect(prisma.boardSuspensionPlhAssignment.update).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
        data: { created: false, restore },
      });
      expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userRoleAssignment.updateMany).not.toHaveBeenCalled();
    });

    it('releases the shared assignment when the last dependent lifts (creator first)', async () => {
      const b = suspension('susp-b', false);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(b);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...b,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-b', assignmentId: sharedAssignmentId, created: false, restore: null },
      ]);
      // No other ACTIVE suspension needs it anymore.
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-b', 'lifter', 'Pulih');

      // `created: false` + no restore ⇒ the pre-existing assignment is left
      // alone, but the dependency row is gone.
      expect(prisma.boardSuspensionPlhAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dep-b' },
      });
    });

    it('deletes the shared assignment only when the minting suspension lifts last', async () => {
      // Reverse order: B lifts first and leaves the assignment for A; then A
      // lifts and — as the creator — removes it.
      const a = suspension('susp-a', true);
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(a);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...a,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
      });
      (prisma.boardSuspensionPlhAssignment.findMany as any).mockResolvedValue([
        { id: 'dep-a', assignmentId: sharedAssignmentId, created: true, restore: null },
      ]);
      (prisma.boardSuspensionPlhAssignment.count as any).mockResolvedValue(0);

      await boardSuspensionService.liftBoardSuspension('susp-a', 'lifter', 'Pulih');

      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: sharedAssignmentId },
      });
    });
  });

  describe('privilege-escalation and snapshot guards', () => {
    it('refuses to name the suspended officer as their own Plh', async () => {
      // Self-appointment undoes the suspension: the frozen account would hold
      // the very office it was removed from.
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-pengurus',
        isActive: true,
        deletedAt: null,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-pengurus',
            plhRoleCode: 'YAYASAN_KETUA',
          },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it('refuses an inactive or deleted Plh delegate', async () => {
      (prisma.user.findUnique as any)
        // The target is a live Pengurus…
        .mockResolvedValueOnce({
          id: 'user-pengurus',
          isActive: true,
          deletedAt: null,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        })
        // …but the named replacement is a deactivated account.
        .mockResolvedValueOnce({ id: 'user-sekretaris', isActive: false, deletedAt: null });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-sekretaris',
            plhRoleCode: 'YAYASAN_KETUA',
          },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses a Plh role that is not a Pengurus role (SUPER_ADMIN)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-pengurus',
        isActive: true,
        userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          {
            userId: 'user-pengurus',
            skNumber: 'SK/1',
            auditReason: 'alasan audit yang panjang',
            plhUserId: 'user-accomplice',
            // The type now forbids this too; the runtime guard is what the
            // test is exercising, so the cast is deliberate.
            plhRoleCode: 'SUPER_ADMIN' as any,
          },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    });

    it.each(['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'SDIT_ADMIN'])(
      'refuses a Plh role outside the Pengurus organ (%s)',
      async (code) => {
        (prisma.user.findUnique as any).mockResolvedValue({
          id: 'user-pengurus',
          isActive: true,
          userRoles: [{ isActive: true, expiresAt: null, role: { code: 'YAYASAN_KETUA' } }],
        });

        await expect(
          boardSuspensionService.suspendBoardMember(
            {
              userId: 'user-pengurus',
              skNumber: 'SK/1',
              auditReason: 'alasan audit yang panjang',
              plhUserId: 'user-x',
              // Deliberately outside the legal set — the service guard is the
              // behaviour under test.
              plhRoleCode: code as any,
            },
            'issuer-pengawas'
          )
        ).rejects.toMatchObject({ statusCode: 400 });
      }
    );

    it('does not treat an expired Pengurus assignment as a current Pengurus', async () => {
      // The filter is applied in the query, so a returned empty set is exactly
      // what a lapsed assignment yields.
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-x',
        isActive: true,
        userRoles: [],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-x', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      // The guard asks the DB to exclude inactive/expired assignments rather
      // than filtering after the fact.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            userRoles: {
              where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
              },
              include: { role: { select: { code: true } } },
            },
          },
        })
      );
    });

    it('reactivates an account that is still off after a mere profile edit bumped its updatedAt', async () => {
      // The old lift compared `updatedAt` against the suspension's own write,
      // so any name/email change moved the timestamp and the lift refused to
      // restore an account the suspension itself had switched off. State is
      // what matters: off now, and on before the suspension → put it back on.
      const mockSuspension = {
        id: 'susp-9',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      // An unrelated profile edit moved `updatedAt` past the suspension.
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        accountStateWriter: 'asw_test',
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-9', 'lifter', 'Pulih');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-pengurus',
          isActive: false,
          deletedAt: null,
          accountStateWriter: 'asw_test',
        },
        data: { isActive: true, accountStateWriter: expect.stringMatching(/^asw_/) },
      });
    });

    it('does not re-activate an account that the snapshot says was already off before suspension', async () => {
      const mockSuspension = {
        id: 'susp-10',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          // Read inside the transaction, immediately before the suspension's
          // own write: `false` means someone else had already deactivated the
          // account, so a lift must leave it off rather than resurrect it.
          isActiveBefore: false,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: null,
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-10', 'lifter', 'Pulih');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('leaves a soft-deleted account deleted on lift', async () => {
      const mockSuspension = {
        id: 'susp-del',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        accountStateWriter: 'asw_test',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      };

      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        ...mockSuspension,
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        deletedAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      // A soft-deleted row can never match the conditional activation, which
      // requires `deletedAt: null`, so the database returns zero rows.
      (prisma.user.updateMany as any).mockResolvedValue({ count: 0 });

      await boardSuspensionService.liftBoardSuspension('susp-del', 'lifter', 'Pulih');

      // The activation is scoped to a non-deleted row, so the delete survives.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-pengurus',
          isActive: false,
          deletedAt: null,
          accountStateWriter: 'asw_test',
        },
        data: { isActive: true, accountStateWriter: expect.stringMatching(/^asw_/) },
      });
    });

    it('refuses a lift that loses the race and reports the conflict', async () => {
      // Two lifters can both read ACTIVE at READ COMMITTED. The conditional
      // `updateMany` decides inside the write statement, so the loser sees a
      // rowcount of 0 and must not overwrite the winner's attribution.
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
        id: 'susp-race',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: null,
      });
      (prisma.boardMemberSuspension.updateMany as any).mockResolvedValue({ count: 0 });

      await expect(
        boardSuspensionService.liftBoardSuspension('susp-race', 'loser', 'Pulih')
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('invalidates the suspension cache on lift instead of writing false', async () => {
      (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue({
        id: 'susp-11',
        userId: 'user-pengurus',
        status: 'ACTIVE',
        plhAssignmentCreated: false,
        plhAssignmentId: null,
        signingKeyLocks: null,
        accountStateSnapshot: {
          isActiveBefore: true,
        },
      });
      (prisma.boardMemberSuspension.findUniqueOrThrow as any).mockResolvedValue({
        id: 'susp-11',
        status: 'LIFTED',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        isActive: false,
        accountStateWriter: 'asw_test',
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      await boardSuspensionService.liftBoardSuspension('susp-11', 'lifter', 'Pulih');

      expect(invalidateUserSuspensionCache).toHaveBeenCalledWith('user-pengurus');
    });
  });
});

describe('PengawasanService periodic oversight report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('files the report as a DRAFT on the foundation unit with a CREATED flow event', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'pembina-1', unitId: null });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({
      id: 'letter-1',
      letterNumber: null,
      subject: '[Laporan Pengawasan] Audit Q1 (2026-Q1)',
      status: 'DRAFT',
    });

    const result = await pengawasanService.draftPeriodicReportToEOffice(
      {
        title: 'Audit Q1',
        period: '2026-Q1',
        executiveSummary: 'Ringkasan eksekutif yang cukup panjang.',
      },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    expect(result.status).toBe('DRAFT');
    expect(prisma.letter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: 'unit-pusat',
          status: 'DRAFT',
        }),
      })
    );
    expect(prisma.letterFlowEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ letterId: 'letter-1', action: 'CREATED' }),
      })
    );
  });

  it('refuses to file a global report when no foundation unit exists', async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'pembina-1' });
    (prisma.unit.findFirst as any).mockResolvedValue(null);

    await expect(
      pengawasanService.draftPeriodicReportToEOffice(
        { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
        'pengawas-1',
        { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.letter.create).not.toHaveBeenCalled();
  });

  it('only drafts the report for an effective (active, unexpired) Pembina', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'pembina-1', unitId: null });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({
      id: 'letter-1',
      letterNumber: null,
      status: 'DRAFT',
    });

    await pengawasanService.draftPeriodicReportToEOffice(
      { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // A former Pembina (inactive or expired assignment) must not be selected.
    // The query is Pembina-only — the Super Admin fallback is a separate,
    // second query that only runs when no effective Pembina exists.
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          deletedAt: null,
          userRoles: {
            some: expect.objectContaining({
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
              role: { code: 'YAYASAN_PEMBINA' },
            }),
          },
        }),
        orderBy: { createdAt: 'asc' },
      })
    );
    // The report went to the Pembina, not the Super Admin.
    expect(prisma.letter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipients: { create: [{ userId: 'pembina-1', unitId: 'unit-pusat', isCC: false }] },
        }),
      })
    );
  });

  it('prefers an effective Pembina over a Super Admin', async () => {
    // Both a Pembina and a Super Admin exist. One `findFirst` with an `OR` over
    // the two let Postgres choose, so the report could land on the
    // administrator instead of the officer it is meant for. The first query is
    // now Pembina-only.
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    let call = 0;
    (prisma.user.findFirst as any).mockImplementation(async () => {
      call += 1;
      return call === 1
        ? { id: 'pembina-1', unitId: null, name: 'Pembina Yayasan' }
        : { id: 'superadmin-1', unitId: null, name: 'Super Admin' };
    });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({ id: 'letter-1', status: 'DRAFT' });

    await pengawasanService.draftPeriodicReportToEOffice(
      { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // The Super Admin fallback must not even be asked for once a Pembina is found.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to an active Super Admin when no effective Pembina exists', async () => {
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    let call = 0;
    (prisma.user.findFirst as any).mockImplementation(async (args: any) => {
      call += 1;
      // First query is Pembina-only and comes back empty.
      return args?.where?.role === 'SUPER_ADMIN' ? { id: 'superadmin-1', unitId: null } : null;
    });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({ id: 'letter-1', status: 'DRAFT' });

    const result = await pengawasanService.draftPeriodicReportToEOffice(
      { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    expect(call).toBe(2);
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { isActive: true, deletedAt: null, role: 'SUPER_ADMIN' },
        orderBy: { createdAt: 'asc' },
      })
    );
    expect(result.status).toBe('DRAFT');
  });

  it('refuses to draft when neither an effective Pembina nor an active Super Admin exists', async () => {
    // No recipient means the letter would be filed as an orphan the E-Office
    // flow can never advance. The check must run before any write, so neither
    // the letter nor its flow event is created.
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(
      pengawasanService.draftPeriodicReportToEOffice(
        { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
        'pengawas-1',
        { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.letter.create).not.toHaveBeenCalled();
    expect(prisma.letterFlowEvent.create).not.toHaveBeenCalled();
  });
});
