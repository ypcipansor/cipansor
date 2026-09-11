import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodResolver } from './zod-resolver';

describe('zodResolver (Zod 4 coerce wrapper)', () => {
  // The wrapper types the resolver input as `z.output<S>`, but RHF actually
  // hands it the raw form values (strings). Casting to `any` here mirrors what
  // RHF does at runtime; the point is to prove the resolver still coerces
  // strings to numbers and reports errors (the type cast is only a cast).
  it('coerces form string values to the schema output type at runtime', async () => {
    const schema = z.object({
      points: z.coerce.number().min(1),
      label: z.string().min(1),
    });

    const resolver = zodResolver(schema);
    const rawFormValues = { points: '5', label: 'a' } as any;
    const result = await resolver(rawFormValues, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });

    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ points: 5, label: 'a' });
  });

  it('still reports validation errors for invalid coerced values', async () => {
    const schema = z.object({
      points: z.coerce.number().min(1),
    });

    const resolver = zodResolver(schema);
    const rawFormValues = { points: '0' } as any;
    const result = await resolver(rawFormValues, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });

    expect(result.values).toEqual({});
    expect(result.errors).toBeDefined();
    expect(result.errors?.points).toBeDefined();
  });
});
