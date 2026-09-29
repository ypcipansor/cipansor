import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { UpdatePrompt } from "./update-prompt";

/**
 * The service worker no longer calls skipWaiting() on install, so an update
 * waits. These pin the other half: the user is told, and the reload happens
 * only after they accept (and only when a worker is actually in control).
 */

type SWLike = EventTarget & {
  controller: unknown;
  postMessage: ReturnType<typeof vi.fn>;
};

function installServiceWorker(controller: unknown) {
  const sw = new EventTarget() as SWLike;
  sw.controller = controller;
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: sw,
    configurable: true,
  });
  return sw;
}

describe("UpdatePrompt", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.__swWaiting = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows when a waiting worker is announced", () => {
    installServiceWorker({});
    render(<UpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("sw-update-ready"));
    });
    expect(screen.getByText("Versi baru tersedia")).toBeInTheDocument();
  });

  it("shows when a waiting worker was stashed before mount", () => {
    installServiceWorker({});
    window.__swWaiting = {} as ServiceWorker;
    render(<UpdatePrompt />);
    expect(screen.getByText("Versi baru tersedia")).toBeInTheDocument();
  });

  it("stays hidden on a first install (nothing announced yet)", () => {
    installServiceWorker(null);
    // ServiceWorkerRegister only announces once a controller exists, so on a
    // true first install the stash is never set.
    window.__swWaiting = null;
    render(<UpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a tab open before the first claim still hears a later update", () => {
    // A clean-profile tab: the worker has not claimed it yet, so the listeners
    // must already be attached (the regression this covers is the old early
    // return that attached nothing until *after* a claim).
    const sw = installServiceWorker(null);
    render(<UpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();

    // The worker claims the page, then a deploy installs a waiting update —
    // exactly what ServiceWorkerRegister announces (it only does so once a
    // controller is present).
    act(() => {
      sw.controller = {};
      window.__swWaiting = {} as ServiceWorker;
      window.dispatchEvent(new Event("sw-update-ready"));
    });
    expect(screen.getByText("Versi baru tersedia")).toBeInTheDocument();
  });

  it("asks the waiting worker to activate and reloads on accept", async () => {
    vi.useFakeTimers();
    const sw = installServiceWorker({});
    const postMessage = vi.fn();
    window.__swWaiting = { postMessage } as unknown as ServiceWorker;
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });

    render(<UpdatePrompt />);
    act(() => {
      screen.getByRole("button", { name: /Muat ulang/ }).click();
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(sessionStorage.getItem("pwa-sw-updated")).toBe("1");
    // Safety net fires if the controllerchange never arrives.
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    void sw;
  });

  it("only auto-reloads on controllerchange after the user accepted", () => {
    const sw = installServiceWorker({});
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });
    render(<UpdatePrompt />);

    // A first-install claim (no accepted flag) must not reload the page.
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(reload).not.toHaveBeenCalled();

    sessionStorage.setItem("pwa-sw-updated", "1");
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
