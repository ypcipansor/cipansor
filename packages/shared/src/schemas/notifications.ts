import { z } from "zod";

/**
 * Web Push contract — one home for the shape both sides speak.
 *
 * The browser builds a payload from `PushSubscription.toJSON()`; the API
 * validates the same shape at the edge and stores it. Until 2026-09-29 the API
 * declared its own `pushSubscribeSchema` and the web carried a hand-written
 * `WebPushSubscriptionPayload` interface, so the two could drift with nothing
 * to catch it. This schema is the single source; the interface is inferred from
 * it (see `types/notifications.ts`).
 */

/**
 * A push service endpoint: HTTPS, and never a host the server itself reaches.
 *
 * The endpoint is attacker-controlled and the sender POSTs to it from inside
 * our network, so an unvalidated value is an SSRF primitive (CWE-918):
 * `https://127.0.0.1/…` or `https://169.254.169.254/…` would turn the sender
 * into a probe of our own hosts and the cloud metadata service. Real push
 * services are public HTTPS hosts (FCM, Mozilla, Apple, WNS), so requiring
 * HTTPS and rejecting loopback / link-local / private / unique-local addresses
 * rejects nothing a browser would produce.
 *
 * A hostname that merely *looks* internal (e.g. `internal.example.com`) cannot
 * be judged here — only a literal IP or the obvious localhost names are
 * refused. A DNS-resolving check belongs at send time, in the sender.
 */
const PRIVATE_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function isSafePushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  // `URL` brackets an IPv6 host (`[::1]`); strip them before matching.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;

  // Only a literal IP can be judged; a name is left to the sender's DNS check.
  // An IPv6 literal is the only host containing a colon, so scope the IPv6
  // rules to it — otherwise a name like `fcm.googleapis.com` matches the
  // unique-local `^f[cd]` prefix and a real push service is wrongly refused.
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false;
    // Link-local (fe80::/10) and unique-local (fc00::/7).
    if (/^fe[89ab]/.test(host) || /^f[cd]/.test(host)) return false;
    return true;
  }

  if (host === "0.0.0.0") return false;
  // Scope the IPv4 rules to a literal dotted-quad, so a public name that merely
  // starts with digits (`10.example.com`) is not mistaken for a private IP.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && PRIVATE_IPV4.test(host)) {
    return false;
  }
  return true;
}

export const pushEndpointSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isSafePushEndpoint, {
    message: "Endpoint notifikasi push harus berupa URL HTTPS publik",
  });

/** A browser PushSubscription as sent to the API (`subscription.toJSON()`). */
export const webPushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export type WebPushSubscription = z.infer<typeof webPushSubscriptionSchema>;
