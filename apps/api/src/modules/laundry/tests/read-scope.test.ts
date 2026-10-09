import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  laundryTransaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { laundryReadScope, transactionService } from '../laundry.service';

const SMP_IT = 'unit-smp-it';
const PESANTREN = 'unit-pesantren';

describe('laundryReadScope', () => {
  it("gives the pesantren's staff every unit's laundry, whichever unit they belong to", () => {
    for (const roleCode of ['MUSYRIF', 'USTADZ', 'MUHAFIDZ', 'PESANTREN_PENGASUH']) {
      expect(laundryReadScope({ sub: 'u', roleCode, unitId: PESANTREN })).toEqual({});
    }
  });

  it('keeps the staff who run it, and every other staff member, to their own unit', () => {
    expect(laundryReadScope({ sub: 'u', roleCode: 'BUSINESS_STAFF', unitId: SMP_IT })).toEqual({
      unitId: SMP_IT,
    });
    expect(laundryReadScope({ sub: 'u', roleCode: 'SMPIT_GURU', unitId: SMP_IT })).toEqual({
      unitId: SMP_IT,
    });
  });

  it('shows a santri only their own laundry and a wali only their children’s', () => {
    expect(laundryReadScope({ sub: 'santri-1', roleCode: 'SMPIT_SISWA', unitId: SMP_IT })).toEqual({
      student: { userId: 'santri-1' },
    });
    expect(
      laundryReadScope({ sub: 'wali-1', roleCode: 'SMPIT_ORANG_TUA', unitId: SMP_IT })
    ).toEqual({ student: { parents: { some: { parentId: 'wali-1' } } } });
  });

  it('shows komite and alumni none, and an account with no unit none', () => {
    expect(laundryReadScope({ sub: 'k', roleCode: 'SMPIT_KOMITE', unitId: SMP_IT })).toEqual({
      student: { id: { in: [] } },
    });
    expect(laundryReadScope({ sub: 'x', roleCode: 'SMPIT_GURU', unitId: null })).toEqual({
      id: { in: [] },
    });
  });
});

describe('transactionService reads apply the scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.laundryTransaction.findMany.mockResolvedValue([]);
    prismaMock.laundryTransaction.count.mockResolvedValue(0);
    prismaMock.laundryTransaction.findFirst.mockResolvedValue(null);
  });

  it('lists every unit for a cross-unit reader, and narrows by the query within it', async () => {
    await transactionService.getAll({}, { studentId: 's1' } as never);
    const where = prismaMock.laundryTransaction.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('unitId');
    expect(where.studentId).toBe('s1');
  });

  it('a wali reading by id or by santri never escapes their children', async () => {
    const scope = laundryReadScope({ sub: 'wali-1', roleCode: 'SMPIT_ORANG_TUA', unitId: SMP_IT });
    await transactionService.getById('t1', scope);
    expect(prismaMock.laundryTransaction.findFirst.mock.calls[0][0].where).toEqual({
      student: { parents: { some: { parentId: 'wali-1' } } },
      id: 't1',
    });
    await transactionService.getByStudent('other-child', scope);
    expect(prismaMock.laundryTransaction.findMany.mock.calls[0][0].where).toMatchObject({
      student: { parents: { some: { parentId: 'wali-1' } } },
      studentId: 'other-child',
    });
  });
});
