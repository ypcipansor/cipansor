import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A hand-written notification reaches only people in the sender's reach.
 * The `where` itself is proven against Postgres by the e2e
 * `notification-recipient-scope.spec.ts`; these pin the decisions around it.
 */

const prismaMock = vi.hoisted(() => ({ user: { count: vi.fn() } }));
vi.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));

import { assertRecipientsInScope } from '../recipient-scope.service';

const guruSd = { sub: 'guru', roleCode: 'SDIT_GURU', unitId: 'unit-sd' };

describe('assertRecipientsInScope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets a role that sees every unit address anyone, without a lookup', async () => {
    for (const roleCode of ['SUPER_ADMIN', 'YAYASAN_KETUA']) {
      await expect(
        assertRecipientsInScope({ sub: 'x', roleCode, unitId: null }, ['u-1', 'u-2'])
      ).resolves.toBeUndefined();
    }
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('counts the recipients in the sender’s unit, by account or by an active assignment', async () => {
    prismaMock.user.count.mockResolvedValue(2);
    await assertRecipientsInScope(guruSd, ['u-1', 'u-2', 'u-1']);

    const { where } = prismaMock.user.count.mock.calls[0][0];
    expect(where.id).toEqual({ in: ['u-1', 'u-2'] });
    expect(where.OR).toEqual([
      { unitId: 'unit-sd' },
      { userRoles: { some: { unitId: 'unit-sd', isActive: true } } },
    ]);
  });

  it('refuses the whole send when one recipient is outside', async () => {
    prismaMock.user.count.mockResolvedValue(1);
    await expect(assertRecipientsInScope(guruSd, ['inside', 'outside'])).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('refuses a unit-bound role whose token carries no unit', async () => {
    await expect(
      assertRecipientsInScope({ sub: 'x', roleCode: 'SDIT_GURU', unitId: null }, ['u-1'])
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('has nothing to check without recipients', async () => {
    await expect(assertRecipientsInScope(guruSd, [])).resolves.toBeUndefined();
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
