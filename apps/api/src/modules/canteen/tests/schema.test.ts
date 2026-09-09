import { describe, expect, it } from 'vitest';
import { UpdateCategorySchema, UpdateItemSchema } from '../canteen.schema';

describe('canteen update schemas (Zod 4 partial-overwrite regression)', () => {
  describe('UpdateCategorySchema', () => {
    it('does not leak sortOrder/isActive defaults when only name is sent', () => {
      const parsed = UpdateCategorySchema.parse({ name: 'Kategori A' });
      expect(parsed).toEqual({ name: 'Kategori A' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(UpdateCategorySchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      expect(UpdateCategorySchema.parse({ sortOrder: 3, isActive: false })).toEqual({
        sortOrder: 3,
        isActive: false,
      });
    });
  });

  describe('UpdateItemSchema', () => {
    it('does not leak stock/minStock/unit/isAvailable/isActive defaults when only name is sent', () => {
      const parsed = UpdateItemSchema.parse({ name: 'Item A' });
      expect(parsed).toEqual({ name: 'Item A' });
    });

    it('parses an empty object to only the keys actually sent', () => {
      expect(UpdateItemSchema.parse({})).toEqual({});
    });

    it('keeps explicitly provided defaulted fields', () => {
      const parsed = UpdateItemSchema.parse({ stock: 10, unit: 'kg', isActive: false });
      expect(parsed).toEqual({ stock: 10, unit: 'kg', isActive: false });
    });

    it('still validates provided values on defaulted fields', () => {
      expect(UpdateItemSchema.safeParse({ stock: -1 }).success).toBe(false);
    });
  });
});
