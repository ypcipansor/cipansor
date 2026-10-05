import { describe, it, expect } from 'vitest';
import {
  choosesUnit,
  mayManage,
  overseesUnit,
  scopesFor,
  seesDelivery,
} from '../announcements.access';

/** decisions/siaran-pengumuman.md, as a table: the active role → what it may publish. */
const actor = (roleCode: string, unitId: string | null = 'unit-sd') => ({
  sub: 'me',
  roleCode,
  unitId,
});

describe('who may publish what', () => {
  it.each([
    ['YAYASAN_KETUA', ['YAYASAN', 'UNIT']],
    ['YAYASAN_PENGAWAS', ['YAYASAN', 'UNIT']],
    ['PESANTREN_PENGASUH', ['YAYASAN', 'UNIT']],
    ['SDIT_KEPALA_SEKOLAH', ['UNIT']],
    ['SDIT_TATA_USAHA', ['UNIT']],
    ['SDIT_ADMIN', ['UNIT']],
    ['SDIT_GURU', ['CLASSES']],
    ['SMPIT_GURU_BK', ['CLASSES']],
    ['USTADZ', ['CLASSES']],
    ['MUSYRIF', ['BOARDERS']],
  ])('%s → %j', (code, scopes) => {
    expect(scopesFor(actor(code))).toEqual(scopes);
  });

  it.each([
    'SUPER_ADMIN', // runs the system; not an organ
    'SDIT_ORANG_TUA',
    'SDIT_SISWA',
    'SDIT_KOMITE',
    'SMAQ_ALUMNI',
    'PERAWAT',
    'SDIT_BENDAHARA',
  ])('%s publishes nothing', (code) => {
    expect(scopesFor(actor(code))).toEqual([]);
  });

  it('a unit role without a unit on its token publishes nothing', () => {
    expect(scopesFor(actor('SDIT_TATA_USAHA', null))).toEqual([]);
  });

  it('only the yayasan chooses the unit', () => {
    expect(choosesUnit(actor('YAYASAN_SEKRETARIS'))).toBe(true);
    expect(choosesUnit(actor('SDIT_ADMIN'))).toBe(false);
  });
});

describe('who may revise or withdraw', () => {
  const sdAnnouncement = { createdById: 'guru-1', unitId: 'unit-sd' };

  it('the author', () => {
    expect(
      mayManage({ sub: 'guru-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' }, sdAnnouncement)
    ).toBe(true);
  });

  it("the unit's head and admin, not another unit's", () => {
    expect(mayManage(actor('SDIT_KEPALA_SEKOLAH'), sdAnnouncement)).toBe(true);
    expect(mayManage(actor('SDIT_ADMIN'), sdAnnouncement)).toBe(true);
    expect(mayManage(actor('SMPIT_KEPALA_SEKOLAH', 'unit-smp'), sdAnnouncement)).toBe(false);
  });

  it('the yayasan, for any announcement', () => {
    expect(mayManage(actor('YAYASAN_KETUA', null), sdAnnouncement)).toBe(true);
    expect(mayManage(actor('YAYASAN_KETUA', null), { createdById: 'x', unitId: null })).toBe(true);
  });

  it('not Super Admin, not a TU who did not write it, not another guru', () => {
    expect(mayManage(actor('SUPER_ADMIN', null), sdAnnouncement)).toBe(false);
    expect(mayManage(actor('SDIT_TATA_USAHA'), sdAnnouncement)).toBe(false);
    expect(mayManage(actor('SDIT_GURU'), sdAnnouncement)).toBe(false);
  });

  it('a unit admin does not manage the yayasan’s own announcements', () => {
    expect(mayManage(actor('SDIT_ADMIN'), { createdById: 'ketua', unitId: null })).toBe(false);
  });
});

describe('who oversees the board', () => {
  it('the yayasan sees everything; a unit’s head, TU and admin their unit; others nothing extra', () => {
    expect(overseesUnit(actor('YAYASAN_PEMBINA', null))).toBe('ALL');
    expect(overseesUnit(actor('SDIT_TATA_USAHA'))).toBe('unit-sd');
    expect(overseesUnit(actor('SDIT_KEPALA_SEKOLAH'))).toBe('unit-sd');
    expect(overseesUnit(actor('SDIT_GURU'))).toBeNull();
    expect(overseesUnit(actor('SUPER_ADMIN', null))).toBeNull();
  });
});

describe('who sees how far it went (bells reached, read)', () => {
  const byGuru = { createdById: 'guru-1', unitId: 'unit-sd' };

  it('its sender, and whoever oversees its unit', () => {
    expect(seesDelivery({ sub: 'guru-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' }, byGuru)).toBe(
      true
    );
    expect(seesDelivery(actor('SDIT_TATA_USAHA'), byGuru)).toBe(true);
    expect(seesDelivery(actor('SDIT_KEPALA_SEKOLAH'), byGuru)).toBe(true);
    expect(seesDelivery(actor('YAYASAN_KETUA', null), byGuru)).toBe(true);
  });

  it('not another guru, not a wali who received it, not another unit, not Super Admin', () => {
    expect(seesDelivery({ sub: 'guru-2', roleCode: 'SDIT_GURU', unitId: 'unit-sd' }, byGuru)).toBe(
      false
    );
    expect(seesDelivery(actor('SDIT_ORANG_TUA'), byGuru)).toBe(false);
    expect(seesDelivery(actor('SMPIT_TATA_USAHA', 'unit-smp'), byGuru)).toBe(false);
    expect(seesDelivery(actor('SUPER_ADMIN', null), byGuru)).toBe(false);
  });
});
