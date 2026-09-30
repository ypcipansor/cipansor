import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearDeliberatePushOff,
  clearPrivateServiceWorkerCaches,
  forgetPushStatus,
  isPushDeliberatelyOff,
  listenForPushChanges,
  markPushDeliberatelyOff,
  onPushDeliberateChange,
  pushStatusQueryKey,
  unmarkPushDeliberatelyOff,
} from "./push-cache";

/** Replace `navigator.serviceWorker` with the given (or no) registration. */
function installServiceWorker(
  registration: { active?: { postMessage: ReturnType<typeof vi.fn> } } | null,
) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: registration
      ? { getRegistration: vi.fn().mockResolvedValue(registration) }
      : undefined,
    configurable: true,
  });
}

describe("clearPrivateServiceWorkerCaches", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    // Leave the shared jsdom navigator as we found it.
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("asks the active worker to drop the private caches", async () => {
    const postMessage = vi.fn();
    installServiceWorker({ active: { postMessage } });

    await clearPrivateServiceWorkerCaches();

    expect(postMessage).toHaveBeenCalledWith({ type: "CLEAR_PRIVATE_CACHES" });
  });

  it("does nothing when no worker is registered", async () => {
    installServiceWorker({});
    await expect(clearPrivateServiceWorkerCaches()).resolves.toBeUndefined();
  });

  it("is a no-op without service worker support", async () => {
    installServiceWorker(null);
    await expect(clearPrivateServiceWorkerCaches()).resolves.toBeUndefined();
  });

  it("never throws when the worker lookup fails", async () => {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockRejectedValue(new Error("boom")),
      },
      configurable: true,
    });

    await expect(clearPrivateServiceWorkerCaches()).resolves.toBeUndefined();
  });
});

describe("push cache keys", () => {
  it("namespaces the status by account and endpoint", () => {
    expect(pushStatusQueryKey("user-1", "https://push.example.com/a")).toEqual([
      "web-push-status",
      "user-1",
      "https://push.example.com/a",
    ]);
    // Different accounts never share a key, so one account's cached answer
    // cannot be read for another.
    expect(
      pushStatusQueryKey("user-2", "https://push.example.com/a"),
    ).not.toEqual(pushStatusQueryKey("user-1", "https://push.example.com/a"));
  });

  it("tracks a deliberate-off endpoint and clears it on resubscribe", () => {
    const endpoint = "https://push.example.com/a";
    expect(isPushDeliberatelyOff(endpoint)).toBe(false);

    markPushDeliberatelyOff(endpoint);
    expect(isPushDeliberatelyOff(endpoint)).toBe(true);

    unmarkPushDeliberatelyOff(endpoint);
    expect(isPushDeliberatelyOff(endpoint)).toBe(false);
  });

  it("forgetPushStatus removes every account's status queries and markers", () => {
    markPushDeliberatelyOff("https://push.example.com/a");
    const removeQueries = vi.fn();
    forgetPushStatus({ removeQueries });

    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["web-push-status"],
    });
    // The next session must not inherit this one's "turned off" endpoints.
    expect(isPushDeliberatelyOff("https://push.example.com/a")).toBe(false);
  });
});

describe("cross-tab deliberate push changes", () => {
  const CHANNEL = "cipansor-push";

  afterEach(() => {
    clearDeliberatePushOff();
    vi.restoreAllMocks();
  });

  it("broadcasts a deliberate off and announces it to local listeners", () => {
    const seen: Array<[string, boolean]> = [];
    const stop = onPushDeliberateChange((endpoint, off) =>
      seen.push([endpoint, off]),
    );

    markPushDeliberatelyOff("https://push.example.com/a");

    // The instance that acted must learn about it too: the marker is what the
    // repair effect reads.
    expect(seen).toEqual([["https://push.example.com/a", true]]);
    expect(isPushDeliberatelyOff("https://push.example.com/a")).toBe(true);
    stop();
  });

  it("adopts a deliberate off announced by another tab", async () => {
    // The other tab broadcasts on the same channel; this tab's listener must
    // record the endpoint as deliberately off, so its reconcile refuses to
    // restore the row the user just removed.
    listenForPushChanges();
    const seen: Array<[string, boolean]> = [];
    const stop = onPushDeliberateChange((endpoint, off) =>
      seen.push([endpoint, off]),
    );

    const otherTab = new BroadcastChannel(CHANNEL);
    otherTab.postMessage({
      type: "push-off",
      endpoint: "https://push.example.com/shared",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    otherTab.close();

    expect(isPushDeliberatelyOff("https://push.example.com/shared")).toBe(true);
    expect(seen).toEqual([["https://push.example.com/shared", true]]);
    stop();
  });

  it("clears the marker when another tab subscribes again", async () => {
    listenForPushChanges();
    markPushDeliberatelyOff("https://push.example.com/shared");

    const otherTab = new BroadcastChannel(CHANNEL);
    otherTab.postMessage({
      type: "push-on",
      endpoint: "https://push.example.com/shared",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    otherTab.close();

    expect(isPushDeliberatelyOff("https://push.example.com/shared")).toBe(
      false,
    );
  });
});
