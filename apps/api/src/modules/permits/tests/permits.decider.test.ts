import { describe, it, expect } from 'vitest';
import { PERMIT_HEAD_AFTER_DAYS } from '@cipansor/shared';
import {
  calendarDays,
  headCapacity,
  mayOpenNote,
  routeOf,
  type Guardianship,
} from '../permits.decider';

const wib = (local: string) => new Date(`${local}+07:00`);

const DAY_PUPIL: Guardianship = {
  unitId: 'unit-sd',
  unitType: 'SD_IT',
  boarder: false,
  mentors: [{ id: 'u-wk', name: 'Wali kelas' }],
};

describe('calendarDays — the days a permit touches, in WIB', () => {
  it('Friday 13:00 to Sunday 17:00 is three days', () => {
    expect(calendarDays(wib('2026-09-25T13:00:00'), wib('2026-09-27T17:00:00'))).toBe(3);
  });

  it('an evening outing that ends before midnight WIB is one day, though UTC says two', () => {
    // 06:30 WIB is 23:30 UTC the day before.
    expect(calendarDays(wib('2026-09-26T06:30:00'), wib('2026-09-26T21:00:00'))).toBe(1);
  });
});

describe('routeOf', () => {
  const permit = (from: string, to: string) => ({
    status: 'PENDING',
    startDate: wib(from),
    endDate: wib(to),
  });

  it(`a week (${PERMIT_HEAD_AFTER_DAYS} calendar days) stays with the mentor; one day more goes up`, () => {
    expect(routeOf(permit('2026-09-28T07:00:00', '2026-10-04T17:00:00'), DAY_PUPIL)).toBe('MENTOR');
    expect(routeOf(permit('2026-09-28T07:00:00', '2026-10-05T07:00:00'), DAY_PUPIL)).toBe('LONG');
  });

  it('no mentor on record goes to the head', () => {
    expect(
      routeOf(permit('2026-09-28T07:00:00', '2026-09-28T12:00:00'), { ...DAY_PUPIL, mentors: [] })
    ).toBe('NO_MENTOR');
  });
});

describe('headCapacity', () => {
  it('a kepala sekolah heads their own unit only', () => {
    expect(
      headCapacity({ sub: 'k', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' }, DAY_PUPIL)
    ).toBe('KEPALA_SEKOLAH');
    expect(
      headCapacity({ sub: 'k', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: 'unit-smp' }, DAY_PUPIL)
    ).toBeNull();
  });

  it('the Pimpinan Pesantren heads boarders and Takhosus santri', () => {
    const kiai = { sub: 'kiai', roleCode: 'PESANTREN_PENGASUH', unitId: 'unit-pes' };
    expect(headCapacity(kiai, DAY_PUPIL)).toBeNull();
    expect(headCapacity(kiai, { ...DAY_PUPIL, boarder: true })).toBe('PIMPINAN_PESANTREN');
    expect(headCapacity(kiai, { ...DAY_PUPIL, unitType: 'PESANTREN' })).toBe('PIMPINAN_PESANTREN');
  });

  it('a guru, an admin or a yayasan organ is no head here', () => {
    for (const roleCode of ['SDIT_GURU', 'SDIT_ADMIN', 'SUPER_ADMIN', 'YAYASAN_KETUA']) {
      expect(headCapacity({ sub: 'x', roleCode, unitId: 'unit-sd' }, DAY_PUPIL)).toBeNull();
    }
  });
});

describe('mayOpenNote — who opens a doctor’s note (decided 2026-09-28)', () => {
  const BOARDER: Guardianship = {
    unitId: 'unit-smp',
    unitType: 'SMP_IT',
    boarder: true,
    mentors: [{ id: 'u-musyrif', name: 'Musyrif' }],
  };
  const open = (
    actor: { sub: string; roleCode: string; unitId: string | null },
    approvedBy?: string
  ) => mayOpenNote({ approvedBy: approvedBy ? { id: approvedBy } : null }, BOARDER, actor);

  it('the mentor who decides it, the one who did, the heads over the santri, and the wali', () => {
    expect(open({ sub: 'u-musyrif', roleCode: 'MUSYRIF', unitId: null })).toBe(true);
    expect(open({ sub: 'u-lama', roleCode: 'MUSYRIF', unitId: null }, 'u-lama')).toBe(true);
    expect(open({ sub: 'u-kepala', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: 'unit-smp' })).toBe(
      true
    );
    // A boarder: the Pimpinan Pesantren is a head over them too.
    expect(open({ sub: 'u-kiai', roleCode: 'PESANTREN_PENGASUH', unitId: 'unit-pes' })).toBe(true);
    // Scope already limited the wali to their own child's permit.
    expect(open({ sub: 'u-wali', roleCode: 'SMPIT_ORANG_TUA', unitId: 'unit-smp' })).toBe(true);
  });

  it('nobody else: another musyrif, the TU, the nurse, another unit’s head, the Super Admin', () => {
    expect(open({ sub: 'u-other', roleCode: 'MUSYRIF', unitId: null })).toBe(false);
    expect(open({ sub: 'u-tu', roleCode: 'SMPIT_TATA_USAHA', unitId: 'unit-smp' })).toBe(false);
    expect(open({ sub: 'u-nurse', roleCode: 'PERAWAT', unitId: null })).toBe(false);
    expect(open({ sub: 'u-kepala-sd', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' })).toBe(
      false
    );
    expect(open({ sub: 'u-super', roleCode: 'SUPER_ADMIN', unitId: null })).toBe(false);
  });
});
