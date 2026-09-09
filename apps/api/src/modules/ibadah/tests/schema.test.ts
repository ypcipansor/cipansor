import { describe, expect, it } from 'vitest';
import { updateRecordSchema } from '../ibadah.schema';

describe('ibadah update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('updateRecordSchema', () => {
    it('does not leak isCompleted default when only notes is sent', () => {
      const parsed = updateRecordSchema.parse({ notes: 'Alhamdulillah' });
      expect(parsed).toEqual({ notes: 'Alhamdulillah' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(updateRecordSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = updateRecordSchema.parse({ isCompleted: true });
      expect(parsed).toEqual({ isCompleted: true });
    });
  });
});
