import { describe, it, expect } from 'vitest';
import { QuranAbility } from '@prisma/client';
import { QURAN_ABILITIES, QURAN_ABILITY_LABELS, quranAbilityLabel } from '@cipansor/shared';
import { createRegistrantSchema } from '../admissions.schema';

// A registrant's Qur'an ability has one vocabulary. The public form sent
// "IQRO" and "HAFIDZ" while the lead scores and the seeds read "IQRA" and
// "TAHFIDZ", so a declared hafalan never counted; nothing refused the stray
// spelling because the column was free text.

const registration = (quranAbility?: string) => ({
  admissionPeriodId: '00000000-0000-4000-8000-000000000000',
  fullName: 'Calon Santri',
  gender: 'MALE',
  birthPlace: 'Tasikmalaya',
  birthDate: '2014-05-01T00:00:00.000Z',
  address: 'Kp. Cipansor, Tasikmalaya',
  fatherName: 'Ayah',
  motherName: 'Ibu',
  ...(quranAbility === undefined ? {} : { quranAbility }),
});

describe("a registrant's Qur'an ability", () => {
  it('is the same five codes in the database and in the shared contract', () => {
    expect([...QURAN_ABILITIES]).toEqual(Object.values(QuranAbility));
    expect(Object.keys(QURAN_ABILITY_LABELS)).toEqual([...QURAN_ABILITIES]);
  });

  it('accepts each of the five, or none', () => {
    for (const code of QURAN_ABILITIES) {
      expect(createRegistrantSchema.safeParse(registration(code)).success).toBe(true);
    }
    expect(createRegistrantSchema.safeParse(registration()).success).toBe(true);
  });

  it('refuses the spellings the public form used to send', () => {
    for (const stray of ['IQRO', 'HAFIDZ', 'tahfidz', '']) {
      const result = createRegistrantSchema.safeParse(registration(stray));
      expect(result.success, stray).toBe(false);
    }
  });

  it('is shown by its label, and an unknown code as it is', () => {
    expect(quranAbilityLabel('TAHFIDZ')).toBe('Sudah hafal beberapa juz');
    expect(quranAbilityLabel('XYZ')).toBe('XYZ');
    expect(quranAbilityLabel(null)).toBeNull();
  });
});
