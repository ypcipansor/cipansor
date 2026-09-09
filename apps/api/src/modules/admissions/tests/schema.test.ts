import { describe, expect, it } from 'vitest';
import { updateAdmissionPeriodSchema } from '../admissions.schema';

describe('admissions update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('updateAdmissionPeriodSchema', () => {
    it('does not leak quota/registrationFee defaults when only name is sent', () => {
      const parsed = updateAdmissionPeriodSchema.parse({ name: 'PPDB 2026' });
      expect(parsed).toEqual({ name: 'PPDB 2026' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(updateAdmissionPeriodSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = updateAdmissionPeriodSchema.parse({ quota: 120, registrationFee: 250000 });
      expect(parsed).toEqual({ quota: 120, registrationFee: 250000 });
    });
  });
});
