import { zodResolver as zodResolverBase } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * Zod 4 types the resolver of a `z.coerce.*()` schema as `Resolver<input, …,
 * output>` where `input` is `unknown` for every coerced field. React Hook Form
 * requires `Resolver<TFieldValues, …>` with `TFieldValues` equal to the schema
 * OUTPUT (the shape the form actually holds), so the two are structurally
 * incompatible even though the runtime behaviour is identical.
 *
 * This casts the resolver to the output shape so the idiomatic
 * `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })` keeps
 * working. Values typed as output are assignable to the real (wider) input
 * type, so this is a type-only adjustment — no assertion is made that a schema
 * is invalid for a value it would already reject.
 */
export function zodResolver<S extends z.ZodType<Record<string, any>>>(
  schema: S,
): Resolver<z.output<S>, any, z.output<S>> {
  return (
    zodResolverBase as unknown as (
      s: S,
    ) => Resolver<z.output<S>, any, z.output<S>>
  )(schema);
}
