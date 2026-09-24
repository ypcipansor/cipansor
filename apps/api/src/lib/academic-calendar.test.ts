import { describe, it, expect } from 'vitest';
import {
  academicYearStarting,
  admissionWindows,
  currentAcademicYear,
  nextAcademicYear,
} from './academic-calendar';

/** The date the stale-data bug was found in production. */
const JUL_24_2026 = new Date('2026-07-24T00:00:00.000Z');

describe('currentAcademicYear', () => {
  it('uses 15 July as the boundary', () => {
    expect(currentAcademicYear(new Date('2026-07-14T23:59:59.999Z')).name).toBe('2025/2026');
    expect(currentAcademicYear(new Date('2026-07-15T00:00:00.000Z')).name).toBe('2026/2027');
  });

  it('keeps January in the year that began the previous July', () => {
    expect(currentAcademicYear(new Date('2027-01-10T00:00:00.000Z')).name).toBe('2026/2027');
  });

  it('spans mid-July to end of June', () => {
    const year = currentAcademicYear(JUL_24_2026);
    expect(year.name).toBe('2026/2027');
    expect(year.startDate.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(year.endDate.toISOString()).toBe('2027-06-30T00:00:00.000Z');
  });

  it('does not depend on the host timezone', () => {
    // Same instant, whatever the container's TZ — the helper builds UTC dates.
    const year = academicYearStarting(2026);
    expect(year.startDate.getUTCMonth()).toBe(6);
    expect(year.startDate.getUTCDate()).toBe(15);
  });
});

describe('nextAcademicYear', () => {
  it('is the intake the current registration recruits for', () => {
    expect(nextAcademicYear(JUL_24_2026).name).toBe('2027/2028');
    expect(nextAcademicYear(JUL_24_2026).startYear).toBe(
      currentAcademicYear(JUL_24_2026).startYear + 1
    );
  });
});

describe('admissionWindows', () => {
  // The regression this whole helper exists to prevent: the seeded intake must
  // be open on the day the seed runs, not on the day the seed was written.
  it('leaves wave 1 open right now, whenever "now" is', () => {
    for (const iso of [
      '2026-07-24T00:00:00.000Z',
      '2027-01-01T12:00:00.000Z',
      '2031-03-15T23:30:00.000Z',
      '2026-12-31T23:59:59.000Z',
    ]) {
      const now = new Date(iso);
      const [wave1] = admissionWindows(now);
      expect(
        wave1.startDate.getTime(),
        `wave 1 should have opened before ${iso}`
      ).toBeLessThanOrEqual(now.getTime());
      expect(wave1.endDate.getTime(), `wave 1 should still be open at ${iso}`).toBeGreaterThan(
        now.getTime()
      );
    }
  });

  it('puts wave 2 entirely after wave 1', () => {
    const [wave1, wave2] = admissionWindows(JUL_24_2026);
    expect(wave2.startDate.getTime()).toBeGreaterThan(wave1.endDate.getTime());
    expect(wave2.endDate.getTime()).toBeGreaterThan(wave2.startDate.getTime());
  });

  it('names the waves after the intake year, not the current one', () => {
    const [wave1, wave2] = admissionWindows(JUL_24_2026);
    expect(wave1.name).toBe('SPMB 2027/2028 Gelombang 1');
    expect(wave2.name).toBe('SPMB 2027/2028 Gelombang 2');
  });

  it('lands on whole days', () => {
    for (const wave of admissionWindows(new Date('2026-07-24T17:43:21.000Z'))) {
      expect(wave.startDate.toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(wave.endDate.toISOString()).toMatch(/T00:00:00\.000Z$/);
    }
  });
});
