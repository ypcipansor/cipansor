import { z } from "zod";

/**
 * Single source of truth for the SSO login contract (Google & Microsoft 365).
 * Both the API (`auth.schema.ts`) and the web client derive their types from
 * this schema so the two sides can never drift apart.
 */
export const ssoLoginSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  idToken: z.string().min(1, "Valid OAuth idToken is required"),
});

export type SSOLoginInput = z.infer<typeof ssoLoginSchema>;