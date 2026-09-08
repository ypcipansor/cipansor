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

  it('renders a transient card and NEVER writes state when no ACTIVE row exists', async () => {
    (prisma.studentCardState.findFirst as any).mockResolvedValue(null);

    await StudentIdCardService.getOrGeneratePreviewIdCard('s1');

    expect(generateSpy).toHaveBeenCalledWith('s1', {}, { persistState: false });
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
      { cardStateId: 'existing-state-id', persistState: false, cardNumber: 'CARD-EXISTING' }
    );
  });
});

describe('StudentIdCardService.bulkRegenerateActiveCards — conflict handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StudentIdCardService, 'generateIdCard').mockResolvedValue(aCardDetail() as never);
  });

  it('translates a concurrent ACTIVE-card unique violation into a 409 conflict', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    (prisma.$transaction as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'vitest',
        meta: {},
      })
    );

    await expect(
      StudentIdCardService.bulkRegenerateActiveCards(undefined, undefined, superAdmin())
    ).rejects.toThrow(/Hanya satu kartu aktif/i);
  });
});
