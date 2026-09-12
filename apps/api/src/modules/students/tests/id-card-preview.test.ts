import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StudentIdCardService } from '../id-card.service';
import { prisma } from '@/lib/prisma';
import { StudentCardStatus, Prisma } from '@prisma/client';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
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

describe('StudentIdCardService.getOrGeneratePreviewIdCard — read-only preview', () => {
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    generateSpy = vi
      .spyOn(StudentIdCardService, 'generateIdCard')
      .mockResolvedValue(aCardDetail() as never);
  });

  afterEach(() => {
    generateSpy.mockRestore();
  });

  it('renders a not-issued preview and NEVER writes state when no ACTIVE row exists', async () => {
    (prisma.studentCardState.findFirst as any).mockResolvedValue(null);

    await StudentIdCardService.getOrGeneratePreviewIdCard('s1');

    // Flag 2: no card is issued yet, so the preview is marked not-issued and
    // ships NO QR (a transient `cid` would fail verification).
    expect(generateSpy).toHaveBeenCalledWith('s1', {}, { persistState: false, issued: false });
    expect(prisma.studentCardState.create).not.toHaveBeenCalled();
    expect(prisma.studentCardState.updateMany).not.toHaveBeenCalled();
  });

  it('reuses the existing ACTIVE row id/validity so repeated previews are idempotent', async () => {
    const issuedAt = new Date('2026-07-01T00:00:00.000Z');
    const validUntil = new Date('2027-07-01T00:00:00.000Z');
    (prisma.studentCardState.findFirst as any).mockResolvedValue({
      id: 'existing-state-id',
      status: StudentCardStatus.ACTIVE,
      cardNumber: 'CARD-EXISTING',
      issuedAt,
      validUntil,
    });

    const result = await StudentIdCardService.getOrGeneratePreviewIdCard('s1');

    expect(result).toBeTruthy();
    expect(generateSpy).toHaveBeenCalledWith(
      's1',
      {},
      {
        cardStateId: 'existing-state-id',
        persistState: false,
        issued: true,
        validUntil,
        cardNumber: 'CARD-EXISTING',
        issuedAt,
      }
    );
    // No audit write: the printed card is NOT revoked by a preview.
    expect(prisma.studentCardState.create).not.toHaveBeenCalled();
    expect(prisma.studentCardState.updateMany).not.toHaveBeenCalled();
  });

  it('renders a transient card (no issuedAt/validUntil overrides) when the ACTIVE row has no dates', async () => {
    (prisma.studentCardState.findFirst as any).mockResolvedValue({
      id: 'existing-state-id',
      status: StudentCardStatus.ACTIVE,
      cardNumber: 'CARD-EXISTING',
      issuedAt: null,
      validUntil: null,
    });

    await StudentIdCardService.getOrGeneratePreviewIdCard('s1');

    expect(generateSpy).toHaveBeenCalledWith(
      's1',
      {},
      {
        cardStateId: 'existing-state-id',
        persistState: false,
        issued: true,
        cardNumber: 'CARD-EXISTING',
      }
    );
  });
});

describe('StudentIdCardService.bulkRegenerateActiveCards — conflict handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StudentIdCardService, 'generateIdCard').mockResolvedValue(aCardDetail() as never);
  });

  it('reports a concurrent ACTIVE-card unique violation as a partial failure, not a throw', async () => {
    // Flag 5: a later batch failing must not swallow the cards already
    // regenerated. A P2002 on a batch returns the conflict in `failures` and the
    // successful cards in `cards` instead of throwing and hiding the earlier work.
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    (prisma.$transaction as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'vitest',
        meta: {},
      })
    );

    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    expect(result.totalRegenerated).toBe(0);
    expect(result.cards).toHaveLength(0);
    expect(result.failures).toEqual([
      { studentId: 's1', message: expect.stringMatching(/Hanya satu kartu aktif/i) },
    ]);
  });

  it('keeps previously regenerated cards when a later batch fails', async () => {
    // BATCH_SIZE is 50: students s-0..s-49 make up the first (committed) batch,
    // s-50 the second (failed) one. The partial result must report the 50 already
    // regenerated AND the one that failed — a mid-run failure must never hide it.
    const students = Array.from({ length: 51 }, (_, i) => ({ id: `s-${i}` }));
    (prisma.student.findMany as any).mockResolvedValue(students);
    (prisma.$transaction as any)
      .mockResolvedValueOnce(undefined) // first batch (50) commits
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'vitest',
          meta: {},
        })
      );

    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    expect(result.totalRegenerated).toBe(50);
    expect(result.cards).toHaveLength(50);
    // The student from the failed second batch is reported, not lost.
    expect(result.failures).toEqual([
      { studentId: 's-50', message: expect.stringMatching(/Hanya satu kartu aktif/i) },
    ]);
  });
});
