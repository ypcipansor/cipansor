import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { InstallPrompt } from "./install-prompt";
import { useAuthStore } from "@/stores/auth";

/**
 * iOS has no `beforeinstallprompt`, so the native banner never shows there.
 * The regression these tests guard: an iPhone user was never told the app could
 * be installed at all. These pin the manual Share-sheet path, and that the
 * native path still wins where it exists.
 */

const ORIGINAL = {
  userAgent: window.navigator.userAgent,
  maxTouchPoints: window.navigator.maxTouchPoints,
  standalone: (window.navigator as { standalone?: boolean }).standalone,
};

function setUA(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

describe("InstallPrompt — iOS guidance", () => {
  beforeEach(() => {
    localStorage.clear();
    window.__installPromptEvent = null;
    window.__swWaiting = null;
    useAuthStore.setState({ isAuthenticated: true });
    // matchMedia is absent in jsdom; isInstalled() guards with ?. so it is fine.
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setUA(ORIGINAL.userAgent, ORIGINAL.maxTouchPoints);
  });

  it("shows the Share-sheet instructions on an iPhone with no native event", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5);
    render(<InstallPrompt />);
    expect(screen.getByText("Pasang aplikasi Cipansor")).toBeInTheDocument();
    expect(screen.getByText(/Tambah ke Layar Utama/)).toBeInTheDocument();
    // iOS 26 hides Share behind "⋯"; the copy names both routes.
    expect(screen.getByText("⋯")).toBeInTheDocument();
    // No "Pasang" button — there is nothing programmatic to call on iOS.
    expect(screen.queryByRole("button", { name: /Pasang/ })).toBeNull();
  });

  it("treats a touch-capable Mac (iPadOS) as iOS too", () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5);
    render(<InstallPrompt />);
    expect(screen.getByText(/Tambah ke Layar Utama/)).toBeInTheDocument();
  });

  it("stays quiet on desktop Chrome until the event fires", () => {
    setUA("Mozilla/5.0 (X11; Linux x86_64) Chrome/120", 0);
    render(<InstallPrompt />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("switches to the native prompt when Chrome fires the event", () => {
    setUA("Mozilla/5.0 (Linux; Android 14) Chrome/120", 5);
    render(<InstallPrompt />);
    expect(screen.queryByRole("complementary")).toBeNull();

    act(() => {
      window.__installPromptEvent = {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      } as unknown as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
      };
      window.dispatchEvent(new Event("installpromptready"));
    });

    expect(screen.getByRole("button", { name: /Pasang/ })).toBeInTheDocument();
    expect(screen.queryByText(/Tambah ke Layar Utama/)).toBeNull();
  });

  it("respects an existing dismissal (no nagging)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5);
    localStorage.setItem(
      "pwa-install-dismissed-until",
      String(Date.now() + 1000 * 60 * 60),
    );
    render(<InstallPrompt />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("waits until the person has signed in", () => {
    // Not on the sign-in page: the banner would sit over the one form a first
    // visit is for. It appears on the first page after sign-in instead.
    useAuthStore.setState({ isAuthenticated: false });
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5);
    render(<InstallPrompt />);
    expect(screen.queryByRole("complementary")).toBeNull();

    act(() => {
      useAuthStore.setState({ isAuthenticated: true });
    });
    expect(
      screen.getByRole("complementary", { name: "Pasang aplikasi Cipansor" }),
    ).toBeInTheDocument();
  });

  it("gives way while an update banner is up in the same corner", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5);
    render(<InstallPrompt />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("sw-update-ready"));
    });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("gives its close button a thumb-sized target", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5);
    render(<InstallPrompt />);
    const close = screen.getByRole("button", { name: "Tutup" });
    expect(close.className).toContain("h-9");
    expect(close.className).toContain("w-9");
  });
});
