import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import { findOrganConflict, yayasanOrganOf } from './role-eligibility';

/**
 * UU 16/2001 Pasal 29 separates the three organs of a yayasan. The seed
 * violated it: ketua@cipansor.or.id held YAYASAN_KETUA (Pengurus) and
 * YAYASAN_PEMBINA at the same time.
 */
describe('yayasan organ exclusivity', () => {
  it('maps each yayasan role to its organ', () => {
    expect(yayasanOrganOf(RoleCode.YAYASAN_PEMBINA)).toBe('PEMBINA');
    expect(yayasanOrganOf(RoleCode.YAYASAN_PENGAWAS)).toBe('PENGAWAS');
    for (const pengurus of [
      RoleCode.YAYASAN_KETUA,
      RoleCode.YAYASAN_SEKRETARIS,
      RoleCode.YAYASAN_BENDAHARA,
      RoleCode.YAYASAN_ANGGOTA,
    ]) {
      expect(yayasanOrganOf(pengurus)).toBe('PENGURUS');
    }
  });

  it('ignores roles outside the yayasan', () => {
    expect(yayasanOrganOf(RoleCode.SDIT_GURU)).toBeUndefined();
    expect(findOrganConflict(RoleCode.SDIT_GURU, [RoleCode.YAYASAN_PEMBINA])).toBeNull();
  });

  // The exact case sitting in production.
  it('refuses Pembina for someone who is already Pengurus', () => {
    const conflict = findOrganConflict(RoleCode.YAYASAN_PEMBINA, [RoleCode.YAYASAN_KETUA]);

    expect(conflict).not.toBeNull();
    expect(conflict?.message).toMatch(/Pembina/);
    expect(conflict?.message).toMatch(/Pengurus/);
    expect(conflict?.message).toMatch(/Pasal 29/);
  });

  it('refuses it in the other direction too', () => {
    expect(findOrganConflict(RoleCode.YAYASAN_KETUA, [RoleCode.YAYASAN_PEMBINA])).not.toBeNull();
  });

  it('refuses Pengawas alongside either of the others', () => {
    expect(findOrganConflict(RoleCode.YAYASAN_PENGAWAS, [RoleCode.YAYASAN_PEMBINA])).not.toBeNull();
    expect(
      findOrganConflict(RoleCode.YAYASAN_PENGAWAS, [RoleCode.YAYASAN_BENDAHARA])
    ).not.toBeNull();
  });

  // Two seats inside one organ are a real arrangement in a small yayasan.
  it('allows two roles within the same organ', () => {
    expect(findOrganConflict(RoleCode.YAYASAN_BENDAHARA, [RoleCode.YAYASAN_KETUA])).toBeNull();
  });

  it('allows a yayasan role alongside a school role', () => {
    expect(
      findOrganConflict(RoleCode.YAYASAN_BENDAHARA, [
        RoleCode.SDIT_BENDAHARA,
        RoleCode.SDIT_ORANG_TUA,
      ])
    ).toBeNull();
  });

  it('allows the first yayasan role a person is given', () => {
    expect(findOrganConflict(RoleCode.YAYASAN_PEMBINA, [])).toBeNull();
  });
});
