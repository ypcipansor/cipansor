import { describe, it, expect } from 'vitest';
import { PERMIT_HEAD_AFTER_DAYS } from '@cipansor/shared';
import {
  calendarDays,
  decisionFor,
  goesHome,
  headCapacity,
  mayOpenNote,
  routeOf,
  whoDecides,
  type Guardianship,
} from '../permits.decider';

const wib = (local: string) => new Date(`${local}+07:00`);

const DAY_PUPIL: Guardianship = {
  unitId: 'unit-sd',
  unitType: 'SD_IT',
  boarder: false,
  mentors: [{ id: 'u-wk', name: 'Wali kelas' }],
  coordinators: [],
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
    type: 'KELUARGA',
    offCampus: true,
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
    coordinators: [{ id: 'u-koord', name: 'Koordinator' }],
  };
  // Sick in the UKS for the afternoon: the kamar's musyrif decides it.
  const inUks = {
    type: 'SAKIT',
    offCampus: false,
    startDate: wib('2026-09-28T12:00:00'),
    endDate: wib('2026-09-28T17:00:00'),
  };
  const open = (
    actor: { sub: string; roleCode: string; unitId: string | null },
    approvedBy?: string
  ) =>
    mayOpenNote({ ...inUks, approvedBy: approvedBy ? { id: approvedBy } : null }, BOARDER, actor);

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

describe('a santri mukim going home or out overnight — the koordinator asrama (decided 2026-09-27)', () => {
  // The koordinator covers every kamar of the asrama, so they are among the
  // kamar's musyrif too; the wali kamar covers this kamar only.
  const BOARDER: Guardianship = {
    unitId: 'unit-smp',
    unitType: 'SMP_IT',
    boarder: true,
    mentors: [
      { id: 'u-kamar', name: 'Wali kamar' },
      { id: 'u-koord', name: 'Koordinator' },
    ],
    coordinators: [{ id: 'u-koord', name: 'Koordinator' }],
  };
  const leave = (type: string, from: string, to: string, offCampus = true) => ({
    status: 'PENDING',
    type,
    offCampus,
    startDate: wib(from),
    endDate: wib(to),
  });
  const WALI_KAMAR = { sub: 'u-kamar', roleCode: 'MUSYRIF', unitId: null };
  const KOORDINATOR = { sub: 'u-koord', roleCode: 'MUSYRIF', unitId: null };
  const KIAI = { sub: 'u-kiai', roleCode: 'PESANTREN_PENGASUH', unitId: 'unit-pes' };

  const pulang = leave('PULANG', '2026-10-02T13:00:00', '2026-10-04T17:00:00');
  const afternoonOut = leave('KELUAR', '2026-10-02T13:00:00', '2026-10-02T17:00:00');

  it('izin pulang is the koordinator’s, not the wali kamar’s — even for a day', () => {
    const sameDay = leave('PULANG', '2026-10-02T07:00:00', '2026-10-02T17:00:00');
    for (const p of [pulang, sameDay]) {
      expect(goesHome(p, BOARDER)).toBe(true);
      expect(decisionFor(p, BOARDER, WALI_KAMAR).canDecide).toBe(false);
      const d = decisionFor(p, BOARDER, KOORDINATOR);
      expect(d).toMatchObject({
        route: 'MENTOR',
        mentorKind: 'KOORDINATOR',
        mentors: [{ id: 'u-koord' }],
        canDecide: true,
        asTakeover: false,
        capacity: 'KOORDINATOR_ASRAMA',
      });
    }
    expect(whoDecides(decisionFor(pulang, BOARDER, WALI_KAMAR))).toBe(
      'Izin ini diputuskan oleh koordinator asrama santri (Koordinator)'
    );
  });

  it('a few hours out stays with the kamar’s musyrif; out past midnight WIB is bermalam', () => {
    const d = decisionFor(afternoonOut, BOARDER, WALI_KAMAR);
    expect(d).toMatchObject({ mentorKind: 'MUSYRIF', canDecide: true, capacity: 'MUSYRIF' });

    const overnight = leave('KELUAR', '2026-10-02T20:00:00', '2026-10-03T06:00:00');
    expect(goesHome(overnight, BOARDER)).toBe(true);
    expect(decisionFor(overnight, BOARDER, WALI_KAMAR).canDecide).toBe(false);
  });

  it('sick: in the UKS stays with the kamar; at home overnight goes to the koordinator', () => {
    const uks = leave('SAKIT', '2026-10-02T07:00:00', '2026-10-04T17:00:00', false);
    expect(goesHome(uks, BOARDER)).toBe(false);
    expect(decisionFor(uks, BOARDER, WALI_KAMAR).capacity).toBe('MUSYRIF');

    const home = leave('SAKIT', '2026-10-02T07:00:00', '2026-10-04T17:00:00', true);
    expect(decisionFor(home, BOARDER, WALI_KAMAR).canDecide).toBe(false);
    expect(decisionFor(home, BOARDER, KOORDINATOR).capacity).toBe('KOORDINATOR_ASRAMA');

    // To the clinic and back the same day: not a night away.
    const clinic = leave('SAKIT', '2026-10-02T08:00:00', '2026-10-02T11:00:00', true);
    expect(goesHome(clinic, BOARDER)).toBe(false);
  });

  it('a day pupil going home is still their wali kelas’s', () => {
    expect(goesHome(pulang, DAY_PUPIL)).toBe(false);
    expect(
      decisionFor(pulang, DAY_PUPIL, { sub: 'u-wk', roleCode: 'SDIT_GURU', unitId: 'unit-sd' })
    ).toMatchObject({ mentorKind: 'WALI_KELAS', canDecide: true, capacity: 'WALI_KELAS' });
  });

  it('an asrama with no koordinator on record sends it to the heads, and says so', () => {
    const none = { ...BOARDER, coordinators: [] };
    const d = decisionFor(pulang, none, WALI_KAMAR);
    expect(d).toMatchObject({ route: 'NO_MENTOR', mentorKind: 'KOORDINATOR', canDecide: false });
    expect(whoDecides(d)).toMatch(/belum punya koordinator tercatat.*Pimpinan Pesantren/);
    expect(decisionFor(pulang, none, KIAI)).toMatchObject({
      canDecide: true,
      asTakeover: false,
      capacity: 'PIMPINAN_PESANTREN',
    });
  });

  it(`going home for more than ${PERMIT_HEAD_AFTER_DAYS} days is still the head’s`, () => {
    const long = leave('PULANG', '2026-10-02T07:00:00', '2026-10-12T17:00:00');
    expect(routeOf(long, BOARDER)).toBe('LONG');
    expect(decisionFor(long, BOARDER, KOORDINATOR).canDecide).toBe(false);
    expect(decisionFor(long, BOARDER, KIAI).capacity).toBe('PIMPINAN_PESANTREN');
  });

  it('the doctor’s note of izin pulang opens for the koordinator, not the wali kamar', () => {
    const note = { ...pulang, approvedBy: null };
    expect(mayOpenNote(note, BOARDER, KOORDINATOR)).toBe(true);
    expect(mayOpenNote(note, BOARDER, WALI_KAMAR)).toBe(false);
  });
});
