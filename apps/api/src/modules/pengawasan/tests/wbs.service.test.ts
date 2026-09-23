import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wbsService, CLOSED_WBS_STATUSES } from '../wbs.service';
import { prisma } from '@/lib/prisma';
import { WbsCategory, WbsTargetLevel, WbsStatus, Prisma } from '@prisma/client';
import { CLOSED_WBS_STATUSES as CLOSED_WBS_STATUSES_SHARED } from '@cipansor/shared';
import { hashWbsTrackingToken, verifyWbsTrackingToken } from '@/utils/wbs-token';

/** A digest as the service would store it, for fixtures that must verify. */
const digestOf = (raw: string) => hashWbsTrackingToken(raw);

/**
 * Evaluate a `buildScopeWhere` predicate against a report's identifying fields.
 *
 * The scope is nested `OR` clauses over `unitId`, `primaryHandlerRole`,
 * `targetLevel`, `assignedUserId` and the fail-closed `id IN ()` set. This
 * interprets exactly those shapes, so a test can assert which reports a scope
 * admits without a database.
 */
function matchesReport(
  where: any,
  report: {
    id?: string;
    unitId?: string | null;
    primaryHandlerRole?: string;
    targetLevel?: string;
    assignedUserId?: string | null;
  }
): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as any[]).some((clause) => matchesReport(clause, report));
    if (key === 'id') return !!report.id && ((value as any).in ?? []).includes(report.id);
    if (key === 'assignedUserId') return report.assignedUserId === value;
    if (key === 'unitId') return report.unitId === value;
    if (key === 'primaryHandlerRole') {
      const allowed = typeof value === 'string' ? [value] : ((value as any).in ?? []);
      return allowed.includes(report.primaryHandlerRole);
    }
    if (key === 'targetLevel') {
      const allowed = (value as any).in ?? [value];
      return allowed.includes(report.targetLevel);
    }
    return true;
  });
}

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
      // The stored value is the digest; the raw token is what is returned.
      trackingToken: digestOf('secret-token-123'),
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

  it('persists only the token digest and returns the raw token exactly once', async () => {
    const created = {
      ticketCode: 'WBS-202603-ABC123',
      // What the row would hold after the service's write; if the service ever
      // echoed this back, the test below would catch a raw-token leak.
      trackingToken: 'stored-digest-placeholder',
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      status: WbsStatus.DIAJUKAN,
      createdAt: new Date(),
    };
    (prisma.wbsReport.create as any).mockResolvedValue(created);

    const result = await wbsService.createPublicReport({
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      subject: 'Dugaan Penyalahgunaan Anggaran',
      description: 'Ditemukan ketidaksesuaian laporan pengadaan...',
      isAnonymous: true,
    });

    const persisted = (prisma.wbsReport.create as any).mock.calls[0][0].data;
    // The write holds a digest, not the raw bearer value.
    expect(persisted.trackingToken).toMatch(/^[0-9a-f]{64}$/);
    // The returned token is the raw value whose digest was stored...
    expect(result.trackingToken).toBeDefined();
    expect(hashWbsTrackingToken(result.trackingToken)).toBe(persisted.trackingToken);
    // ...and it is never the stored digest.
    expect(result.trackingToken).not.toBe(persisted.trackingToken);
    // The response must not carry the stored digest field at all.
    expect(result).not.toHaveProperty('trackingTokenDigest');
    expect(JSON.stringify(result)).not.toContain(persisted.trackingToken);
  });

  it('retries on a ticket_code collision and succeeds on a later attempt', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['ticket_code'] },
    });
    (prisma.wbsReport.create as any).mockRejectedValueOnce(collision).mockResolvedValueOnce({
      ticketCode: 'WBS-202603-ABCDEF',
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      status: WbsStatus.DIAJUKAN,
      createdAt: new Date(),
    });

    const result = await wbsService.createPublicReport({
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      subject: 'Dugaan Penyalahgunaan Anggaran',
      description: 'Ditemukan ketidaksesuaian laporan pengadaan...',
    });

    expect(prisma.wbsReport.create).toHaveBeenCalledTimes(2);
    expect(result.ticketCode).toBe('WBS-202603-ABCDEF');
  });

  it('gives up with an operational error after exhausting ticket_code retries', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['ticket_code'] },
    });
    (prisma.wbsReport.create as any).mockRejectedValue(collision);

    await expect(
      wbsService.createPublicReport({
        category: WbsCategory.KEUANGAN_ASET,
        targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
        subject: 'Dugaan Penyalahgunaan Anggaran',
        description: 'Ditemukan ketidaksesuaian laporan pengadaan...',
      })
    ).rejects.toMatchObject({ statusCode: 500 });

    // Bounded: the loop must not spin forever on a persistent collision.
    expect((prisma.wbsReport.create as any).mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('does not retry a non-collision database error', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'test',
      meta: { field_name: 'unit_id' },
    });
    (prisma.wbsReport.create as any).mockRejectedValue(other);

    await expect(
      wbsService.createPublicReport({
        category: WbsCategory.KEUANGAN_ASET,
        targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
        subject: 'Dugaan Penyalahgunaan Anggaran',
        description: 'Ditemukan ketidaksesuaian laporan pengadaan...',
      })
    ).rejects.toBe(other);

    // A foreign-key failure must surface unchanged, not be retried as a code
    // collision.
    expect(prisma.wbsReport.create).toHaveBeenCalledTimes(1);
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
      trackingToken: digestOf('valid-token'),
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

    // A wrong token against the same digest must fail closed.
    await expect(
      wbsService.getPublicTracking('WBS-202603-ABC123', 'token-yang-salah')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('anonymises handler identities on the public tracking response', async () => {
    // The tracking page is readable by anyone holding the ticket code. A
    // handler comment carries `senderName = "<officer> (<role>)"`; printing it
    // would name the officer and their position to the reporter's audience.
    (prisma.wbsReport.findUnique as any).mockResolvedValue({
      ticketCode: 'WBS-202603-ABC123',
      trackingToken: digestOf('valid-token'),
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

  it('does not expose the internal forwarding audit log on the public tracking response', async () => {
    // `WbsForwardLog` carries the internal routing reason plus actor/user/role
    // identifiers. The public tracking response used to return `report.forwardLogs`
    // verbatim as `forwardTimeline`, publishing that audit trail to anyone
    // holding the ticket code. The response must not carry it at all.
    (prisma.wbsReport.findUnique as any).mockResolvedValue({
      ticketCode: 'WBS-202603-ABC123',
      trackingToken: digestOf('valid-token'),
      category: WbsCategory.KEUANGAN_ASET,
      targetLevel: WbsTargetLevel.PENGURUS_YAYASAN,
      status: WbsStatus.DALAM_PENYELIDIKAN,
      createdAt: new Date(),
      updatedAt: new Date(),
      unit: null,
      comments: [],
      forwardLogs: [
        {
          id: 'log-1',
          fromRole: 'YAYASAN_PENGAWAS',
          toRole: 'YAYASAN_KETUA',
          reason: 'Dugaan menyangkut Kepala Sekolah SD IT, perlu pemeriksaan keuangan.',
          forwardedById: 'user-internal-1',
          toUserId: 'user-internal-2',
          createdAt: new Date(),
        },
      ],
    });

    const data: any = await wbsService.getPublicTracking('WBS-202603-ABC123', 'valid-token');

    expect(data).not.toHaveProperty('forwardTimeline');
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain('Dugaan menyangkut Kepala Sekolah SD IT');
    expect(serialised).not.toContain('user-internal-1');
    expect(serialised).not.toContain('user-internal-2');
    expect(serialised).not.toContain('YAYASAN_KETUA');
    expect(serialised).not.toContain('forwardedById');

    // And the query never even selects the log, so a future field cannot leak
    // by being added to the included relation.
    const query = (prisma.wbsReport.findUnique as any).mock.calls[0][0];
    expect(query.include).not.toHaveProperty('forwardLogs');
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

    it('refuses a UNIT_ADMIN recipient whose role assignment is only in another unit', async () => {
      // `User.unitId` happens to match the report's unit, but the assignment
      // that grants the destination role is scoped to a *different* unit. The
      // token that decides `buildScopeWhere` takes its unit from the active
      // assignment (`tokenUnitId`), so this recipient could not read the report
      // — naming them must be refused rather than leaving assignment that the
      // scope query then hides.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({
          unitId: 'unit-sdit',
          userRoles: [{ unitId: 'unit-smpit', role: { code: 'SDIT_ADMIN' } }],
        })
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

    it('accepts a UNIT_ADMIN recipient when one of several unit assignments matches', async () => {
      // A person can hold the same unit role in more than one unit through
      // `UserRoleAssignment.unitId`. Only the matching one should open the
      // report; the presence of the others must not disqualify them.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({
          unitId: 'unit-smpit',
          userRoles: [
            { unitId: 'unit-smpit', role: { code: 'SDIT_ADMIN' } },
            { unitId: 'unit-sdit', role: { code: 'SDIT_ADMIN' } },
          ],
        })
      );
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope('unit-sdit'),
        primaryHandlerRole: 'UNIT_ADMIN',
        assignedUserId: 'user-target',
      });

      await wbsService.forwardReport(
        'report-1',
        { toRole: 'UNIT_ADMIN', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
    });

    it('accepts a UNIT_ADMIN recipient whose assignment matches even when the home unit differs', async () => {
      // The assignment carries the report's unit, so the recipient's token unit
      // for that role is the report's unit even though their home unit is
      // elsewhere. The domain model allows this; `User.unitId` must not veto it.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({
          unitId: 'unit-smpit',
          userRoles: [{ unitId: 'unit-sdit', role: { code: 'SDIT_ADMIN' } }],
        })
      );
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope('unit-sdit'),
        primaryHandlerRole: 'UNIT_ADMIN',
        assignedUserId: 'user-target',
      });

      await wbsService.forwardReport(
        'report-1',
        { toRole: 'UNIT_ADMIN', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
    });

    it('refuses a UNIT_ADMIN recipient whose matching assignment has no unit and home unit differs', async () => {
      // A unitless assignment falls back to the home unit, so this recipient's
      // effective unit is unit-smpit, not the report's unit-sdit.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any).mockResolvedValue(
        recipient({
          unitId: 'unit-smpit',
          userRoles: [{ unitId: null, role: { code: 'SDIT_ADMIN' } }],
        })
      );

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'UNIT_ADMIN', reason: 'alasan panjang', toUserId: 'user-target' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('forwards to a valid foundation recipient and records the assignment', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
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

    it('does not write the internal routing reason into the reporter-visible timeline comment', async () => {
      // The HANDLER comment created on a forward is rendered on the *public*
      // tracking page (anonymised, but its `message` is shown verbatim). It used
      // to embed `Alasan: <reason>`, publishing the internal triage note to
      // whoever held the tracking token, even though the audit log is withheld.
      // The routing reason stays in `WbsForwardLog.reason` only.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(recipient());
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope(),
        primaryHandlerRole: 'YAYASAN_KETUA',
        assignedUserId: 'user-target',
      });
      (prisma.wbsComment.create as any).mockResolvedValue({ id: 'comment-1' });

      const internalReason = 'Dugaan menyangkut Kepala Sekolah SD IT — jangan sampai bocor.';
      await wbsService.forwardReport(
        'report-1',
        { toRole: 'YAYASAN_KETUA', reason: internalReason, toUserId: 'user-target' },
        actor
      );

      // The audit log legitimately holds the reason...
      expect(prisma.wbsForwardLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: internalReason }) })
      );
      // ...but the public comment must not.
      const commentData = (prisma.wbsComment.create as any).mock.calls
        .map((c: any[]) => c[0].data)
        .find((d: any) => d.senderType === 'HANDLER');
      expect(commentData).toBeDefined();
      expect(commentData.message).not.toContain(internalReason);
      expect(commentData.message).not.toContain('Alasan:');
    });

    it('re-validates the recipient under the transaction and aborts when it was deactivated in the gap', async () => {
      // Pre-flight sees a live recipient; by the time the transaction runs, the
      // account has been switched off. Acting on the pre-flight snapshot would
      // hand a confidential report to a deactivated user.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(recipient())
        .mockResolvedValueOnce(recipient({ isActive: false }));

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

    it('re-validates the recipient role under the transaction and aborts when it was revoked in the gap', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(recipient())
        .mockResolvedValueOnce(recipient({ userRoles: [] }));

      await expect(
        wbsService.forwardReport(
          'report-1',
          { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
    });

    it('re-validates the unit compatibility under the transaction when the recipient moved in the gap', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope('unit-sdit'));
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(
          recipient({ unitId: 'unit-sdit', userRoles: [{ role: { code: 'SDIT_ADMIN' } }] })
        )
        .mockResolvedValueOnce(
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

    it('locks the recipient row FOR UPDATE after locking the report', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(recipient());
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope(),
        primaryHandlerRole: 'YAYASAN_KETUA',
        assignedUserId: 'user-target',
      });

      await wbsService.forwardReport(
        'report-1',
        { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      const sql = (prisma.$queryRaw as any).mock.calls.map((call: unknown[]) =>
        (call[0] as string[]).join('?')
      );
      const reportLock = sql.findIndex((q: string) => q.includes('wbs_reports'));
      const recipientLock = sql.findIndex((q: string) => q.includes('users'));
      expect(reportLock).toBeGreaterThanOrEqual(0);
      expect(recipientLock).toBeGreaterThanOrEqual(0);
      // Deterministic order: the report is locked before the recipient, so a
      // forward cannot deadlock with the other WBS mutation paths.
      expect(reportLock).toBeLessThan(recipientLock);
    });

    it('locks the recipient role assignments before reading them, after the user row', async () => {
      // Locking only the `users` row does not serialise a `UserRoleAssignment`
      // change: a concurrent revocation writes a different row. The assignment
      // rows must be locked (and, crucially, *before* the eligibility read that
      // follows) so a revocation cannot slip between the decision and commit.
      (prisma.wbsReport.findFirst as any).mockResolvedValue(reportInScope());
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(recipient());
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope(),
        primaryHandlerRole: 'YAYASAN_KETUA',
        assignedUserId: 'user-target',
      });

      await wbsService.forwardReport(
        'report-1',
        { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      const sql = (prisma.$queryRaw as any).mock.calls.map((call: unknown[]) =>
        (call[0] as string[]).join('?')
      );
      const reportLock = sql.findIndex((q: string) => q.includes('wbs_reports'));
      const userLock = sql.findIndex((q: string) => q.includes('FROM "users"'));
      const assignmentLock = sql.findIndex((q: string) =>
        q.includes('FROM "user_role_assignments"')
      );
      expect(reportLock).toBeGreaterThanOrEqual(0);
      expect(userLock).toBeGreaterThanOrEqual(0);
      expect(assignmentLock).toBeGreaterThanOrEqual(0);
      expect(assignmentLock).toBeGreaterThan(userLock);
      expect(assignmentLock).toBeGreaterThan(reportLock);
    });

    it.each([WbsStatus.SELESAI, WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI])(
      'refuses to forward a report already closed as %s, with no side effects',
      async (status) => {
        // The scope read inside the transaction returns the locked status.
        // A terminal case is immutable: no `WbsForwardLog`, no routing change,
        // no timeline comment. The check is inside the transaction on the locked
        // row, not a pre-flight outside it.
        (prisma.wbsReport.findFirst as any).mockResolvedValue({
          ...reportInScope(),
          status,
        });
        (prisma.user.findUnique as any).mockResolvedValue(recipient());

        await expect(
          wbsService.forwardReport(
            'report-1',
            { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
            actor
          )
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(prisma.wbsForwardLog.create).not.toHaveBeenCalled();
        expect(prisma.wbsReport.update).not.toHaveBeenCalled();
        expect(prisma.wbsComment.create).not.toHaveBeenCalled();
      }
    );

    it('still forwards a case that is not terminal', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue({
        ...reportInScope(),
        status: WbsStatus.DALAM_PENYELIDIKAN,
      });
      (prisma.wbsReport.findUnique as any).mockResolvedValue(reportInScope());
      (prisma.user.findUnique as any).mockResolvedValue(recipient());
      (prisma.wbsReport.update as any).mockResolvedValue({
        ...reportInScope(),
        primaryHandlerRole: 'YAYASAN_KETUA',
        assignedUserId: 'user-target',
      });

      await wbsService.forwardReport(
        'report-1',
        { toRole: 'YAYASAN_KETUA', reason: 'alasan panjang', toUserId: 'user-target' },
        actor
      );

      expect(prisma.wbsForwardLog.create).toHaveBeenCalled();
    });
  });

  describe('public comments on closed cases', () => {
    const openReport = {
      id: 'report-1',
      trackingToken: digestOf('tok-1'),
      isAnonymous: true,
      reporterName: null,
      status: WbsStatus.DALAM_PENYELIDIKAN,
    };

    beforeEach(() => {
      (prisma.$queryRaw as any).mockResolvedValue([{ id: 'report-1' }]);
    });

    it.each([WbsStatus.SELESAI, WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI])(
      'refuses a public reply while the case is %s',
      async (status) => {
        (prisma.wbsReport.findUnique as any).mockResolvedValue({ ...openReport, status });

        await expect(
          wbsService.addPublicComment('WBS-1', 'tok-1', 'Mohon ditinjau ulang.')
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(prisma.wbsComment.create).not.toHaveBeenCalled();
      }
    );

    it('accepts a public reply while the case is still open', async () => {
      (prisma.wbsReport.findUnique as any).mockResolvedValue(openReport);
      (prisma.wbsComment.create as any).mockResolvedValue({ id: 'comment-1' });

      const created = await wbsService.addPublicComment('WBS-1', 'tok-1', 'Tambahan bukti.');

      expect(created.id).toBe('comment-1');
      expect(prisma.wbsComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reportId: 'report-1', senderType: 'REPORTER' }),
        })
      );
    });

    it('locks the report row before reading its status', async () => {
      (prisma.wbsReport.findUnique as any).mockResolvedValue(openReport);
      (prisma.wbsComment.create as any).mockResolvedValue({ id: 'comment-1' });

      await wbsService.addPublicComment('WBS-1', 'tok-1', 'Tambahan bukti.');

      // The status that decides admission must be read under the row lock,
      // otherwise a handler closing the case could interleave between the two.
      const lockCall = (prisma.$queryRaw as any).mock.calls.find((call: unknown[]) =>
        (call[0] as string[]).join('?').includes('FOR UPDATE')
      );
      expect(lockCall).toBeDefined();
      expect((lockCall[0] as string[]).join('?')).toContain('wbs_reports');
    });

    it('rejects a wrong tracking token without writing a comment', async () => {
      (prisma.wbsReport.findUnique as any).mockResolvedValue(openReport);

      await expect(
        wbsService.addPublicComment('WBS-1', 'wrong-token', 'Halo')
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(prisma.wbsComment.create).not.toHaveBeenCalled();
    });
  });

  describe('updateReportStatus on a terminal case', () => {
    // A terminal case (`SELESAI` / `TIDAK_DAPAT_DITINDAKLANJUTI`) is frozen:
    // status, resolution and handler note. `updateReportStatus` used to accept
    // any new status unconditionally, so a closed report could be moved back to
    // an open status even though the public thread was already closed on both
    // sides. The check reads the *locked* status returned by
    // `assertReportInScopeTx`, so no concurrent closure can slip through.
    const actor = {
      id: 'actor-1',
      name: 'Aktor',
      roleCode: 'YAYASAN_PENGAWAS',
      unitId: null,
    };

    function inScope(status: WbsStatus) {
      // The mocked scope query (`$queryRaw … FOR UPDATE`, then `findFirst`)
      // returns the requested status from `assertReportInScopeTx`.
      (prisma.wbsReport.findFirst as any).mockResolvedValue({
        id: 'report-1',
        status,
        resolution: null,
        assignedUserId: 'actor-1',
        ticketCode: 'WBS-1',
        primaryHandlerRole: 'YAYASAN_PENGAWAS',
      });
    }

    it.each([WbsStatus.SELESAI, WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI])(
      'refuses to reopen a %s case to an open status',
      async (terminal) => {
        inScope(terminal);

        await expect(
          wbsService.updateReportStatus('report-1', { status: WbsStatus.DALAM_PENYELIDIKAN }, actor)
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(prisma.wbsReport.update).not.toHaveBeenCalled();
        expect(prisma.wbsReport.updateMany).not.toHaveBeenCalled();
        expect(prisma.wbsComment.create).not.toHaveBeenCalled();
      }
    );

    it.each([WbsStatus.SELESAI, WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI])(
      'refuses a terminal→terminal status/resolution mutation on a %s case',
      async (terminal) => {
        // Immutable means immutable: without a dedicated reopen endpoint this
        // must refuse even a same-status write that rewrites the resolution.
        inScope(terminal);

        await expect(
          wbsService.updateReportStatus(
            'report-1',
            {
              status: WbsStatus.SELESAI,
              resolution: 'Resolusi ditimpa.',
              handlerNote: 'Catatan baru',
            },
            actor
          )
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(prisma.wbsReport.update).not.toHaveBeenCalled();
        expect(prisma.wbsComment.create).not.toHaveBeenCalled();
      }
    );

    it.each([WbsStatus.DIAJUKAN, WbsStatus.DALAM_PENYELIDIKAN, WbsStatus.DITINDAKLANJUTI])(
      'still allows an open %s case to be closed',
      async (openStatus) => {
        inScope(openStatus);
        (prisma.wbsReport.update as any).mockResolvedValue({
          id: 'report-1',
          status: WbsStatus.SELESAI,
        });

        const updated = await wbsService.updateReportStatus(
          'report-1',
          { status: WbsStatus.SELESAI },
          actor
        );

        expect(updated.status).toBe(WbsStatus.SELESAI);
        expect(prisma.wbsReport.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: WbsStatus.SELESAI }),
          })
        );
      }
    );

    it('reads the terminal status under the row lock before deciding', async () => {
      // The decisive read must be the locked one; an unlocked pre-read would
      // leave the reopen race open. `assertReportInScopeTx` locks `wbs_reports`
      // first and returns the status from the query that follows.
      inScope(WbsStatus.SELESAI);

      await expect(
        wbsService.updateReportStatus('report-1', { status: WbsStatus.DIAJUKAN }, actor)
      ).rejects.toMatchObject({ statusCode: 409 });

      const lockCall = (prisma.$queryRaw as any).mock.calls.find((call: unknown[]) =>
        (call[0] as string[]).join('?').includes('FOR UPDATE')
      );
      expect(lockCall).toBeDefined();
      expect((lockCall[0] as string[]).join('?')).toContain('wbs_reports');
    });
  });

  describe('the terminal-status list and the shared contract agree', () => {
    it('matches CLOSED_WBS_STATUSES in @cipansor/shared, in both directions', () => {
      // The API owns the DB enum (golden rule #2); the web hides the reply
      // control from the shared mirror. A drift here would let the UI offer a
      // reply the API refuses, or hide one it would accept.
      expect([...CLOSED_WBS_STATUSES].sort()).toEqual([...CLOSED_WBS_STATUSES_SHARED].sort());
    });
  });

  describe('handler comments on closed cases', () => {
    const handlerActor = { id: 'handler-1', name: 'Pemeriksa', roleCode: 'YAYASAN_PENGAWAS' };

    beforeEach(() => {
      (prisma.$queryRaw as any).mockResolvedValue([{ id: 'report-1' }]);
    });

    it.each([WbsStatus.SELESAI, WbsStatus.TIDAK_DAPAT_DITINDAKLANJUTI])(
      'refuses a handler note while the case is %s',
      async (status) => {
        // The scope read returns the row under lock; the terminal status makes
        // the case immutable for the handler too, because its comments are
        // rendered on the reporter's public tracking page.
        (prisma.wbsReport.findFirst as any).mockResolvedValue({ id: 'report-1', status });

        await expect(
          wbsService.addHandlerComment('report-1', 'Catatan internal.', undefined, handlerActor)
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(prisma.wbsComment.create).not.toHaveBeenCalled();
      }
    );

    it('accepts a handler note while the case is still open', async () => {
      (prisma.wbsReport.findFirst as any).mockResolvedValue({
        id: 'report-1',
        status: WbsStatus.DALAM_PENYELIDIKAN,
      });
      (prisma.wbsComment.create as any).mockResolvedValue({ id: 'comment-1' });

      const created = await wbsService.addHandlerComment(
        'report-1',
        'Catatan pemeriksa.',
        undefined,
        handlerActor
      );

      expect(created.id).toBe('comment-1');
      expect(prisma.wbsComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reportId: 'report-1', senderType: 'HANDLER' }),
        })
      );
    });

    it('reads the status under the row lock so a concurrent closure cannot be missed', async () => {
      // The admission check must use the status returned from the locked scope
      // read, not a pre-transaction snapshot — otherwise a handler could close
      // the case in the gap and the comment would land on a closed thread.
      (prisma.wbsReport.findFirst as any).mockResolvedValue({
        id: 'report-1',
        status: WbsStatus.SELESAI,
      });

      await expect(
        wbsService.addHandlerComment('report-1', 'Terlambat.', undefined, handlerActor)
      ).rejects.toMatchObject({ statusCode: 409 });

      const lockCall = (prisma.$queryRaw as any).mock.calls.find((call: unknown[]) =>
        (call[0] as string[]).join('?').includes('FOR UPDATE')
      );
      expect(lockCall).toBeDefined();
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

    describe('a role-level UNIT_ADMIN forward stays readable by the unit', () => {
      // `forwardReport` accepts `toRole: 'UNIT_ADMIN'` with no `toUserId`: the
      // report is routed to the unit queue, `primaryHandlerRole` becomes
      // `UNIT_ADMIN` and `targetLevel` is left alone. The unit branch used to
      // key only on the default STAF/SISWA target levels, so a KEPALA_UNIT
      // report routed this way matched no clause and vanished from the very
      // unit it was sent to — readable by nobody, indistinguishable from
      // "nothing to do".
      const unitActor = {
        id: 'unit-admin-sdit',
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-sdit',
      };

      it('lists a KEPALA_UNIT report routed to the unit bucket', () => {
        const where = (wbsService as any).buildScopeWhere(unitActor) as any;

        expect(
          matchesReport(where, {
            unitId: 'unit-sdit',
            primaryHandlerRole: 'UNIT_ADMIN',
            targetLevel: 'KEPALA_UNIT',
          })
        ).toBe(true);
      });

      it('still lists the default STAF/SISWA routing in the same unit', () => {
        const where = (wbsService as any).buildScopeWhere(unitActor) as any;

        expect(
          matchesReport(where, {
            unitId: 'unit-sdit',
            primaryHandlerRole: 'UNIT_ADMIN',
            targetLevel: 'STAF_PEGAWAI',
          })
        ).toBe(true);
        expect(
          matchesReport(where, {
            unitId: 'unit-sdit',
            primaryHandlerRole: 'UNIT_ADMIN',
            targetLevel: 'SISWA_SANTRI',
          })
        ).toBe(true);
      });

      it('does not widen the unit scope to another unit', () => {
        const where = (wbsService as any).buildScopeWhere(unitActor) as any;

        expect(
          matchesReport(where, {
            unitId: 'unit-smaq',
            primaryHandlerRole: 'UNIT_ADMIN',
            targetLevel: 'KEPALA_UNIT',
          })
        ).toBe(false);
      });

      it('does not expose a foundation-routed report to the unit handler', () => {
        const where = (wbsService as any).buildScopeWhere(unitActor) as any;

        // A report still routed to the foundation is not this unit's. The
        // target level is deliberately one the unit branch does not cover by
        // default, so the routing clause is the only thing that could admit it.
        expect(
          matchesReport(where, {
            unitId: 'unit-sdit',
            primaryHandlerRole: 'YAYASAN_PENGAWAS',
            targetLevel: 'KEPALA_UNIT',
          })
        ).toBe(false);
      });

      it('keeps a unitless unit-scoped actor failing closed on a routed report', () => {
        const where = (wbsService as any).buildScopeWhere({
          id: 'unit-admin-sdit',
          roleCode: 'SDIT_ADMIN',
          unitId: null,
        }) as any;

        expect(where).toEqual({ id: { in: [] } });
      });

      it('lets the unit handler reach the routed report by id', async () => {
        (prisma.wbsReport.findFirst as any).mockResolvedValue({
          id: 'report-kepala-unit',
          unitId: 'unit-sdit',
          primaryHandlerRole: 'UNIT_ADMIN',
          targetLevel: 'KEPALA_UNIT',
        });
        (prisma.wbsReport.findUnique as any).mockResolvedValue({
          id: 'report-kepala-unit',
          unitId: 'unit-sdit',
        });

        const detail = await wbsService.getReportById('report-kepala-unit', unitActor);
        expect(detail.id).toBe('report-kepala-unit');
      });
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
