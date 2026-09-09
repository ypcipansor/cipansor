import { describe, expect, it } from 'vitest';
import { UpdatePricingSchema } from '../laundry.schema';

describe('laundry update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('UpdatePricingSchema', () => {
    it('does not leak minWeight/processDays/isExpress/isActive defaults when only name is sent', () => {
      const parsed = UpdatePricingSchema.parse({ name: 'Paket Cuci' });
      expect(parsed).toEqual({ name: 'Paket Cuci' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(UpdatePricingSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = UpdatePricingSchema.parse({ minWeight: 3, isExpress: true });
      expect(parsed).toEqual({ minWeight: 3, isExpress: true });
    });

    it('still validates provided values on defaulted fields', () => {
      expect(UpdatePricingSchema.safeParse({ processDays: 0 }).success).toBe(false);
    });
  });
});
