import { describe, expect, it } from 'vitest';
import { updateInventoryItemSchema } from '../inventory.schema';

describe('inventory update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('updateInventoryItemSchema', () => {
    it('does not leak status/condition defaults when only name is sent', () => {
      const parsed = updateInventoryItemSchema.parse({ name: 'Proyektor' });
      expect(parsed).toEqual({ name: 'Proyektor' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(updateInventoryItemSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = updateInventoryItemSchema.parse({ status: 'MAINTENANCE', condition: 'FAIR' });
      expect(parsed).toEqual({ status: 'MAINTENANCE', condition: 'FAIR' });
    });
  });
});
