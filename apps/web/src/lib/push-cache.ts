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
