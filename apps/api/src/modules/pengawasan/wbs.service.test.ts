import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wbsService } from './wbs.service';
import { boardSuspensionService } from './board-suspension.service';
import { prisma } from '@/lib/prisma';
import { WbsCategory, WbsTargetLevel, WbsStatus } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    wbsReport: {
      create: vi.fn(),
      findUnique: vi.fn(),
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
      update: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    userSigningKey: {
      deleteMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRoleAssignment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
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

  it('forwards WBS report to another role', async () => {
    const mockReport = {
      id: 'report-1',
      ticketCode: 'WBS-202603-ABC123',
      primaryHandlerRole: 'YAYASAN_PENGAWAS',
    };

    (prisma.wbsReport.findUnique as any).mockResolvedValue(mockReport);
    (prisma.wbsReport.update as any).mockResolvedValue({ ...mockReport, primaryHandlerRole: 'YAYASAN_KETUA' });

    const updated = await wbsService.forwardReport(
      'report-1',
      { toRole: 'YAYASAN_KETUA', reason: 'Pelanggaran menyangkut Kepala Sekolah SD IT' },
      { id: 'user-pengawas', name: 'Ketua Pengawas', roleCode: 'YAYASAN_PENGAWAS' }
    );

    expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
    expect(prisma.wbsReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          primaryHandlerRole: 'YAYASAN_KETUA',
        }),
      })
    );
  });
});

describe('BoardSuspensionService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suspends board member and deactivates user account', async () => {
    const mockUser = {
      id: 'user-pengurus',
      name: 'Pengurus Fulan',
      email: 'pengurus@cipansor.or.id',
      isActive: true,
      userRoles: [],
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockUser);
    (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    (prisma.boardMemberSuspension.create as any).mockResolvedValue({
      id: 'susp-1',
      userId: 'user-pengurus',
      skNumber: 'SK/PENGAWAS/2026/001',
      status: 'ACTIVE',
    });

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
    expect(prisma.userSigningKey.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-pengurus' },
    });
  });
});
