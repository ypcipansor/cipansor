import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

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
import { useAuthStore } from "@/stores/auth";
import { clearDeliberatePushOff, listenForPushChanges } from "@/lib/push-cache";

// Server calls now go through React Query, so every render needs a client. The
// settings page and the shell share one client in the app, so the tests do too
// when they need to reproduce that.
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function renderWebPush(client = makeClient()) {
  return renderHook(() => useWebPush(), { wrapper: wrapperWith(client) });
}

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
    // `clearAllMocks` keeps each mock's implementation, so a test that changed
    // one (a rejection, a `false` status) would leak into the next. Restore the
    // defaults explicitly.
    subscribePush.mockResolvedValue(undefined);
    unsubscribePush.mockResolvedValue(undefined);
    pushStatus.mockResolvedValue(true);
    subscription.unsubscribe.mockResolvedValue(true);
    // The deliberate-off set is module-level, so it outlives a test file; clear
    // it or the "does not re-register" test's marker leaks into the next run.
    clearDeliberatePushOff();
    // A signed-in user is required: push rows are per-account, so the hook only
    // probes the server when it knows who the account is.
    useAuthStore.setState({
      user: { id: "user-1", name: "Test", email: "t@example.com" } as never,
      isAuthenticated: true,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports the live per-device state on mount", async () => {
    installPushEnv({ existing: subscription });
    const { result } = renderWebPush();
    await waitFor(() => expect(result.current.state).toBe("subscribed"));
  });

  it("reports unsubscribed when no subscription exists", async () => {
    installPushEnv({ existing: null });
    const { result } = renderWebPush();
    await waitFor(() => expect(result.current.state).toBe("unsubscribed"));
  });

  it("enables: requests permission, subscribes, and posts to the API", async () => {
    const { subscribe } = installPushEnv({ existing: null });
    const { result } = renderWebPush();
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
    const { result } = renderWebPush();
    await waitFor(() => expect(result.current.state).toBe("unsubscribed"));

    Object.defineProperty(window.Notification, "requestPermission", {
      // A real browser also flips `Notification.permission` to "denied" and
      // never asks again; the hook reads that, so the mock must too.
      value: vi.fn().mockImplementation(() => {
        Object.defineProperty(window.Notification, "permission", {
          value: "denied",
          configurable: true,
        });
        return Promise.resolve("denied");
      }),
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
    const { result } = renderWebPush();
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
    const { result } = renderWebPush();
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
    const { result } = renderWebPush();

    await waitFor(() => expect(result.current.state).toBe("subscribed"));
    expect(pushStatus).toHaveBeenCalledWith("https://push.example.com/abc");
    expect(subscribePush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/abc" }),
    );
  });

  it("guides an iPhone user to install instead of calling the browser unsupported", () => {
    // iOS Safari exposes no PushManager until the PWA is on the Home Screen.
    // Reporting "unsupported" hides the one step that makes push work.
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    const { result } = renderWebPush();
    expect(result.current.state).toBe("needs-install");
  });

  it("reports unsupported for a non-iOS browser with no push API", () => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      configurable: true,
    });

    const { result } = renderWebPush();
    expect(result.current.state).toBe("unsupported");
  });

  it("does not re-register an endpoint after the user deliberately disabled it", async () => {
    // The settings page and the shell mount two instances against one client.
    // Disabling from the settings instance must not be undone by the shell's
    // reconciliation, which still holds the former PushSubscription.
    installPushEnv({ existing: subscription });
    const client = makeClient();
    const settings = renderHook(() => useWebPush(), {
      wrapper: wrapperWith(client),
    });
    const shell = renderHook(() => useWebPush(), {
      wrapper: wrapperWith(client),
    });

    await waitFor(() =>
      expect(settings.result.current.state).toBe("subscribed"),
    );
    await waitFor(() => expect(shell.result.current.state).toBe("subscribed"));

    await act(async () => {
      await settings.result.current.disable();
    });
    expect(settings.result.current.state).toBe("unsubscribed");

    // Give the shell's reconciliation effect a chance to (wrongly) fire.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(subscribePush).not.toHaveBeenCalled();
    expect(shell.result.current.state).toBe("unsubscribed");
  });

  it("does not re-register when another tab already turned push off", async () => {
    // The deliberate-off marker is per tab. Tab B's shell is already mounted
    // when the user clicks "Matikan" in tab A; tab B still holds the shared
    // subscription and its status probe returns `false`, so without the
    // cross-tab signal it re-creates the row the user just deleted.
    installPushEnv({ existing: subscription });
    pushStatus.mockResolvedValue(false);
    // Tab B's listener is live before tab A acts.
    listenForPushChanges();

    await act(async () => {
      const otherTab = new BroadcastChannel("cipansor-push");
      otherTab.postMessage({
        type: "push-off",
        endpoint: "https://push.example.com/abc",
      });
      await new Promise((r) => setTimeout(r, 20));
      otherTab.close();
    });

    const { result } = renderWebPush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(subscribePush).not.toHaveBeenCalled();
    expect(result.current.state).toBe("unsubscribed");
  });

  it("stops retrying a failed repair instead of looping", async () => {
    // The status says "no row", but the repair API is down. React Query flips
    // isPending back to false on failure; the old effect depended on it and
    // re-fired the same failed request on every render.
    installPushEnv({ existing: subscription });
    pushStatus.mockResolvedValue(false);
    subscribePush.mockRejectedValue(new Error("unavailable"));
    renderWebPush();

    await waitFor(() => expect(subscribePush).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(subscribePush).toHaveBeenCalledTimes(1);
  });

  it("keeps a fresh account's status out of another account's cache", async () => {
    // Logging out and back in on the same browser reused a still-fresh result
    // for the same endpoint, because the key excluded the account.
    installPushEnv({ existing: subscription });
    pushStatus.mockResolvedValueOnce(true);
    const client = makeClient();
    const first = renderWebPush(client);
    await waitFor(() => expect(first.result.current.state).toBe("subscribed"));

    // A different account signs in; the status must be re-probed, not reused.
    act(() => {
      useAuthStore.setState({
        user: { id: "user-2", name: "Other", email: "o@example.com" } as never,
        isAuthenticated: true,
      });
    });
    const second = renderWebPush(client);
    await waitFor(() => expect(pushStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.state).toBe("subscribed"));
  });
});
