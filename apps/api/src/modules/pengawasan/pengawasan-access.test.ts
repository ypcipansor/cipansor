import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import { canAccessUnit, isFoundationWide, assertUnitAccess } from './pengawasan-access';

/**
 * The unit policy lives outside the controller now (review item 10), so it can
 * be exercised without an Express request. The two behaviours that matter:
 * foundation-wide roles see every unit, and everyone else sees only their own.
 */
describe('pengawasan unit policy', () => {
  it('treats every governance role as foundation-wide', () => {
    for (const code of [
      RoleCode.SUPER_ADMIN,
      RoleCode.YAYASAN_PEMBINA,
      RoleCode.YAYASAN_KETUA,
      RoleCode.YAYASAN_SEKRETARIS,
      RoleCode.YAYASAN_BENDAHARA,
      RoleCode.YAYASAN_ANGGOTA,
      RoleCode.YAYASAN_PENGAWAS,
    ]) {
      expect(isFoundationWide(code), `${code} should be foundation-wide`).toBe(true);
    }
  });

  it('does not treat a unit role as foundation-wide', () => {
    expect(isFoundationWide(RoleCode.SDIT_ADMIN)).toBe(false);
    expect(isFoundationWide(undefined)).toBe(false);
  });

  it('allows a foundation-wide role into any unit, including none', () => {
    const actor = { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: null };
    expect(canAccessUnit(actor, 'unit-sdit')).toBe(true);
    expect(canAccessUnit(actor, null)).toBe(true);
  });

  it('restricts a unit role to its own unit and refuses a null record unit', () => {
    const actor = { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' };
    expect(canAccessUnit(actor, 'unit-sdit')).toBe(true);
    expect(canAccessUnit(actor, 'unit-smpit')).toBe(false);
    // A record with no unit is not "everyone's"; a unit admin may not claim it.
    expect(canAccessUnit(actor, null)).toBe(false);
  });

  it('throws 403 for an out-of-unit record', () => {
    expect(() =>
      assertUnitAccess({ roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' }, 'unit-smpit')
    ).toThrowError(/Access denied/);

    expect(() =>
      assertUnitAccess({ roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' }, 'unit-sdit')
    ).not.toThrow();
  });
});
