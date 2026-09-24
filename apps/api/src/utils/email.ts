/**
 * Canonical form of an e-mail address for storage and lookup.
 *
 * PostgreSQL compares strings case-sensitively, so `User@cipansor.or.id` and
 * `user@cipansor.or.id` are two different rows to a plain `@unique` index.
 * SSO hands us whatever casing the identity provider issues while local
 * registration stored whatever the admin typed, so the same mailbox could
 * fail to match its own account. Lower-casing at every write and at every
 * lookup is what keeps the two ends talking — and the functional unique index
 * added alongside this helper is what stops a future writer from reintroducing
 * the mismatch.
 *
 * Only the domain is case-insensitive by RFC 5321, but the local part is
 * treated as case-insensitive in practice by every provider this system
 * federates with (Google Workspace, Microsoft 365), so a single lower-casing
 * pass is correct here.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `null`-preserving variant for optional fields: an absent or empty e-mail
 * stays absent rather than becoming the empty string.
 */
export function normalizeOptionalEmail(
  email: string | null | undefined
): string | null | undefined {
  if (email === null || email === undefined) return email;
  if (email === '') return null;
  return normalizeEmail(email);
}
