import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wbsService } from './wbs.service';
import { boardSuspensionService } from './board-suspension.service';
import { pengawasanService } from './pengawasan.service';
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
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
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
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

vi.mock('@/utils/user-suspension', () => ({
  markUserSuspended: vi.fn().mockResolvedValue(undefined),
  unmarkUserSuspended: vi.fn().mockResolvedValue(undefined),
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
  });
});

describe('BoardSuspensionService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    (prisma.userSigningKey.findMany as any).mockResolvedValue([]);
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
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-pengurus' },
      data: { isActive: false },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-pengurus' },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-pengurus' },
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

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA', 'SDIT_SISWA', 'SDIT_GURU'])(
    'refuses to suspend a non-Pengurus target (%s)',
    async (code) => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-x',
        isActive: true,
        userRoles: [{ role: { code } }],
      });

      await expect(
        boardSuspensionService.suspendBoardMember(
          { userId: 'user-x', skNumber: 'SK/1', auditReason: 'alasan audit yang panjang' },
          'issuer-pengawas'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.boardMemberSuspension.create).not.toHaveBeenCalled();
    }
  );

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
      plhUserId: 'user-sekretaris',
      plhRoleCode: 'YAYASAN_KETUA',
      plhAssignmentCreated: true,
      plhAssignmentId: 'assign-new',
      plhAssignmentRestore: null,
      signingKeyLocks: { 'key-1': null, 'key-2': '2026-01-01T00:00:00.000Z' },
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.update as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });

    const updated = await boardSuspensionService.liftBoardSuspension(
      'susp-1',
      'lifter-pembina',
      'Penyelidikan selesai'
    );

    expect(updated.status).toBe('LIFTED');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-pengurus' },
      data: { isActive: true },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', userId: 'user-pengurus' },
      data: { lockedUntil: null },
    });
    expect(prisma.userSigningKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', userId: 'user-pengurus' },
      data: { lockedUntil: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'assign-new' },
    });
  });

  it('leaves a pre-existing effective Plh assignment alone on lift', async () => {
    const mockSuspension = {
      id: 'susp-2',
      userId: 'user-pengurus',
      status: 'ACTIVE',
      plhAssignmentCreated: false,
      plhAssignmentId: null,
      plhAssignmentRestore: null,
      signingKeyLocks: null,
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.update as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
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
      plhAssignmentCreated: false,
      plhAssignmentId: 'assign-old',
      plhAssignmentRestore: { isActive: false, expiresAt: '2020-01-01T00:00:00.000Z' },
      signingKeyLocks: null,
    };

    (prisma.boardMemberSuspension.findUnique as any).mockResolvedValue(mockSuspension);
    (prisma.boardMemberSuspension.update as any).mockResolvedValue({
      ...mockSuspension,
      status: 'LIFTED',
    });

    await boardSuspensionService.liftBoardSuspension('susp-3', 'lifter-pembina', 'Pulih');

    expect(prisma.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: 'assign-old' },
      data: { isActive: false, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
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

    const result = await pengawasanService.submitPeriodicReportToEOffice(
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
      pengawasanService.submitPeriodicReportToEOffice(
        { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
        'pengawas-1',
        { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.letter.create).not.toHaveBeenCalled();
  });
});
