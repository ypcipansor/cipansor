/**
 * Who may act on another person's account (delete it, mark its password
 * leaked, send it a reset link, change its email or switch it off): Super
 * Admin on anyone; a unit admin inside the unit, never on an account that
 * must use 2FA.
 */
import { describe, it, expect, vi } from 'vitest';
import { RoleCode } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn() } }));

import { assertMayManageAccount } from './account-scope';

const SUPER = { roleCode: RoleCode.SUPER_ADMIN, unitId: null, sub: 'super' };
const SDIT_ADMIN = { roleCode: RoleCode.SDIT_ADMIN, unitId: 'sdit', sub: 'admin' };

const status = (fn: () => void) => {
  try {
    fn();
    return 'allowed';
  } catch (error) {
    return (error as { statusCode?: number }).statusCode;
  }
};

describe('assertMayManageAccount', () => {
  it('lets a unit admin act on a teacher of the unit', () => {
    expect(
      status(() =>
        assertMayManageAccount({ unitId: 'sdit', roleCodes: [RoleCode.SDIT_GURU] }, SDIT_ADMIN)
      )
    ).toBe('allowed');
  });

  it('keeps a unit admin out of another unit', () => {
    expect(
      status(() =>
        assertMayManageAccount({ unitId: 'smpit', roleCodes: [RoleCode.SMPIT_GURU] }, SDIT_ADMIN)
      )
    ).toBe(403);
  });

  it.each([
    RoleCode.SUPER_ADMIN,
    RoleCode.SDIT_ADMIN,
    RoleCode.SDIT_KEPALA_SEKOLAH,
    RoleCode.YAYASAN_KETUA,
  ])('keeps a unit admin off %s, who must use 2FA', (code) => {
    expect(
      status(() => assertMayManageAccount({ unitId: 'sdit', roleCodes: [code] }, SDIT_ADMIN))
    ).toBe(403);
  });

  it('counts a second assignment, not only the first', () => {
    expect(
      status(() =>
        assertMayManageAccount(
          { unitId: 'sdit', roleCodes: [RoleCode.SDIT_GURU, RoleCode.SDIT_KEPALA_SEKOLAH] },
          SDIT_ADMIN
        )
      )
    ).toBe(403);
  });

  it('gives an admin without a unit no reach over accounts without one', () => {
    const unitless = { ...SDIT_ADMIN, unitId: null };
    expect(status(() => assertMayManageAccount({ unitId: null, roleCodes: [] }, unitless))).toBe(
      403
    );
  });

  it('lets Super Admin act on anyone', () => {
    expect(
      status(() =>
        assertMayManageAccount(
          { unitId: 'smpit', roleCodes: [RoleCode.SMPIT_KEPALA_SEKOLAH] },
          SUPER
        )
      )
    ).toBe('allowed');
  });
});
