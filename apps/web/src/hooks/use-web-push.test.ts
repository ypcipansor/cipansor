import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const subscribePush = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const unsubscribePush = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const pushStatus = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/services/notifications.service", () => ({
  notificationsService: { subscribePush, unsubscribePush, pushStatus },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The hook reads this at module load, and ESM imports are hoisted above plain
// statements — so it must be set in a hoisted block, not before the import.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "B".repeat(87);
});

import { useWebPush } from "./use-web-push";

const subscription = {
  endpoint: "https://push.example.com/abc",
  toJSON: () => ({
    endpoint: "https://push.example.com/abc",
    expirationTime: null,
    keys: { p256dh: "p", auth: "a" },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function installPushEnv(opts: {
  permission?: NotificationPermission;
  existing?: typeof subscription | null;
}) {
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const getSubscription = vi.fn().mockResolvedValue(opts.existing ?? null);
  const registration = {
    pushManager: { subscribe, getSubscription },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
    configurable: true,
  });
  Object.defineProperty(window, "PushManager", {
    value: class {},
    configurable: true,
  });
  Object.defineProperty(window, "Notification", {
    value: {
      permission: opts.permission ?? "default",
      requestPermission: vi
        .fn()
        .mockResolvedValue(opts.permission ?? "granted"),
    },
    configurable: true,
  });
  return { subscribe, getSubscription };
}

describe("useWebPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports the live per-device state on mount", async () => {
    installPushEnv({ existing: subscription });
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("subscribed"));
  });

  it("reports unsubscribed when no subscription exists", async () => {
    installPushEnv({ existing: null });
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("unsubscribed"));
  });

  it("enables: requests permission, subscribes, and posts to the API", async () => {
    const { subscribe } = installPushEnv({ existing: null });
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("unsubscribed"));

    await act(async () => {
      await result.current.enable();
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribePush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/abc" }),
    );
    expect(result.current.state).toBe("subscribed");
  });

  it("does not subscribe when permission is denied", async () => {
    const { subscribe } = installPushEnv({ existing: null });
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("unsubscribed"));

    Object.defineProperty(window.Notification, "requestPermission", {
      value: vi.fn().mockResolvedValue("denied"),
      configurable: true,
    });
    await act(async () => {
      await result.current.enable();
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribePush).not.toHaveBeenCalled();
    expect(result.current.state).toBe("denied");
  });

  it("disables: deletes the endpoint server-side, then unsubscribes locally", async () => {
    installPushEnv({ existing: subscription });
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("subscribed"));

    await act(async () => {
      await result.current.disable();
    });

    expect(unsubscribePush).toHaveBeenCalledWith(
      "https://push.example.com/abc",
    );
    expect(subscription.unsubscribe).toHaveBeenCalled();
    // The server row must be gone before the browser drops the endpoint, or a
    // failed API call could never be retried (the endpoint is lost).
    const apiCallOrder = unsubscribePush.mock.invocationCallOrder[0];
    const browserCallOrder =
      subscription.unsubscribe.mock.invocationCallOrder[0];
    expect(apiCallOrder).toBeLessThan(browserCallOrder);
    expect(result.current.state).toBe("unsubscribed");
  });

  it("keeps the browser subscription usable when the server delete fails", async () => {
    installPushEnv({ existing: subscription });
    unsubscribePush.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("subscribed"));

    await act(async () => {
      await result.current.disable();
    });

    // The endpoint is still in the browser, so the next attempt can retry.
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(result.current.state).toBe("subscribed");
  });

  it("repairs a missing server row on mount instead of lying 'subscribed'", async () => {
    // Browser holds a subscription, but the API has no row for it (a failed
    // registration, or a logout-time purge). The device is not actually
    // reachable, so the hook must re-register rather than show "Aktif".
    installPushEnv({ existing: subscription });
    pushStatus.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.state).toBe("subscribed"));
    expect(pushStatus).toHaveBeenCalledWith("https://push.example.com/abc");
    expect(subscribePush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/abc" }),
    );
  });
});
