import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StudentIdCardService } from '../id-card.service';
import { prisma } from '@/lib/prisma';
import { StudentCardStatus } from '@prisma/client';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
    },
    class: {
      findUnique: vi.fn(),
    },
    classEnrollment: {
      findMany: vi.fn(),
    },
    studentCardState: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

const superAdmin = (): JwtPayload => ({
  id: 'who-123',
  sub: 'who-123',
  email: 'root@cipansor.or.id',
  roleId: 'role-root',
  roleCode: 'SUPER_ADMIN',
  permissions: [],
  type: 'access',
  role: 'SUPER_ADMIN',
  unitId: null,
});

const aCardDetail = () => ({
  cardData: {
    validity: {
      issuedDate: '2026-07-01T00:00:00.000Z',
      validUntil: '2027-07-01T00:00:00.000Z',
      cardNumber: 'CARD-1',
    },
    qrCode: {
      data: 'cipansor://abc#0123456789abcdef',
      verificationUrl: 'https://cipansor.or.id/public/verify-card?data=x',
    },
  },
});

describe('StudentIdCardService.generateBulkIdCards — class preview is READ-ONLY', () => {
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.class.findUnique as any).mockResolvedValue({
      id: 'class-1',
      name: '7A',
      academicYearId: 'ay-1',
    });
    (prisma.classEnrollment.findMany as any).mockResolvedValue([
      { student: { id: 's1' } },
      { student: { id: 's2' } },
    ]);
    previewSpy = vi
      .spyOn(StudentIdCardService, 'getOrGeneratePreviewIdCard')
      .mockResolvedValue(aCardDetail() as never);
    generateSpy = vi
      .spyOn(StudentIdCardService, 'generateIdCard')
      .mockResolvedValue(aCardDetail() as never);
  });

  afterEach(() => {
    previewSpy.mockRestore();
    generateSpy.mockRestore();
  });

  it('builds every card via the read-only PREVIEW path, not generateIdCard', async () => {
    await StudentIdCardService.generateBulkIdCards('class-1', 'ay-1');

    expect(previewSpy).toHaveBeenCalledWith('s1', {});
    expect(previewSpy).toHaveBeenCalledWith('s2', {});
    // The class preview must NEVER mint a fresh issuance (which would REVOKE a
    // student's printed card). `generateIdCard` with default persistState would
    // write; the preview path is what guarantees read-only.
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('never writes or revokes StudentCardState for a class preview', async () => {
    await StudentIdCardService.generateBulkIdCards('class-1', 'ay-1');

    expect(prisma.studentCardState.create).not.toHaveBeenCalled();
    expect(prisma.studentCardState.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('StudentIdCardService.bulkRegenerateActiveCards — a build failure is recorded, not thrown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a generateIdCard build failure in failures instead of aborting the request', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's-ok' }, { id: 's-broken' }]);
    const generateSpy = vi
      .spyOn(StudentIdCardService, 'generateIdCard')
      .mockImplementation(async (studentId: string) => {
        if (studentId === 's-broken') throw new Error('student row broken');
        return aCardDetail() as never;
      });

    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    // The healthy student is still regenerated; the broken one is reported.
    expect(result.totalRegenerated).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.failures).toEqual([
      { studentId: 's-broken', message: expect.stringMatching(/Gagal membuat data kartu/i) },
    ]);
    // Only the healthy student's audit row is committed.
    expect(prisma.studentCardState.create).toHaveBeenCalledTimes(1);
    generateSpy.mockRestore();
  });

  it('continues to the next student when one build fails within a batch', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    const generateSpy = vi
      .spyOn(StudentIdCardService, 'generateIdCard')
      .mockImplementation(async (studentId: string) => {
        if (studentId === 's2') throw new Error('boom');
        return aCardDetail() as never;
      });

    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    expect(result.totalRegenerated).toBe(2);
    expect(result.cards).toHaveLength(2);
    expect(result.failures).toEqual([
      { studentId: 's2', message: expect.stringMatching(/Gagal membuat data kartu/i) },
    ]);
    generateSpy.mockRestore();
  });
});
