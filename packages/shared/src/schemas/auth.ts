import { z } from "zod";

/**
 * Single source of truth for the SSO login contract (Google & Microsoft 365).
 * Both the API (`auth.schema.ts`) and the web client derive their types from
 * this schema so the two sides can never drift apart.
 */
export const ssoLoginSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  idToken: z.string().min(1, "Valid OAuth idToken is required"),
  /**
   * Cloudflare Turnstile token for the SSO surface.
   *
   * Optional because the gate can be switched off entirely (development, e2e,
   * and deployments that have not yet installed the keys). It is exchanged and
   * discarded by `requireTurnstile('sso-login')` before `validate` runs, so this
   * field is documented here mainly so the web client can send it type-safely.
   */
  turnstileToken: z.string().optional(),
});

export type SSOLoginInput = z.infer<typeof ssoLoginSchema>;
