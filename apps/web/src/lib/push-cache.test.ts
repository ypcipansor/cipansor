import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearPrivateServiceWorkerCaches } from "./push-cache";

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
