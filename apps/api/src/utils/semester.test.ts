import { describe, it, expect } from 'vitest';
import { semesterAt } from './semester';

// Which semester a moment is in, and its first day as the register dates it:
// the year's first day for the first semester, 1 January (WIB) for the second.

const YEAR = {
  startDate: new Date('2026-07-15T00:00:00.000Z'),
  endDate: new Date('2027-06-30T00:00:00.000Z'),
};

describe('semesterAt', () => {
  it('puts September in the first semester, from the first day of the year', () => {
    expect(semesterAt(YEAR, new Date('2026-09-28T03:00:00.000Z'))).toEqual({
      semester: 1,
      startDay: '2026-07-15',
    });
  });

  it('keeps 31 December late evening WIB in the first semester', () => {
    // 23:30 WIB on 31 December is 16:30 UTC.
    expect(semesterAt(YEAR, new Date('2026-12-31T16:30:00.000Z')).semester).toBe(1);
  });

  it('starts the second semester at 1 January 00:00 WIB', () => {
    // 00:30 WIB on 1 January is 17:30 UTC on 31 December.
    expect(semesterAt(YEAR, new Date('2026-12-31T17:30:00.000Z'))).toEqual({
      semester: 2,
      startDay: '2027-01-01',
    });
    expect(semesterAt(YEAR, new Date('2027-03-10T03:00:00.000Z')).startDay).toBe('2027-01-01');
  });
});
