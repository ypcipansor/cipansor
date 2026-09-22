import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Routing-session lifecycle in the auth store.
 *
 * Three defects are pinned here:
 *
 *  1. Rejected sessions kept routing access. `cipansor-session` is `HttpOnly`,
 *     so the client cannot delete it — only the server's `DELETE /api/session`
 *     can. A 401/403 must therefore await that call, while a transient
 *     network/5xx failure must NOT tear the session down.
 *  2. Login navigation raced session creation. `login`/`ssoLogin`/
 *     `verifyTwoFactor` must not resolve until `POST /api/session` confirms the
 *     cookie, and a failed mint must fail the login rather than leave a
 *     half-login.
 *  3. A role switch kept the stale routing role because it reloaded before
 *     re-minting the cookie. The new token must reach `/api/session`, and the
 *     reload must happen only after the mint succeeds.
 */

const {
  authApiMock,
  rolesApiMock,
  clearSessionCookiesMock,
  clearBearerTokenCookieMock,
  clearLegacyAuthStorageCookieMock,
} = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    ssoLogin: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    verify2FA: vi.fn(),
  },
  rolesApiMock: { switchRole: vi.fn() },
  clearSessionCookiesMock: vi.fn(),
  clearBearerTokenCookieMock: vi.fn(),
  clearLegacyAuthStorageCookieMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  authApi: authApiMock,
  rolesApi: rolesApiMock,
}));

vi.mock("@/lib/session-cookie", () => ({
  clearSessionCookies: clearSessionCookiesMock,
  clearBearerTokenCookie: clearBearerTokenCookieMock,
  clearLegacyAuthStorageCookie: clearLegacyAuthStorageCookieMock,
}));

import { useAuthStore } from "@/stores/auth";

const USER = {
  id: "user-1",
  email: "guru@cipansor.or.id",
  name: "Guru",
  role: "TEACHER",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as never;

const LOGIN_RESPONSE = {
  data: { data: { user: USER, accessToken: "new-access", refreshToken: "new-refresh" } },
};

/** A response whose `ok` mirrors its status. */
function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let reloadMock: ReturnType<typeof vi.fn>;

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    requiresTwoFactor: false,
    requiresTwoFactorSetup: false,
    tempToken: null,
  });
}

/** A deferred promise so a test can hold a `/api/session` response open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetStore();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no navigation; `reload` must be a spy so a role switch can be
  // observed without throwing "not implemented".
  reloadMock = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadMock },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUser — rejected sessions must clear the HttpOnly cookie server-side", () => {
  it("awaits DELETE /api/session on 401 and clears local state", async () => {
    localStorage.setItem("accessToken", "stale");
    authApiMock.me.mockRejectedValue({ response: { status: 401 } });
    fetchMock.mockResolvedValue(jsonResponse(200));

    await useAuthStore.getState().fetchUser();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/session");
    expect(init.method).toBe("DELETE");
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(clearSessionCookiesMock).toHaveBeenCalled();
  });

  it("awaits DELETE /api/session on 403", async () => {
    localStorage.setItem("accessToken", "stale");
    authApiMock.me.mockRejectedValue({ response: { status: 403 } });
    fetchMock.mockResolvedValue(jsonResponse(200));

    await useAuthStore.getState().fetchUser();

    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("does NOT delete the session on a network/5xx failure", async () => {
    localStorage.setItem("accessToken", "still-good");
    authApiMock.me.mockRejectedValue({ response: { status: 503 } });
    fetchMock.mockResolvedValue(jsonResponse(200));

    await useAuthStore.getState().fetchUser();

    // No server-side session deletion, and the token survives.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("accessToken")).toBe("still-good");
  });

  it("still clears local state on 401 when DELETE /api/session fails (no unhandled rejection)", async () => {
    localStorage.setItem("accessToken", "stale");
    authApiMock.me.mockRejectedValue({ response: { status: 401 } });
    fetchMock.mockRejectedValue(new Error("offline"));

    // Must resolve, not reject: a failed server-side delete cannot block the
    // caller's local cleanup.
    await expect(useAuthStore.getState().fetchUser()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(clearSessionCookiesMock).toHaveBeenCalled();
  });

  it("does NOT delete the session when the request never reached the server", async () => {
    localStorage.setItem("accessToken", "still-good");
    authApiMock.me.mockRejectedValue(new Error("Network Error"));

    await useAuthStore.getState().fetchUser();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("accessToken")).toBe("still-good");
  });
});

describe("login — navigation must not race session creation", () => {
  it("does not resolve until POST /api/session resolves", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    const gate = deferred<Response>();
    fetchMock.mockReturnValue(gate.promise);

    let settled = false;
    const loginPromise = useAuthStore.getState().login({ email: "x", password: "y" }).then(() => {
      settled = true;
    });

    // Give the microtask queue a chance to run everything except the held
    // `/api/session` response.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "POST" }));

    gate.resolve(jsonResponse(200, { session: true }));
    await loginPromise;
    expect(settled).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("sends the freshly issued bearer to /api/session", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue(jsonResponse(200, { session: true }));

    await useAuthStore.getState().login({ email: "x", password: "y" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Bearer new-access");
  });

  it("fails the login and clears partial state when the mint returns non-2xx", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue(jsonResponse(500, { session: false }));

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).rejects.toThrow();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeTruthy();
    // No half-login: the tokens are gone too.
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });

  it("fails the login when the mint request rejects (network)", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("accessToken")).toBeNull();
  });

  it("fails the login on a 200 { session: false } (no cookie was minted)", async () => {
    // The mint endpoint answers `200 {session:false}` whenever it did NOT sign
    // a cookie. Reading only `response.ok` treated that as a completed login,
    // so the user was "authenticated locally" while the Proxy had no session
    // and every navigation bounced to /login. It must fail closed.
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue(jsonResponse(200, { session: false }));

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).rejects.toThrow();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeTruthy();
    // No half-login: the tokens are gone so the session cannot be routed but
    // also cannot be mistaken for signed in.
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });

  it("fails the login on a 200 malformed / non-JSON body", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as unknown as Response);

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("accessToken")).toBeNull();
  });

  it("fails the login on a 200 body that is not an object", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue(jsonResponse(200, "ok"));

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("completes the login only on a 200 { session: true }", async () => {
    authApiMock.login.mockResolvedValue(LOGIN_RESPONSE);
    fetchMock.mockResolvedValue(jsonResponse(200, { session: true }));

    await expect(
      useAuthStore.getState().login({ email: "x", password: "y" })
    ).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(USER);
    expect(localStorage.getItem("accessToken")).toBe("new-access");
  });
});

describe("ssoLogin / verifyTwoFactor — same awaited session contract", () => {
  it("ssoLogin waits for /api/session and sends its token", async () => {
    authApiMock.ssoLogin.mockResolvedValue({
      data: {
        data: { user: USER, accessToken: "sso-access", refreshToken: "sso-refresh" },
      },
    });
    const gate = deferred<Response>();
    fetchMock.mockReturnValue(gate.promise);

    let settled = false;
    const p = useAuthStore.getState().ssoLogin({ provider: "google", idToken: "id" }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    gate.resolve(jsonResponse(200, { session: true }));
    await p;
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer sso-access");
  });

  it("verifyTwoFactor waits for /api/session and fails hard if the mint fails", async () => {
    useAuthStore.setState({ tempToken: "temp" });
    authApiMock.verify2FA.mockResolvedValue({
      data: { data: { user: USER, accessToken: "2fa-access", refreshToken: "2fa-refresh" } },
    });
    fetchMock.mockResolvedValue(jsonResponse(500, { session: false }));

    await expect(useAuthStore.getState().verifyTwoFactor("123456")).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe("switchRole — routing role must be re-minted before reload", () => {
  it("POSTs the NEW token to /api/session, then reloads only after it succeeds", async () => {
    rolesApiMock.switchRole.mockResolvedValue({
      data: { data: { accessToken: "role-access", refreshToken: "role-refresh" } },
    });
    authApiMock.me.mockResolvedValue({ data: { data: USER } });

    const gate = deferred<Response>();
    fetchMock.mockReturnValue(gate.promise);

    let settled = false;
    const p = useAuthStore.getState().switchRole("assign-1").then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // The mint is in flight: no reload yet.
    expect(reloadMock).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    gate.resolve(jsonResponse(200, { session: true }));
    await p;

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer role-access");
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT reload when the routing-session mint fails, and fails closed", async () => {
    rolesApiMock.switchRole.mockResolvedValue({
      data: { data: { accessToken: "role-access", refreshToken: "role-refresh" } },
    });
    authApiMock.me.mockResolvedValue({ data: { data: USER } });
    fetchMock.mockResolvedValue(jsonResponse(500, { session: false }));

    await expect(useAuthStore.getState().switchRole("assign-1")).rejects.toThrow();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBeTruthy();
    // Inconsistent half-switch avoided: the new tokens are gone and the user is
    // signed out rather than left on a stale routing role.
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
