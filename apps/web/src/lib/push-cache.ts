/**
 * Ask the service worker to drop the caches that can hold per-user content.
 *
 * A service worker's Cache Storage outlives the page that filled it, so a
 * sign-out must clear it explicitly: otherwise the next person on the device
 * can still read the former user's cached pages (and any private image the
 * worker stored) straight from the cache (CWE-524).
 *
 * Best-effort by design — this runs during logout and must never throw or hold
 * up the redirect. If there is no worker (first visit, dev), there is nothing
 * cached to clear.
 */
export async function clearPrivateServiceWorkerCaches(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: "CLEAR_PRIVATE_CACHES" });
  } catch {
    // Nothing actionable: the caches are gone with the origin or the worker
    // will sweep them on the next activate.
  }
}

/**
 * This browser's push endpoint, or null when it has no live subscription.
 *
 * Read from the browser's own `PushSubscription`, never from a cache of a
 * previous session: it names *this* device so logout can clear just this
 * device's server row (see the `auth:logged_out` listener). Best-effort —
 * logout must proceed even if this fails.
 */
export async function currentPushEndpoint(): Promise<string | null> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Endpoints this tab deliberately turned off.
 *
 * The settings page and the authenticated shell each run a `useWebPush`
 * instance. When the user clicks "Matikan", the settings instance deletes the
 * row and unsubscribes the browser, but the shell instance still holds the
 * former `PushSubscription`; the `false` status then looks like a row to repair
 * and the shell re-registers the endpoint. A module-level set is what makes the
 * two agree — it is shared by every instance in the tab and survives the
 * settings page unmounting. `logout()` clears it.
 */
const deliberatelyOff = new Set<string>();

/** Record an endpoint the user turned off on purpose. */
export function markPushDeliberatelyOff(endpoint: string): void {
  deliberatelyOff.add(endpoint);
}

/** Whether the user turned this endpoint off on purpose in this tab. */
export function isPushDeliberatelyOff(endpoint: string): boolean {
  return deliberatelyOff.has(endpoint);
}

/** Forget one endpoint's deliberate-off marker — the user subscribed again. */
export function unmarkPushDeliberatelyOff(endpoint: string): void {
  deliberatelyOff.delete(endpoint);
}

/** Forget every deliberate-off marker — the session ended. */
export function clearDeliberatePushOff(): void {
  deliberatelyOff.clear();
}

/**
 * Cache key for "does the API hold a row for this endpoint".
 *
 * Includes the account because push rows are per-user: without it, logging out
 * and back in reused another account's (or a deleted row's) still-fresh answer.
 */
export function pushStatusQueryKey(
  userId: string | null,
  endpoint: string | null,
) {
  return ["web-push-status", userId, endpoint] as const;
}

/**
 * Drop the push-status cache when the session ends.
 *
 * Called from `logout()`: a browser `PushSubscription` survives the sign-out,
 * so a later login on the same device would otherwise read the previous
 * account's cached status. Removing the queries forces a fresh server probe.
 */
export function forgetPushStatus(queryClient: {
  removeQueries: (filters: { queryKey: readonly unknown[] }) => void;
}): void {
  queryClient.removeQueries({ queryKey: ["web-push-status"] });
  clearDeliberatePushOff();
}
