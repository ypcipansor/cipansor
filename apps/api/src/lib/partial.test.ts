import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { partialUpdateSchema } from './partial';

describe('partialUpdateSchema', () => {
  const createSchema = z.object({
    name: z.string().min(2),
    credits: z.number().int().min(1).max(10).default(2),
    isActive: z.boolean().default(true),
    level: z.string().optional(),
  });

  it('does not fill in defaults for omitted keys (Zod 4 partial regression)', () => {
    const updateSchema = partialUpdateSchema(createSchema);
    expect(updateSchema.parse({ name: 'Matematika' })).toEqual({ name: 'Matematika' });
  });

  it('parsing an empty object yields only the keys actually sent', () => {
    const updateSchema = partialUpdateSchema(createSchema);
    expect(updateSchema.parse({})).toEqual({});
  });

  it('keeps explicitly provided values, including defaulted fields', () => {
    const updateSchema = partialUpdateSchema(createSchema);
    expect(updateSchema.parse({ credits: 5, isActive: false })).toEqual({
      credits: 5,
      isActive: false,
    });
  });

  it('still validates provided values (e.g. minimums on defaulted fields)', () => {
    const updateSchema = partialUpdateSchema(createSchema);
    expect(updateSchema.safeParse({ credits: 0 }).success).toBe(false);
  });
});
