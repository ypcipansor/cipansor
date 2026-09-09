import { describe, expect, it } from 'vitest';
import { updateEventSchema } from '../calendar.schema';

describe('calendar update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('updateEventSchema', () => {
    it('does not leak isAllDay/visibility/recurrenceType/isImportant defaults when only title is sent', () => {
      const parsed = updateEventSchema.parse({ title: 'Rapat Guru' });
      expect(parsed).toEqual({ title: 'Rapat Guru' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(updateEventSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = updateEventSchema.parse({ isAllDay: true, isImportant: true });
      expect(parsed).toEqual({ isAllDay: true, isImportant: true });
    });
  });
});
