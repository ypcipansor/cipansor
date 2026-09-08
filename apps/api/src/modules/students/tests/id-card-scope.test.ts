import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentIdCardService } from '../id-card.service';
import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '../../../lib/jwt';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    class: {
      findUnique: vi.fn(),
    },
    classEnrollment: {
      findMany: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    unit: {
      findUnique: vi.fn(),
    },
    parent: {
      findUnique: vi.fn(),
    },
    guardianType: {
      findMany: vi.fn(),
    },
    studentParent: {
      findMany: vi.fn(),
    },
  },
}));

const aUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  id: 'user-1',
  sub: 'user-1',
  email: 'user1@cipansor.or.id',
  roleId: 'role-1',
  roleCode: 'UNIT_ADMIN',
  permissions: [],
  type: 'access',
  role: 'UNIT_ADMIN',
  unitId: 'unit-smp-1',
  ...overrides,
});

describe('StudentIdCardService.bulkRegenerateActiveCards — unit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StudentIdCardService, 'generateIdCard').mockResolvedValue({
      id: 'card-1',
      qrData: 'cipansor://abc#0123456789abcdef',
    } as never);
  });

  it('rejects a unit-scoped user with no unitId of their own', async () => {
    await expect(
      StudentIdCardService.bulkRegenerateActiveCards(
        'unit-smp-1',
        undefined,
        aUser({ unitId: null })
      )
    ).rejects.toThrow(/wajib memiliki unit/);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('rejects a unit-scoped user who omits unitId', async () => {
    await expect(
      StudentIdCardService.bulkRegenerateActiveCards(undefined, undefined, aUser())
    ).rejects.toThrow(/wajib menyebutkan unitId/);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('rejects a unit-scoped user targeting another unit', async () => {
    await expect(
      StudentIdCardService.bulkRegenerateActiveCards('unit-other', undefined, aUser())
    ).rejects.toThrow(/tidak memiliki akses.*unit lain/i);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('rejects a class that does not belong to the user unit', async () => {
    (prisma.class.findUnique as any).mockResolvedValue({ unitId: 'unit-other' });
    await expect(
      StudentIdCardService.bulkRegenerateActiveCards('unit-smp-1', 'class-9a', aUser())
    ).rejects.toThrow(/kelas di unit lain/i);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('scopes a unit admin to their own unit when a valid unitId is passed', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      'unit-smp-1',
      undefined,
      aUser()
    );

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unitId: 'unit-smp-1' }),
      })
    );
    expect(result.totalRegenerated).toBe(1);
  });

  it('lets a SUPER_ADMIN regenerate across all units when unitId is omitted', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    const result = await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      aUser({ roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null })
    );

    const calledWith = (prisma.student.findMany as any).mock.calls[0][0];
    expect(calledWith.where).not.toHaveProperty('unitId');
    expect(result.totalRegenerated).toBe(2);
  });

  it('limits regeneration to active students (status === active)', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    await StudentIdCardService.bulkRegenerateActiveCards('unit-smp-1', undefined, aUser());

    const calledWith = (prisma.student.findMany as any).mock.calls[0][0];
    expect(calledWith.where).toMatchObject({ status: 'active' });
  });

  it('keeps the active filter even for SUPER_ADMIN unit-less regeneration', async () => {
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    await StudentIdCardService.bulkRegenerateActiveCards(
      undefined,
      undefined,
      aUser({ roleCode: 'SUPER_ADMIN', role: 'SUPER_ADMIN', unitId: null })
    );

    const calledWith = (prisma.student.findMany as any).mock.calls[0][0];
    expect(calledWith.where).toMatchObject({ status: 'active' });
  });

  it('scopes by class when classId belongs to the user unit', async () => {
    (prisma.class.findUnique as any).mockResolvedValue({ unitId: 'unit-smp-1' });
    (prisma.student.findMany as any).mockResolvedValue([{ id: 's1' }]);
    await StudentIdCardService.bulkRegenerateActiveCards('unit-smp-1', 'class-9a', aUser());

    const calledWith = (prisma.student.findMany as any).mock.calls[0][0];
    expect(calledWith.where).toMatchObject({
      unitId: 'unit-smp-1',
      enrollments: { some: { classId: 'class-9a', status: 'active' } },
    });
  });
});
