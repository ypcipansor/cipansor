import { describe, it, expect } from 'vitest';
import { JUZ_AYAH_COUNTS, QURAN_SURAHS, memorizedJuz, tahfidzMilestones } from './quran-surahs';

describe('quran-surahs', () => {
  it('has 114 surahs and 30 juz that both add up to 6,236 ayat', () => {
    expect(QURAN_SURAHS).toHaveLength(114);
    expect(QURAN_SURAHS.reduce((sum, s) => sum + s.verses, 0)).toBe(6236);
    expect(JUZ_AYAH_COUNTS).toHaveLength(30);
    expect(JUZ_AYAH_COUNTS.reduce((sum, n) => sum + n, 0)).toBe(6236);
  });

  it('agrees with the surah table where a whole juz is whole surahs', () => {
    // Juz 28, 29 and 30 start and end on surah boundaries (58–66, 67–77, 78–114).
    const versesIn = (first: number, last: number) =>
      QURAN_SURAHS.filter((s) => s.number >= first && s.number <= last).reduce(
        (sum, s) => sum + s.verses,
        0
      );
    expect(JUZ_AYAH_COUNTS[27]).toBe(versesIn(58, 66));
    expect(JUZ_AYAH_COUNTS[28]).toBe(versesIn(67, 77));
    expect(JUZ_AYAH_COUNTS[29]).toBe(versesIn(78, 114));
  });
});

describe('memorizedJuz', () => {
  it('weighs each juz by its own size', () => {
    // All of juz 30 (564 ayat) plus half of juz 29 (431 ayat) is 1.5 juz.
    // The old "ayat / 600" said 1; "juz touched" would say 2.
    expect(
      memorizedJuz([
        [30, 564],
        [29, 215.5],
      ])
    ).toBeCloseTo(1.5, 5);
  });

  it('counts juz 28 in full at 137 ayat, which ayat / 600 put at 0.2', () => {
    expect(memorizedJuz([[28, 137]])).toBe(1);
  });

  it('caps a juz at 1 and ignores unknown juz and empty rows', () => {
    expect(
      memorizedJuz([
        [30, 9999],
        [31, 50],
        [0, 10],
        [1, 0],
      ])
    ).toBe(1);
    expect(memorizedJuz([])).toBe(0);
  });
});

describe('tahfidzMilestones', () => {
  const full = (juz: number) => JUZ_AYAH_COUNTS[juz - 1];
  /** The first `n` juz from 30 downwards, all complete. */
  const completeJuz = (n: number) =>
    new Map(Array.from({ length: n }, (_, i) => [30 - i, full(30 - i)] as const));

  it('fires when the setoran completes its juz — juz 28 at 137 ayat, not at 600', () => {
    const after = new Map([[28, 137]]);
    expect(tahfidzMilestones(after, { juz: 28, totalAyah: 20 })).toEqual([
      { type: 'juz_complete', juz: 28, completedJuz: 1 },
    ]);
  });

  it('stays quiet while the juz is still incomplete', () => {
    expect(tahfidzMilestones(new Map([[30, 563]]), { juz: 30, totalAyah: 40 })).toEqual([]);
  });

  it('does not fire again for a setoran on a juz that was already complete', () => {
    expect(tahfidzMilestones(new Map([[30, 600]]), { juz: 30, totalAyah: 10 })).toEqual([]);
  });

  it('adds half_quran on the setoran that completes the 15th juz, and only that one', () => {
    const after = completeJuz(15);
    expect(tahfidzMilestones(after, { juz: 16, totalAyah: 30 })).toEqual([
      { type: 'juz_complete', juz: 16, completedJuz: 15 },
      { type: 'half_quran', completedJuz: 15 },
    ]);
    const sixteen = completeJuz(16);
    expect(tahfidzMilestones(sixteen, { juz: 15, totalAyah: 30 }).map((m) => m.type)).toEqual([
      'juz_complete',
    ]);
  });

  it('adds full_quran on the 30th juz', () => {
    expect(
      tahfidzMilestones(completeJuz(30), { juz: 1, totalAyah: 148 }).map((m) => m.type)
    ).toEqual(['juz_complete', 'full_quran']);
  });

  it('ignores unknown juz and empty setoran', () => {
    expect(tahfidzMilestones(new Map([[31, 999]]), { juz: 31, totalAyah: 999 })).toEqual([]);
    expect(tahfidzMilestones(new Map([[30, 564]]), { juz: 30, totalAyah: 0 })).toEqual([]);
  });
});
