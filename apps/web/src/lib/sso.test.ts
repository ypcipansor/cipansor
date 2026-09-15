import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { microsoftAuthority } from "./sso";

/**
 * The Microsoft authority must come from the tenant the backend enforces, and
 * fall back to the app's own authority segment. Getting this wrong silently
 * routes a single-tenant Entra app through `/common/`, which Microsoft then
 * rejects — and the failure looks like "SSO is broken" rather than "wrong
 * tenant", which is why it is pinned here.
 */
describe("microsoftAuthority", () => {
  it("derives the authority from the application object id segment", () => {
    expect(microsoftAuthority("11111111-2222-3333-4444-555555555555")).toBe(
      "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555",
    );
  });

  it("keeps only the app id when the client id carries extra segments", () => {
    expect(microsoftAuthority("app-id.tenant-id.extra")).toBe(
      "https://login.microsoftonline.com/app-id",
    );
  });
});

describe("loadGoogleIdentityServices", () => {
  // The module caches the in-flight script promise at module scope, so each
  // test needs a fresh module instance rather than a leaked resolved promise.
  beforeEach(async () => {
    vi.resetModules();
    document.head.innerHTML = "";
    delete (window as unknown as { google?: unknown }).google;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves immediately when the SDK is already present", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");
    (window as unknown as { google: unknown }).google = {
      accounts: { id: {} },
    };
    await expect(loadGoogleIdentityServices()).resolves.toBeUndefined();
  });

  it("injects the SDK script once and resolves when it loads", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");
    const promise = loadGoogleIdentityServices();

    const scripts = document.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain("accounts.google.com/gsi/client");

    // A second call reuses the in-flight script rather than injecting another.
    void loadGoogleIdentityServices();
    expect(document.querySelectorAll("script")).toHaveLength(1);

    scripts[0].dispatchEvent(new Event("load"));
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the SDK script fails to load", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");
    const promise = loadGoogleIdentityServices();
    const script = document.querySelector("script")!;
    script.dispatchEvent(new Event("error"));
    await expect(promise).rejects.toThrow(
      /Gagal memuat Google Identity Services/,
    );
  });
});

describe("loginWithGoogle", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.head.innerHTML = "";
    delete (window as unknown as { google?: unknown }).google;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves with the credential Google hands back", async () => {
    const { loginWithGoogle } = await import("./sso");
    let captured: ((response: { credential?: string }) => void) | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: {
            callback: (r: { credential?: string }) => void;
          }) => {
            captured = config.callback;
          },
          prompt: () => captured?.({ credential: "google-id-token" }),
        },
      },
    };

    await expect(loginWithGoogle("client-id")).resolves.toEqual({
      idToken: "google-id-token",
    });
  });

  it("rejects when Google returns no credential", async () => {
    const { loginWithGoogle } = await import("./sso");
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: {
            callback: (r: { credential?: string }) => void;
          }) => {
            // Simulate Google completing the prompt without a credential.
            config.callback({});
          },
          prompt: () => {},
        },
      },
    };

    await expect(loginWithGoogle("client-id")).rejects.toThrow(
      /tidak mengembalikan id_token/,
    );
  });
});
