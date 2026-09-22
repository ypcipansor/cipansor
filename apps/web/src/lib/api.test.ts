import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Finding 2: `refreshAccessToken()` rotated the bearer but left the
 * server-signed `cipansor-session` routing cookie as-is. If the refresh yielded
 * a different primary role/RoleCode, the Next Proxy kept routing off the old
 * cookie until it expired. The refresh must re-mint the routing session, and it
 * must do so WITHOUT going through the axios instance — a 401 there would call
 * `refreshAccessToken()` again and recurse.
 */
const { axiosPostMock, apiInstance } = vi.hoisted(() => {
  const requestHandlers: unknown[] = [];
  const responseHandlers: unknown[] = [];
  const instance: any = vi.fn();
  instance.defaults = {};
  instance.interceptors = {
    request: { use: (fn: unknown) => requestHandlers.push(fn) },
    response: {
      use: (a: unknown, b: unknown) => responseHandlers.push([a, b]),
    },
  };
  instance.__requestHandlers = requestHandlers;
  instance.__responseHandlers = responseHandlers;
  return {
    axiosPostMock: vi.fn(),
    apiInstance: instance,
  };
});

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => apiInstance),
    post: axiosPostMock,
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { refreshAccessToken } from "./api";

function mockSessionFetch(result: {
  ok?: boolean;
  body?: unknown;
  throw?: boolean;
}) {
  const fetchMock = vi.fn(async () => {
    if (result.throw) throw new Error("network");
    return {
      ok: result.ok ?? true,
      json: async () => result.body,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("refreshAccessToken routing-session remint (finding 2)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("refreshToken", "refresh-old");
    localStorage.setItem("accessToken", "access-old");
    axiosPostMock.mockReset();
    (apiInstance as any).mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("re-mints the routing session with the NEW bearer after a successful refresh", async () => {
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    const fetchMock = mockSessionFetch({ body: { session: true } });

    const token = await refreshAccessToken();

    expect(token).toBe("access-new");
    expect(localStorage.getItem("accessToken")).toBe("access-new");
    expect(localStorage.getItem("refreshToken")).toBe("refresh-new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/session");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer access-new",
    );
  });

  it("uses fetch, NOT the axios instance, so the remint cannot recurse", async () => {
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    mockSessionFetch({ body: { session: true } });

    await refreshAccessToken();

    // The instance is the thing whose 401 interceptor would refresh again.
    expect(apiInstance).not.toHaveBeenCalled();
  });

  it("rejects (fail-closed) when the remint returns session:false", async () => {
    // 200 { session:false } means the server signed NO cookie. A new bearer
    // beside a stale routing cookie must not be reported as success.
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    mockSessionFetch({ ok: true, body: { session: false } });

    await expect(refreshAccessToken()).rejects.toThrow(/re-minted/i);
  });

  it("rejects (fail-closed) when the remint endpoint errors", async () => {
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    mockSessionFetch({ ok: false, body: { session: false } });

    await expect(refreshAccessToken()).rejects.toThrow(/re-minted/i);
  });

  it("rejects (fail-closed) on a network failure with no unhandled rejection", async () => {
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    mockSessionFetch({ throw: true });

    await expect(refreshAccessToken()).rejects.toThrow(/re-minted/i);
  });

  it("keeps single-flight semantics: concurrent callers refresh and remint once", async () => {
    axiosPostMock.mockResolvedValue({
      data: {
        data: { accessToken: "access-new", refreshToken: "refresh-new" },
      },
    });
    const fetchMock = mockSessionFetch({ body: { session: true } });

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(a).toBe("access-new");
    expect(b).toBe("access-new");
    expect(c).toBe("access-new");
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws NoSessionError and never calls the API when there is no refresh token", async () => {
    localStorage.removeItem("refreshToken");
    const fetchMock = mockSessionFetch({ body: { session: true } });

    await expect(refreshAccessToken()).rejects.toThrow(
      /No session to refresh/i,
    );
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a later refresh after a remint failure (single-flight is released)", async () => {
    axiosPostMock
      .mockResolvedValueOnce({
        data: { data: { accessToken: "access-1", refreshToken: "refresh-1" } },
      })
      .mockResolvedValueOnce({
        data: { data: { accessToken: "access-2", refreshToken: "refresh-2" } },
      });

    mockSessionFetch({ body: { session: false } });
    await expect(refreshAccessToken()).rejects.toThrow(/re-minted/i);

    mockSessionFetch({ body: { session: true } });
    await expect(refreshAccessToken()).resolves.toBe("access-2");
    expect(axiosPostMock).toHaveBeenCalledTimes(2);
  });
});
