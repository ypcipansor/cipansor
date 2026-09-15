import { describe, it, expect } from 'vitest';
import { getSemesterDateRange } from '../raport-merdeka.service';

/**
 * Regression tests for the Semester 1 boundary.
 *
 * `new Date(year, 11, 31)` is Dec 31 at 00:00:00.000, so an exam scheduled on
 * Dec 31 afternoon (`scheduledAt` after midnight) fell outside the
 * `grade.exam.scheduledAt <= semEndDate` window and was silently dropped from
 * the Semester 1 raport. The boundary is now the last millisecond of Dec 31;
 * Semester 2 still starts at the first millisecond of Jan 1, so the windows
 * never overlap.
 */

const academicYear = {
  startDate: new Date(2024, 6, 1), // 1 Jul 2024
  endDate: new Date(2025, 5, 30), // 30 Jun 2025
};

describe('getSemesterDateRange — Semester 1 (Ganjil)', () => {
  const sem1 = getSemesterDateRange(academicYear, 1);

  it('ends on Dec 31 at the LAST millisecond of the day (WIB)', () => {
    // The boundary is anchored to WIB (UTC+7): "end of Dec 31" means Dec 31
    // 23:59:59.999 WIB, which is Dec 31 16:59:59.999 UTC on a UTC host. The
    // date (year/month/day) is what must not drift; the clock time shifts with
    // the anchoring.
    expect(sem1.endDate.getUTCFullYear()).toBe(2024);
    expect(sem1.endDate.getUTCMonth()).toBe(11); // December
    expect(sem1.endDate.getUTCDate()).toBe(31);
    expect(sem1.endDate.getUTCHours()).toBe(16); // 23:59:59.999 WIB
    expect(sem1.endDate.getUTCMinutes()).toBe(59);
    expect(sem1.endDate.getUTCSeconds()).toBe(59);
    expect(sem1.endDate.getUTCMilliseconds()).toBe(999);
  });

  it('includes an exam scheduled on Dec 31 afternoon', () => {
    const dec31afternoon = new Date(2024, 11, 31, 15, 0, 0);
    expect(dec31afternoon >= sem1.startDate).toBe(true);
    expect(dec31afternoon <= sem1.endDate).toBe(true);
  });

  it('excludes Jan 1 midnight (which belongs to Semester 2)', () => {
    const jan1midnight = new Date(2025, 0, 1, 0, 0, 0, 0);
    expect(jan1midnight <= sem1.endDate).toBe(false);
  });
});

describe('getSemesterDateRange — Semester 2 (Genap)', () => {
  const sem2 = getSemesterDateRange(academicYear, 2);

  it('starts on Jan 1 at midnight (WIB)', () => {
    // "Semester 2 starts Jan 1 00:00 WIB" == "Dec 31 17:00 UTC". In WIB terms
    // that is still 01 Jan 00:00, so assert the calendar date in WIB.
    const wibDate = new Date(sem2.startDate.getTime() + 7 * 60 * 60 * 1000);
    expect(wibDate.getUTCFullYear()).toBe(2025);
    expect(wibDate.getUTCMonth()).toBe(0); // January
    expect(wibDate.getUTCDate()).toBe(1);
    expect(wibDate.getUTCHours()).toBe(0);
    expect(wibDate.getUTCMinutes()).toBe(0);
    expect(wibDate.getUTCSeconds()).toBe(0);
  });

  it('includes a grade on Jan 1 midnight (not dropped into Semester 1)', () => {
    const jan1midnight = new Date(2025, 0, 1, 0, 0, 0, 0);
    expect(jan1midnight >= sem2.startDate).toBe(true);
    expect(jan1midnight <= sem2.endDate).toBe(true);
  });

  it('does not overlap Semester 1 end', () => {
    expect(sem2.startDate.getTime()).toBeGreaterThan(
      getSemesterDateRange(academicYear, 1).endDate.getTime()
    );
  });
});

describe('getSemesterDateRange — WIB (UTC+7) operational boundary', () => {
  // The school operates in WIB, so "Semester 2 starts Jan 1" means "01 Jan
  // 00:00 WIB". An exam at, say, 05:00 WIB on Jan 1 is stored in UTC as the
  // *previous* Dec 31 22:00. Anchored at UTC midnight this would fall inside
  // Semester 1 — the bug. The boundary must be anchored to WIB.
  const sem1 = getSemesterDateRange(academicYear, 1);
  const sem2 = getSemesterDateRange(academicYear, 2);

  it('places a Jan 1 00:00 UTC exam in Semester 2, not Semester 1', () => {
    // Jan 1 00:00 UTC == Jan 1 07:00 WIB → clearly Semester 2.
    const jan1UtcMidnight = new Date('2025-01-01T00:00:00.000Z');
    expect(jan1UtcMidnight <= sem1.endDate).toBe(false);
    expect(jan1UtcMidnight >= sem2.startDate).toBe(true);
  });

  it('places a Jan 1 early-morning (before 07:00 WIB) exam in Semester 2', () => {
    // 05:00 WIB on Jan 1 is stored as Dec 31 22:00 UTC, i.e. the calendar
    // "last evening" of the old year but operationally already the new year.
    const jan1EarlyWib = new Date('2024-12-31T22:00:00.000Z');
    expect(jan1EarlyWib <= sem1.endDate).toBe(false);
    expect(jan1EarlyWib >= sem2.startDate).toBe(true);
  });

  it('keeps a Dec 31 afternoon WIB exam in Semester 1', () => {
    // Dec 31 22:00 WIB is stored as Dec 31 15:00 UTC. This must remain in
    // Semester 1 (operationally still the last day of Semester 1).
    const dec31AfternoonWib = new Date('2024-12-31T15:00:00.000Z');
    expect(dec31AfternoonWib <= sem1.endDate).toBe(true);
    expect(dec31AfternoonWib >= sem2.startDate).toBe(false);
  });
});

describe('getSemesterDateRange — invalid semester is rejected', () => {
  it('rejects semester values other than 1 or 2 (e.g. the unified-raport query 99)', () => {
    // Regression: the unified-raport controller parses `semester` straight from
    // the query string and forwarded it here; a value like 99 used to fall
    // through the `semester === 1 ? … : …` ternary and silently return a
    // Semester 2 (Genap) raport. Every entry point must reject it.
    expect(() => getSemesterDateRange(academicYear, 99)).toThrow(/Semester harus bernilai 1/);
    expect(() => getSemesterDateRange(academicYear, 0)).toThrow(/Semester harus bernilai 1/);
  });
});

describe('P5 semester attribution — project startDate falls inside one semester window', () => {
  const sem1 = getSemesterDateRange(academicYear, 1);
  const sem2 = getSemesterDateRange(academicYear, 2);

  // P5Project has no `semester` column, so the raport attributes a project to
  // the semester in which its startDate falls. This pins that rule so the two
  // semesters cannot be mixed into one raport.
  it('attributes a Sept project to Semester 1 and a Jan project to Semester 2', () => {
    const sept = new Date(2024, 8, 10); // 10 Sep 2024
    const jan = new Date(2025, 0, 15); // 15 Jan 2025

    expect(sept >= sem1.startDate && sept <= sem1.endDate).toBe(true);
    expect(sept >= sem2.startDate && sept <= sem2.endDate).toBe(false);

    expect(jan >= sem2.startDate && jan <= sem2.endDate).toBe(true);
    expect(jan >= sem1.startDate && jan <= sem1.endDate).toBe(false);
  });
});
