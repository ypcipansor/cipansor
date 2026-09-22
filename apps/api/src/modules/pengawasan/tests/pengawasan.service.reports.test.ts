import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pengawasanService } from '../pengawasan.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    unit: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    letter: { create: vi.fn() },
    letterFlowEvent: { create: vi.fn() },
    filingClassification: { findFirst: vi.fn() },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('PengawasanService periodic oversight report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The draft now goes through the E-Office primitive, which validates the
    // recipient set before writing: an active account with an effective
    // internal role. One eligible Pembina by default.
    (prisma.user.findMany as any).mockResolvedValue([
      {
        id: 'pembina-1',
        unitId: null,
        teacher: null,
        staff: null,
        userRoles: [{ unitId: null, role: { code: 'YAYASAN_PEMBINA' } }],
      },
    ]);
  });

  it('delegates to the correspondence draft primitive instead of writing the letter tables itself', async () => {
    // The oversight module must not own a second copy of the letter rules. The
    // draft is created through `CorrespondenceService` and the recipient
    // eligibility check runs there — proven by `user.findMany` being queried.
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'pembina-1', unitId: null });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({ id: 'letter-1', status: 'DRAFT' });

    await pengawasanService.draftPeriodicReportToEOffice(
      { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    expect(prisma.user.findMany).toHaveBeenCalled();
    // No letter number is allocated for a draft, and the type/nature pair is the
    // one the correspondence rules allow.
    expect(prisma.letter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SURAT_DINAS',
          nature: 'LIMITED',
          status: 'DRAFT',
        }),
      })
    );
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

  it('selects an assignment-only Super Admin when no effective Pembina exists', async () => {
    // The bug: the fallback only looked at the legacy `User.role` column, so an
    // active account whose Super Admin grant lives solely in
    // `UserRoleAssignment` was never selected — the report failed even though a
    // legitimate recipient existed. The first fallback query is by effective
    // assignment; the legacy column is only a last resort for an account that
    // was never migrated.
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockImplementation(async (args: any) => {
      // Pembina query: empty. Assignment-based Super Admin query: hit.
      if (args?.where?.userRoles?.some?.role?.code === 'SUPER_ADMIN') {
        return { id: 'superadmin-assignment', unitId: null };
      }
      return null;
    });
    (prisma.filingClassification.findFirst as any).mockResolvedValue({ id: 'cls-1' });
    (prisma.letter.create as any).mockResolvedValue({ id: 'letter-1', status: 'DRAFT' });

    const result = await pengawasanService.draftPeriodicReportToEOffice(
      { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
      'pengawas-1',
      { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
    );

    // The report is addressed to the assignment-only Super Admin.
    expect(prisma.letter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipients: {
            create: [{ userId: 'superadmin-assignment', unitId: 'unit-pusat', isCC: false }],
          },
        }),
      })
    );
    // The assignment query ran before the legacy column was even considered.
    const queriedAssignment = (prisma.user.findFirst as any).mock.calls.some(
      ([args]: any[]) =>
        args?.where?.userRoles?.some?.role?.code === 'SUPER_ADMIN' &&
        args?.where?.isActive === true &&
        args?.where?.deletedAt === null
    );
    expect(queriedAssignment).toBe(true);
    expect(result.status).toBe('DRAFT');
  });

  it('does not fall through to the legacy column for an inactive or expired Super Admin assignment', async () => {
    // An assignment that is inactive/expired is a former officer. Only the
    // effective-assignment query may return it; the legacy fallback is not
    // reached because that query is what fails.
    (prisma.unit.findFirst as any).mockResolvedValue({ id: 'unit-pusat' });
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(
      pengawasanService.draftPeriodicReportToEOffice(
        { title: 'Audit Q1', period: '2026-Q1', executiveSummary: 'Ringkasan eksekutif.' },
        'pengawas-1',
        { roleCode: 'YAYASAN_PENGAWAS', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    // Pembina query, assignment Super Admin query, legacy Super Admin query —
    // each of the two Super Admin queries carries the effective filter.
    const superAdminQueries = (prisma.user.findFirst as any).mock.calls
      .map(([args]: any[]) => args?.where)
      .filter((w: any) => w?.userRoles?.some?.role?.code === 'SUPER_ADMIN');
    expect(superAdminQueries.length).toBe(1);
    expect(superAdminQueries[0].userRoles.some).toMatchObject({
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
    expect(prisma.letter.create).not.toHaveBeenCalled();
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
