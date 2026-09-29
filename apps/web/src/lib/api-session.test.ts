/**
 * What the API client does when a call answers 401 and the refresh fails.
 *
 * Two regressions this pins, both invisible to a signed-in e2e run:
 * - an anonymous visitor on a public page (the SPMB page reads /units) was
 *   sent to the staff login screen, because the client no longer checked that
 *   there had been a session to lose;
 * - the check must be read before the refresh, since a refused refresh clears
 *   the session cookies in its own response.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { api } from "./api";
import { dropLegacySessionTokens } from "@/stores/auth";

const CSRF = "cipansor_csrf";

function failWith(status: number, config: InternalAxiosRequestConfig) {
  return new AxiosError(`HTTP ${status}`, "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data: {},
  });
}

let location: { pathname: string; href: string };
const originalLocation = window.location;

beforeEach(() => {
  // Every protected call answers 401.
  api.defaults.adapter = (config) => Promise.reject(failWith(401, config));
  location = { pathname: "/dashboard", href: "http://localhost/dashboard" };
  Object.defineProperty(window, "location", {
    value: location,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = `${CSRF}=; path=/; max-age=0`;
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

/** The refresh answers `status` and, like the API, clears the CSRF cookie. */
function refreshFails(status: number) {
  return vi.spyOn(axios, "post").mockImplementation(async (url) => {
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    document.cookie = `${CSRF}=; path=/; max-age=0`;
    throw failWith(status, { headers: {} } as InternalAxiosRequestConfig);
  });
}

describe("a 401 whose refresh fails", () => {
  it("leaves an anonymous visitor where they are", async () => {
    location.pathname = "/public/spmb";
    location.href = "http://localhost/public/spmb";
    const refresh = refreshFails(401);

    await expect(api.get("/units")).rejects.toBeInstanceOf(AxiosError);
    expect(refresh).toHaveBeenCalledOnce();
    expect(location.href).toBe("http://localhost/public/spmb");
  });

  it("sends a signed-in user to the login, even though the refresh cleared the cookie", async () => {
    document.cookie = `${CSRF}=abc; path=/`;
    refreshFails(401);

    await expect(api.get("/auth/me")).rejects.toBeInstanceOf(AxiosError);
    expect(location.href).toBe("/login");
  });

  it("keeps the session when the refresh failed for a reason that says nothing about it", async () => {
    document.cookie = `${CSRF}=abc; path=/`;
    vi.spyOn(axios, "post").mockRejectedValue(
      failWith(429, { headers: {} } as InternalAxiosRequestConfig),
    );

    await expect(api.get("/auth/me")).rejects.toBeInstanceOf(AxiosError);
    expect(location.href).toBe("http://localhost/dashboard");
  });
});

describe("dropLegacySessionTokens", () => {
  it("removes the tokens the old client kept where script could read them", () => {
    localStorage.setItem("accessToken", "old-access");
    localStorage.setItem("refreshToken", "old-refresh");
    localStorage.setItem("auth-storage", '{"state":{}}');
    document.cookie = "accessToken=old-access; path=/";

    dropLegacySessionTokens();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(document.cookie).not.toMatch(/accessToken=/);
    // The cached user is not a credential and stays.
    expect(localStorage.getItem("auth-storage")).toBe('{"state":{}}');
  });
});
