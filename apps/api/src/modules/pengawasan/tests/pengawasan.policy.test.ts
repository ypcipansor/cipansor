import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  canAccessUnit,
  isFoundationWide,
  assertUnitAccess,
  resolveArrearsUnitId,
} from '../pengawasan.policy';

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

/**
 * Arrears scope resolution (review item 11). It used to live in the controller
 * as a raw inline role list that did not match `PENGAWASAN_ARREARS_ROLES`, the
 * set the route authorizes. The cases below are the ones the review named:
 * governance, treasurer, unit admin, unitless actor, `unitId=all`, and another
 * unit.
 */
describe('pengawasan arrears scope policy', () => {
  it('lets a governance role read the whole foundation by default', () => {
    expect(resolveArrearsUnitId({ roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: null })).toBe(
      undefined
    );
  });

  it('lets a governance role narrow to a named unit', () => {
    expect(
      resolveArrearsUnitId({ roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: null }, 'unit-sdit')
    ).toBe('unit-sdit');
  });

  it('resolves the `all` sentinel to the whole foundation', () => {
    expect(resolveArrearsUnitId({ roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: null }, 'all')).toBe(
      undefined
    );
  });

  it('lets a Super Admin choose any unit', () => {
    expect(
      resolveArrearsUnitId({ roleCode: RoleCode.SUPER_ADMIN, unitId: null }, 'unit-smaq')
    ).toBe('unit-smaq');
  });

  it('confines a unit admin to its own unit and ignores an override', () => {
    // `unitId=other` must not widen a unit-scoped actor's view.
    expect(
      resolveArrearsUnitId({ roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' }, 'unit-smpit')
    ).toBe('unit-sdit');
    expect(resolveArrearsUnitId({ roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' })).toBe(
      'unit-sdit'
    );
    // `all` is likewise not an escape hatch for a unit-scoped role.
    expect(
      resolveArrearsUnitId({ roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' }, 'all')
    ).toBe('unit-sdit');
  });

  it('confines a treasurer to its own unit', () => {
    expect(
      resolveArrearsUnitId({ roleCode: RoleCode.SDIT_BENDAHARA, unitId: 'unit-sdit' }, 'unit-smaq')
    ).toBe('unit-sdit');
  });

  it('refuses a unit-scoped actor with no unit instead of defaulting to every unit', () => {
    // `undefined` means "every unit" downstream, so a unitless unit admin must
    // not be silently promoted to a cross-unit read.
    expect(() =>
      resolveArrearsUnitId({ roleCode: RoleCode.SDIT_ADMIN, unitId: null })
    ).toThrowError(/Unit ID required/);
  });
});
