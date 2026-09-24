import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Reviewer finding 4.
 *
 * `switchRole` used to fetch `/auth/me` and reload inside the same `try` as the
 * switch call. When the switch succeeded but `/auth/me` failed (a transient
 * 5xx, a raced cookie), the flow fell into `catch`, set an error, rethrew, and
 * never reloaded — so the routing cookies already carried the *new* role while
 * the UI kept rendering the old one from the store. A reload is what rebuilds
 * the shell from the cookie, so it must run whenever the switch itself
 * succeeded.
 */
const switchRoleMock = vi.fn();
const meMock = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    me: (...args: unknown[]) => meMock(...args),
  },
  rolesApi: {
    switchRole: (...args: unknown[]) => switchRoleMock(...args),
  },
}));

import { useAuthStore } from "./auth";

describe("auth store — switchRole survives a failed /auth/me", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    reload = vi.fn();
    // jsdom's location.reload is not implemented; replace it so the call is
    // observable instead of a "Not implemented" error.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads and reports no error when the switch succeeds but /auth/me fails", async () => {
    switchRoleMock.mockResolvedValueOnce({});
    meMock.mockRejectedValueOnce(new Error("network down"));

    await expect(
      useAuthStore.getState().switchRole("role-assignment-1"),
    ).resolves.toBeUndefined();

    expect(switchRoleMock).toHaveBeenCalledWith("role-assignment-1");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it("reports an error, does not reload, and rethrows when the switch itself fails", async () => {
    switchRoleMock.mockRejectedValueOnce({
      response: { data: { error: { message: "Peran tidak dapat diganti" } } },
    });
    meMock.mockResolvedValue({ data: { data: { id: "u1" } } });

    await expect(
      useAuthStore.getState().switchRole("role-assignment-1"),
    ).rejects.toBeDefined();

    expect(reload).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBe("Peran tidak dapat diganti");
  });
});
