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
 * Endpoints this browser deliberately turned off.
 *
 * The settings page and the authenticated shell each run a `useWebPush`
 * instance. When the user clicks "Matikan", the settings instance deletes the
 * row and unsubscribes the browser, but the shell instance still holds the
 * former `PushSubscription`; the `false` status then looks like a row to repair
 * and the shell re-registers the endpoint. A module-level set is what makes the
 * two agree — it is shared by every instance in the tab and survives the
 * settings page unmounting. `logout()` clears it.
 *
 * A module-level set is per *tab*, though, and the same device can have the
 * portal open twice: the other tab still holds the subscription, sees a `false`
 * status and would re-register the endpoint the user just removed. So every
 * change is also broadcast on a `BroadcastChannel` (see `notifyDeliberate`), and
 * a tab that hears about one stops reconciling that endpoint too.
 */
const deliberatelyOff = new Set<string>();

/**
 * Channel carrying deliberate push changes between tabs of this origin.
 *
 * Feature-detected because `BroadcastChannel` is not universal — an older
 * browser, or a test environment without it, must still get a working (if
 * tab-local) marker rather than a crash.
 */
const PUSH_CHANNEL = "cipansor-push";

type PushBroadcast =
  | { type: "push-off"; endpoint: string }
  | { type: "push-on"; endpoint: string };

function broadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(PUSH_CHANNEL);
  } catch {
    return null;
  }
}

/** Tell the other tabs this endpoint changed, then release the channel. */
function notifyDeliberate(message: PushBroadcast): void {
  const channel = broadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

/**
 * Apply a deliberate change announced by another tab.
 *
 * Only the marker is touched: the browser `PushSubscription` is shared across
 * tabs, so the tab that did not act must still stop its reconciliation, and
 * that is exactly what the marker decides.
 */
function applyRemoteDeliberate(message: PushBroadcast): void {
  if (message.type === "push-off") deliberatelyOff.add(message.endpoint);
  else deliberatelyOff.delete(message.endpoint);
  emitDeliberate(message.endpoint, message.type === "push-off");
}

/**
 * Notified whenever an endpoint's deliberate-off state changes, in this tab or
 * another. `useWebPush` uses it to drop the `PushSubscription` it still holds,
 * so a repair cannot run from state the user already turned off.
 */
type DeliberateListener = (endpoint: string, off: boolean) => void;

const deliberateListeners = new Set<DeliberateListener>();

/** Subscribe to deliberate push changes. Returns the unsubscribe function. */
export function onPushDeliberateChange(
  listener: DeliberateListener,
): () => void {
  deliberateListeners.add(listener);
  return () => {
    deliberateListeners.delete(listener);
  };
}

function emitDeliberate(endpoint: string, off: boolean): void {
  for (const listener of deliberateListeners) listener(endpoint, off);
}

let listening = false;

/**
 * Start listening for deliberate push changes from other tabs, once per tab.
 *
 * Kept open for the page's lifetime: the settings page mounts and unmounts,
 * while the shell stays mounted, and the point is to be listening whichever of
 * them is currently up. Idempotent, so both may call it.
 */
export function listenForPushChanges(): void {
  if (listening) return;
  const channel = broadcastChannel();
  if (!channel) return;
  channel.onmessage = (event: MessageEvent<PushBroadcast>) => {
    if (event.data && typeof event.data.endpoint === "string") {
      applyRemoteDeliberate(event.data);
    }
  };
  listening = true;
}

/** Record an endpoint the user turned off on purpose, in every tab. */
export function markPushDeliberatelyOff(endpoint: string): void {
  deliberatelyOff.add(endpoint);
  emitDeliberate(endpoint, true);
  notifyDeliberate({ type: "push-off", endpoint });
}

/** Whether the user turned this endpoint off on purpose in this tab. */
export function isPushDeliberatelyOff(endpoint: string): boolean {
  return deliberatelyOff.has(endpoint);
}

/** Forget one endpoint's deliberate-off marker — the user subscribed again. */
export function unmarkPushDeliberatelyOff(endpoint: string): void {
  deliberatelyOff.delete(endpoint);
  emitDeliberate(endpoint, false);
  notifyDeliberate({ type: "push-on", endpoint });
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

/**
 * The account that turned push on in this browser.
 *
 * Notification permission and the `PushSubscription` belong to the browser, not
 * to whoever is signed in, and both outlive a sign-out. Without a record of who
 * said yes, the next person to sign in on a shared device (a family tablet, the
 * office PC) was registered silently — receiving push they never asked for, or
 * leaving the previous person's notifications pointed at a device they no
 * longer hold. `useWebPush` keeps a subscription only for its owner and drops
 * it for anyone else, who then decides for themselves.
 *
 * localStorage, because the owner must survive the sign-out it exists for; the
 * value is an account id, nothing sensitive. Unreadable storage reads as "no
 * owner", which drops the subscription — the cautious direction.
 */
const PUSH_OWNER_KEY = "cipansor-push-owner";

export function pushOwner(): string | null {
  try {
    return localStorage.getItem(PUSH_OWNER_KEY);
  } catch {
    return null;
  }
}

export function setPushOwner(userId: string): void {
  try {
    localStorage.setItem(PUSH_OWNER_KEY, userId);
  } catch {
    // Storage blocked: the next visit finds no owner and asks again.
  }
}

export function clearPushOwner(): void {
  try {
    localStorage.removeItem(PUSH_OWNER_KEY);
  } catch {
    // Nothing to clear.
  }
}
