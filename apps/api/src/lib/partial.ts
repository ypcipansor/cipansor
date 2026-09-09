import { z } from 'zod';

/**
 * Build a partial-update schema from a create schema in a way that matches the
 * pre-Zod-4 behavior of `.partial()`: omitted fields must NOT receive their
 * `.default()` value.
 *
 * In Zod 4 `createSchema.partial()` still runs each field's `.default()` when
 * the key is absent from the input, so a partial update would silently rewrite
 * omitted fields to their default (e.g. `updateSubjectSchema.parse({ name })`
 * yields `{ name, credits: 2, isActive: true }`, which then overwrites the
 * subject's real `credits`/`isActive` in Prisma). Zod 3 dropped the default in
 * a `.partial()`, so this was a regression introduced by the Zod 4 migration.
 *
 * Stripping each field's default before making the object partial keeps the
 * output limited to the keys actually present in the input, for both the base
 * `partial()` chain and anything chained after it (`.omit(...)`, `.extend(...)`).
 */
export function partialUpdateSchema<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const entries = Object.entries(schema.shape).map(([key, field]) => {
    const noDefault = field instanceof z.ZodDefault ? field.removeDefault() : field;
    return [key, noDefault];
  });
  const stripped = Object.fromEntries(entries) as unknown as Shape;
  return z.object(stripped).partial();
}
