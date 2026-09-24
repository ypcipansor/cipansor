import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  microsoftAuthority,
  microsoftTenantId,
  microsoftAuthorityTenant,
} from "./sso";

const { mockInitialize, mockLoginPopup, mockPcaCtor } = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
  mockLoginPopup: vi.fn(),
  mockPcaCtor: vi.fn(),
}));

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

describe("microsoftTenantId", () => {
  const CLIENT_ID = "app-id.tenant-id";

  it("passes the multi-tenant sentinel `common` through verbatim (BUG 4)", () => {
    // Folding `common` into the app-id fallback pointed MSAL at a directory
    // that does not exist, so every multi-tenant sign-in failed.
    expect(microsoftTenantId(CLIENT_ID, "common")).toBe("common");
    expect(
      microsoftAuthorityTenant(
        `https://login.microsoftonline.com/${microsoftTenantId(CLIENT_ID, "common")}`,
      ),
    ).toBe("common");
  });

  it("passes `organizations` and `consumers` through verbatim (BUG 4)", () => {
    expect(microsoftTenantId(CLIENT_ID, "organizations")).toBe("organizations");
    expect(microsoftTenantId(CLIENT_ID, "consumers")).toBe("consumers");
  });

  it("honors a specific tenant GUID as-is (BUG 4)", () => {
    const guid = "11111111-2222-3333-4444-555555555555";
    expect(microsoftTenantId(CLIENT_ID, guid)).toBe(guid);
  });

  it("honors a specific tenant domain as-is (BUG 4)", () => {
    expect(microsoftTenantId(CLIENT_ID, "cipansor.onmicrosoft.com")).toBe(
      "cipansor.onmicrosoft.com",
    );
  });

  it("falls back to the client id's app-id segment when no tenant is configured", () => {
    expect(microsoftTenantId("app-id.tenant-id")).toBe("app-id");
    expect(microsoftTenantId("app-id.tenant-id", null)).toBe("app-id");
    expect(microsoftTenantId("11111111-2222-3333-4444-555555555555")).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
  });
});

describe("microsoftAuthorityTenant", () => {
  it("extracts the trailing authority segment", () => {
    expect(
      microsoftAuthorityTenant("https://login.microsoftonline.com/common"),
    ).toBe("common");
    expect(
      microsoftAuthorityTenant("https://login.microsoftonline.com/abcdef"),
    ).toBe("abcdef");
  });
});

describe("loginWithMicrosoft", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockInitialize.mockReset().mockResolvedValue(undefined);
    mockLoginPopup.mockReset().mockResolvedValue({ idToken: "ms-id-token" });
    mockPcaCtor.mockReset().mockImplementation(function (this: unknown) {
      return { initialize: mockInitialize, loginPopup: mockLoginPopup };
    });
    vi.doMock("@azure/msal-browser", () => ({
      PublicClientApplication: mockPcaCtor,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("targets the multi-tenant `common` authority, not the appId (BUG 4)", async () => {
    const { loginWithMicrosoft } = await import("./sso");

    await loginWithMicrosoft({
      clientId: "app-id.tenant-id",
      tenantId: "common",
    });

    expect(mockPcaCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          authority: "https://login.microsoftonline.com/common",
        }),
      }),
    );
    expect(mockLoginPopup).toHaveBeenCalled();
  });

  it("targets a specific tenant GUID when one is configured (BUG 4)", async () => {
    const { loginWithMicrosoft } = await import("./sso");
    const guid = "11111111-2222-3333-4444-555555555555";

    await loginWithMicrosoft({ clientId: "app-id.tenant-id", tenantId: guid });

    expect(mockPcaCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          authority: `https://login.microsoftonline.com/${guid}`,
        }),
      }),
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

  it("retries cleanly after a failed load: new element, no hang (BUG 2)", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");

    // 1. The first load fails.
    const first = loadGoogleIdentityServices();
    const firstScript = document.querySelector("script")!;
    firstScript.dispatchEvent(new Event("error"));

    // 2. The first promise rejects.
    await expect(first).rejects.toThrow(
      /Gagal memuat Google Identity Services/,
    );

    // The failed element must be gone, so a retry cannot attach to an event
    // that already fired and hang forever.
    expect(document.querySelector("script")).toBeNull();

    // 3. A second call inserts a NEW script element.
    const second = loadGoogleIdentityServices();
    const secondScript = document.querySelector("script")!;
    expect(secondScript).not.toBe(firstScript);
    expect(secondScript.isConnected).toBe(true);

    // 4. A `load` on the new script settles the second promise.
    secondScript.dispatchEvent(new Event("load"));
    await expect(second).resolves.toBeUndefined();
  });

  it("resolves a retry even when a stale failed script element is left in the DOM (BUG 2)", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");

    // Simulate a script injected by another origin/path that has ALREADY failed
    // and whose `load`/`error` will never fire again. Attaching a listener to it
    // would hang the retry; the loader must replace it.
    const stale = document.createElement("script");
    stale.src = "https://accounts.google.com/gsi/client";
    document.head.appendChild(stale);

    const promise = loadGoogleIdentityServices();
    const script = document.querySelector("script")!;
    expect(script).not.toBe(stale);
    script.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toBeUndefined();
  });

  it("does not remove a script it is not managing once the SDK is present", async () => {
    const { loadGoogleIdentityServices } = await import("./sso");
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    document.head.appendChild(script);
    (window as unknown as { google: unknown }).google = {
      accounts: { id: {} },
    };

    await expect(loadGoogleIdentityServices()).resolves.toBeUndefined();
    expect(script.isConnected).toBe(true);
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

  it("rejects when the user dismisses the prompt (BUG 9)", async () => {
    const { loginWithGoogle } = await import("./sso");
    let listener:
      | ((n: {
          isDismissedMoment: () => boolean;
          isSkippedMoment: () => boolean;
          isNotDisplayedMoment: () => boolean;
        }) => void)
      | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: () => {},
          // GIS reports a dismissal through the moment notification; without
          // this the promise never settles and the button looks stuck.
          prompt: (cb: typeof listener) => {
            listener = cb;
            cb?.({
              isDismissedMoment: () => true,
              isSkippedMoment: () => false,
              isNotDisplayedMoment: () => false,
            });
          },
        },
      },
    };

    await expect(loginWithGoogle("client-id")).rejects.toThrow(/dibatalkan/);
  });

  it("rejects with a suppression-specific message when the prompt is not displayed (BUG 9, FLAG 6)", async () => {
    const { loginWithGoogle } = await import("./sso");
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: () => {},
          prompt: (
            cb: (n: {
              isDismissedMoment: () => boolean;
              isSkippedMoment: () => boolean;
              isNotDisplayedMoment: () => boolean;
            }) => void,
          ) =>
            cb({
              isDismissedMoment: () => false,
              isSkippedMoment: () => false,
              isNotDisplayedMoment: () => true,
            }),
        },
      },
    };

    // A suppressed prompt is not a dismissal: the caller needs a message that
    // says the browser blocked it and points at the fallback button, not a bare
    // "dibatalkan" that reads as if the user cancelled.
    await expect(loginWithGoogle("client-id")).rejects.toThrow(
      /tidak dapat ditampilkan/,
    );
  });

  it("times out when GIS never reports anything (BUG 9)", async () => {
    vi.useFakeTimers();
    try {
      const { loginWithGoogle } = await import("./sso");
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: () => {},
            prompt: () => {},
          },
        },
      };

      const promise = loginWithGoogle("client-id", 5_000);
      const assertion = expect(promise).rejects.toThrow(
        /Waktu masuk Google habis/,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
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

describe("loginWithGoogleButton (FLAG 6 fallback)", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.head.innerHTML = "";
    delete (window as unknown as { google?: unknown }).google;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders GIS's explicit button into the supplied container", async () => {
    const { loginWithGoogleButton } = await import("./sso");
    const container = document.createElement("div");
    document.body.appendChild(container);

    let captured: ((response: { credential?: string }) => void) | undefined;
    const renderButton = vi.fn((parent: HTMLElement) => {
      const button = document.createElement("div");
      button.textContent = "Sign in with Google";
      parent.appendChild(button);
    });
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: {
            callback: (r: { credential?: string }) => void;
          }) => {
            captured = config.callback;
          },
          prompt: () => {},
          renderButton,
        },
      },
    };

    const promise = loginWithGoogleButton("client-id", container);
    // The SDK load resolves on a microtask, so let the flow reach renderButton.
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(renderButton).toHaveBeenCalledWith(container, expect.any(Object));
    captured?.({ credential: "google-id-token" });

    await expect(promise).resolves.toEqual({ idToken: "google-id-token" });
    // The container is cleared once the flow settles, so a retry starts clean.
    expect(container.childElementCount).toBe(0);
  });

  it("rejects when GIS returns no credential from the rendered button", async () => {
    const { loginWithGoogleButton } = await import("./sso");
    const container = document.createElement("div");

    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: {
            callback: (r: { credential?: string }) => void;
          }) => {
            config.callback({});
          },
          prompt: () => {},
          renderButton: () => {},
        },
      },
    };

    await expect(loginWithGoogleButton("client-id", container)).rejects.toThrow(
      /tidak mengembalikan id_token/,
    );
  });

  it("rejects when the GIS SDK is unavailable", async () => {
    const { loginWithGoogleButton } = await import("./sso");
    const container = document.createElement("div");

    // `loadGoogleIdentityServices` injects the script but never resolves; stub
    // the global away after injection to hit the guard.
    (window as unknown as { google: unknown }).google = undefined;

    const attempt = loginWithGoogleButton("client-id", container);
    const script = document.querySelector("script");
    script?.dispatchEvent(new Event("load"));

    await expect(attempt).rejects.toThrow(/tidak tersedia/);
  });

  // ── BUG 3: an idle fallback button must not expire before it is used ──

  it("keeps the rendered button alive while idle past the timeout (BUG 3)", async () => {
    vi.useFakeTimers();
    try {
      const { loginWithGoogleButton } = await import("./sso");
      const container = document.createElement("div");
      document.body.appendChild(container);
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: () => {},
            prompt: () => {},
            renderButton: (parent: HTMLElement) => {
              const button = document.createElement("button");
              button.textContent = "Sign in with Google";
              parent.appendChild(button);
            },
          },
        },
      };

      const promise = loginWithGoogleButton("client-id", container, 120_000);
      await vi.waitFor(() => expect(container.childElementCount).toBe(1));

      // Well past the old two-minute render timer. The button must still be
      // present and the promise must not have rejected.
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(container.childElementCount).toBe(1);

      let rejected: unknown;
      promise.catch((error) => {
        rejected = error;
      });
      await Promise.resolve();
      expect(rejected).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("arms the timeout once the button is clicked, bounding an in-flight sign-in (BUG 3)", async () => {
    vi.useFakeTimers();
    try {
      const { loginWithGoogleButton } = await import("./sso");
      const container = document.createElement("div");
      document.body.appendChild(container);
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: () => {},
            prompt: () => {},
            renderButton: (parent: HTMLElement) => {
              const button = document.createElement("button");
              button.textContent = "Sign in with Google";
              parent.appendChild(button);
            },
          },
        },
      };

      const promise = loginWithGoogleButton("client-id", container, 5_000);
      await vi.waitFor(() => expect(container.childElementCount).toBe(1));

      // Idle time does not count against the authentication.
      await vi.advanceTimersByTimeAsync(60_000);
      container.querySelector("button")!.click();

      const assertion = expect(promise).rejects.toThrow(
        /Waktu masuk Google habis/,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
      // The settled flow clears the container.
      expect(container.childElementCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
