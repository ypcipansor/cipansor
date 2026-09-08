import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentIdCardService } from '../id-card.service';
import { prisma } from '@/lib/prisma';
import { StudentCardStatus } from '@prisma/client';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
    },
    studentCardState: {
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

const aCardDetail = (cardNumber: string, validUntil: string) => ({
  cardData: {
    validity: {
      issuedDate: new Date().toISOString(),
      validUntil,
      cardNumber,
    },
    qrCode: {
      data: 'cipansor://abc#0123456789abcdef',
      verificationUrl: 'https://cipansor.or.id/public/verify-card?data=x',
    },
  },
});

describe('StudentIdCardService.bulkRegenerateActiveCards — state persistence (Flag 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StudentIdCardService, 'generateIdCard').mockResolvedValue(
      aCardDetail('CARD-1', '2027-06-30T00:00:00.000Z') as never
    );
  });

  it('writes an ACTIVE StudentCardState row per regenerated student, atomically', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    expect(result.totalRegenerated).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // 2 students → 2 revoke ops + 2 create ops.
    expect((prisma.$transaction as any).mock.calls[0][0]).toHaveLength(4);

    expect(prisma.studentCardState.create).toHaveBeenCalledTimes(2);
    expect(prisma.studentCardState.updateMany).toHaveBeenCalledTimes(2);
  });

  it('records the issuer, card number, status ACTIVE and a parsed validUntil', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    const validUntil = '2027-06-30T00:00:00.000Z';
    vi.spyOn(StudentIdCardService, 'generateIdCard').mockResolvedValue(
      aCardDetail('CARD-S1', validUntil) as never
    );

    await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    expect(prisma.studentCardState.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        cardNumber: 'CARD-S1',
        status: StudentCardStatus.ACTIVE,
        issuedAt: expect.any(Date),
        regeneratedAt: expect.any(Date),
        validUntil: new Date(validUntil),
        generatedById: 'who-123',
      },
    });
  });

  it('revokes any previous ACTIVE card when regenerating', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

    await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      superAdmin()
    );

    for (const studentId of ['s1', 's2']) {
      expect(prisma.studentCardState.updateMany).toHaveBeenCalledWith({
        where: { studentId, status: StudentCardStatus.ACTIVE },
        data: {
          status: StudentCardStatus.REVOKED,
          revokedAt: expect.any(Date),
          revokeReason: 'superseded_by_regeneration',
        },
      });
    }
  });
});
