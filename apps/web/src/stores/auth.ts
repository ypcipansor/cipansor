import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AxiosError } from "axios";
import { User, authApi, rolesApi, LoginRequest } from "@/lib/api";
import { SSOLoginRequest, LoginResponse } from "@cipansor/shared";
import {
  clearBearerTokenCookie,
  clearLegacyAuthStorageCookie,
  clearRoutingSessionOnServer,
  clearSessionCookies,
} from "@/lib/session-cookie";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresTwoFactor: boolean;
  requiresTwoFactorSetup: boolean;
  tempToken: string | null;

  login: (credentials: LoginRequest) => Promise<void>;
  ssoLogin: (data: SSOLoginRequest) => Promise<void>;
  verifyTwoFactor: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  switchRole: (roleAssignmentId: string) => Promise<void>;
  clearError: () => void;
  resetAuth: () => void;
}

// Storage for the persisted PROFILE. localStorage only.
//
// It used to ALSO mirror the payload into a `auth-storage` cookie so the Next
// Proxy could route on it — which made that cookie the page guard's source of
// truth. The cookie was client-writable, so any visitor could forge
// `isAuthenticated`/role and open restricted pages (SECURITY CRITICAL).
// Middleware now trusts only a server-signed, HttpOnly session cookie minted by
// `POST /api/session` (see `lib/session.ts`); the profile blob stays in
// localStorage for the app's own rendering and is never an authorization input.
const customStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(name);
  },
};

/** Shown when the server cannot mint the routing session after a login. */
const ROUTING_SESSION_ERROR =
  "Sesi masuk tidak dapat diselesaikan (cookie routing gagal dibuat). Silakan coba lagi.";

/**
 * Ask the server to mint (or, on logout, clear) the signed routing session.
 *
 * Resolves to whether the server confirmed the operation. Three details matter:
 *
 *  - `fetch()` does NOT reject on a non-2xx status, so the status is checked
 *    explicitly. A `500` from the mint endpoint (e.g. a missing signing secret)
 *    must never be mistaken for a created cookie.
 *  - The BODY is checked too, not just the status. `POST /api/session` answers
 *    `200 { session: false }` whenever it did NOT sign a cookie (no bearer, the
 *    API did not confirm the token, `{clear:true}`, or a missing secret). A 2xx
 *    alone therefore says nothing: treating it as success completed the login
 *    while no cookie existed, so the next navigation hit the Proxy with no
 *    session and bounced to `/login`. Only `session === true` is success on the
 *    mint path; a `DELETE` (logout) is a clear, where `session: false` is the
 *    expected, successful outcome.
 *  - A network failure, a non-JSON body, or a malformed payload resolves
 *    `false` instead of rejecting, so a caller can `await` it without risking
 *    an unhandled rejection.
 *
 * Await this before treating a login as navigable. The Next Proxy only sees the
 * session once this `POST` has committed its `Set-Cookie`; navigating first
 * races the write and the Proxy bounces the user back to `/login`.
 */
async function syncRoutingSession(clear = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const token = clear ? null : localStorage.getItem("accessToken");
  if (!clear && !token) return false;
  try {
    const response = await fetch("/api/session", {
      method: clear ? "DELETE" : "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return false;
    // A clear is confirmed by the status; a mint additionally requires the
    // server to say it actually issued a session. Read the body leniently —
    // a malformed/empty body is NOT a confirmed session.
    if (clear) return true;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return false;
    }
    const minted =
      typeof body === "object" &&
      body !== null &&
      (body as { session?: unknown }).session === true;
    if (!minted) return false;
    // The bearer may have been cleared while the mint was in flight — a logout
    // racing a mount-time refresh. Its `DELETE` can land before this response
    // commits its `Set-Cookie`, resurrecting a routing session on a browser that
    // just signed out. Re-check the token the cookie was minted from and, if it
    // is no longer the current bearer, clear the session again (fail closed)
    // rather than reporting a success that reopens a protected route.
    if (localStorage.getItem("accessToken") !== token) {
      await clearRoutingSessionOnServer().catch(() => undefined);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the routing session on every sign-out path (logout, reset, a rejected
 * session), awaiting the server so the `HttpOnly` cookie is actually removed.
 *
 * `cipansor-session` is `HttpOnly`, so client JavaScript cannot delete it — only
 * the server's `DELETE /api/session` can. Merely clearing localStorage left the
 * Proxy believing the visitor was still signed in and bouncing `/login` back to
 * a protected page until the cookie expired.
 *
 * Best-effort by design: it never rejects (so no unhandled rejection) and never
 * blocks the caller's local cleanup, which must run regardless. Callers that
 * need the outcome use {@link syncRoutingSession}.
 */
async function clearRoutingSession(): Promise<void> {
  if (typeof window !== "undefined") clearSessionCookies();
  await syncRoutingSession(true);
}

/**
 * Fail a login that could not establish its routing session.
 *
 * The API may have accepted the credentials, but without the signed cookie the
 * Proxy will not recognise the session, so the UI must NOT treat this as a
 * navigable success. Tokens/state are cleared so no half-login survives.
 */
function rejectRoutingSession(
  set: (partial: Partial<AuthState>) => void,
): never {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  clearSessionCookies();
  set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    requiresTwoFactor: false,
    requiresTwoFactorSetup: false,
    tempToken: null,
    error: ROUTING_SESSION_ERROR,
  });
  throw new Error(ROUTING_SESSION_ERROR);
}

/**
 * In-flight `/auth/me` request, shared by every caller.
 *
 * Two things ask for the user on a cold load: `onRehydrateStorage` below, and
 * `ProtectedRoute` when it mounts. Without this they each issue their own
 * request, doubling auth traffic on every page load — which matters because
 * the API rate-limits per IP and a pesantren shares one.
 */
let inFlightFetchUser: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      requiresTwoFactor: false,
      requiresTwoFactorSetup: false,
      tempToken: null,

      ssoLogin: async (data: SSOLoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.ssoLogin(data);
          const responseData = response.data.data;

          if (
            "requiresTwoFactor" in responseData &&
            responseData.requiresTwoFactor
          ) {
            set({
              requiresTwoFactor: true,
              tempToken: responseData.tempToken,
              isLoading: false,
            });
            return;
          }

          if (
            "requiresTwoFactorSetup" in responseData &&
            responseData.requiresTwoFactorSetup
          ) {
            set({
              requiresTwoFactorSetup: true,
              tempToken: responseData.tempToken,
              isLoading: false,
            });
            localStorage.setItem("accessToken", responseData.tempToken);
            return;
          }

          const { user, accessToken, refreshToken } =
            responseData as LoginResponse;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
            tempToken: null,
          });
          // The Proxy cannot see the session until the cookie is minted. Await
          // it so the caller navigates only after the server has confirmed,
          // instead of racing the write and bouncing off `/login`.
          if (!(await syncRoutingSession())) rejectRoutingSession(set);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "SSO Login failed";
          const axiosError = error as {
            response?: {
              data?: { error?: { message?: string }; message?: string };
            };
          };
          set({
            error:
              axiosError.response?.data?.error?.message ||
              axiosError.response?.data?.message ||
              message,
            isLoading: false,
          });
          throw error;
        }
      },

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(credentials);
          const data = response.data.data as any;

          if (data.requiresTwoFactor) {
            set({
              requiresTwoFactor: true,
              tempToken: data.tempToken,
              isLoading: false,
            });
            return;
          }

          if (data.requiresTwoFactorSetup) {
            set({
              requiresTwoFactorSetup: true,
              tempToken: data.tempToken,
              isLoading: false,
            });
            // We'll treat setup as a form of partial auth, but won't set isAuthenticated yet
            // The UI should redirect to setup page if this flag is true
            // We need to store tempToken to use it for enabling 2FA
            localStorage.setItem("accessToken", data.tempToken); // Use temp token as access token for setup
            return;
          }

          const { user, accessToken, refreshToken } = data;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);
          // Also set token in cookie for middleware

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
            tempToken: null,
          });
          if (!(await syncRoutingSession())) rejectRoutingSession(set);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Login failed";
          const axiosError = error as {
            response?: {
              data?: { error?: { message?: string }; message?: string };
            };
          };
          set({
            error:
              axiosError.response?.data?.error?.message ||
              axiosError.response?.data?.message ||
              message,
            isLoading: false,
          });
          throw error;
        }
      },

      verifyTwoFactor: async (token: string) => {
        set({ isLoading: true, error: null });
        try {
          // We need to send the token. Since tempToken might not be in headers if we didn't save it to localStorage yet?
          // Actually, for verifyLogin, we might need to manually pass Authorization header if not in localStorage.
          // But wait, my interceptor uses localStorage.

          // If we have tempToken in state, we should probably set it in localStorage before calling verify2FA?
          // Or verify2FA endpoint expects `token` in BODY (the OTP), but expects Bearer token (tempToken) in HEADER.

          const tempToken = get().tempToken;
          if (tempToken) {
            localStorage.setItem("accessToken", tempToken);
          }

          const response = await authApi.verify2FA({ token });
          const { user, accessToken, refreshToken } = response.data.data;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            tempToken: null,
          });
          if (!(await syncRoutingSession())) rejectRoutingSession(set);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "2FA Verification failed";
          const axiosError = error as {
            response?: {
              data?: { error?: { message?: string }; message?: string };
            };
          };
          set({
            error:
              axiosError.response?.data?.error?.message ||
              axiosError.response?.data?.message ||
              message,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Ignore logout errors
        } finally {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          // The routing cookie is `HttpOnly`, so only the server can delete it
          // — await the `DELETE` before declaring the logout done, or the Proxy
          // keeps treating the visitor as signed in.
          await clearRoutingSession();
          set({
            user: null,
            isAuthenticated: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
            tempToken: null,
          });
        }
      },

      fetchUser: async () => {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          // No bearer to authenticate with. If a server-signed routing cookie
          // survived (a cleared localStorage, a storage eviction, or a refresh
          // failure whose best-effort `DELETE` did not reach the server), the
          // Proxy would keep treating this visitor as signed in: `ProtectedRoute`
          // sends them to `/login`, the Proxy sees the stale cookie and bounces
          // them back — a redirect loop that only ends when the cookie expires.
          // Clearing the routing session here makes `/login` stick. Best-effort
          // and never rejecting, so it cannot block the local state update.
          await clearRoutingSession();
          set({ isAuthenticated: false, user: null });
          return;
        }
        if (inFlightFetchUser) return inFlightFetchUser;

        set({ isLoading: true });
        const run = async () => {
          try {
            const response = await authApi.me();
            set({
              user: response.data.data,
              isAuthenticated: true,
              isLoading: false,
            });
            // Finding C: `/auth/me` is the server's current view of the user,
            // and the only routine place a role revocation/change becomes
            // visible to the client. Re-mint the routing session from the
            // bearer so the Proxy stops routing off the role the previous
            // cookie carried — otherwise a revoked/reshuffled role kept its
            // page chrome and menu for up to the 24h cookie TTL. Best-effort:
            // a failed re-mint must NOT sign the user out (the bearer is still
            // valid and every API call re-authenticates from it), so the
            // outcome is deliberately ignored.
            void syncRoutingSession().catch(() => undefined);
          } catch (error: unknown) {
            const status = (error as AxiosError)?.response?.status;
            if (status === 401 || status === 403) {
              // Token genuinely rejected — clear the session. The routing
              // cookie is `HttpOnly`, so the client cannot remove it itself:
              // deleting only localStorage left the Proxy believing the visitor
              // was signed in and bouncing `/login` back to a protected page
              // until the cookie expired. Await the server-side deletion so the
              // guard and the token state agree.
              localStorage.removeItem("accessToken");
              localStorage.removeItem("refreshToken");
              await clearRoutingSession();
              set({ user: null, isAuthenticated: false, isLoading: false });
            } else {
              // Transient failure (network blip, timeout, 5xx). Do NOT log the
              // user out over it — keep the existing session and just stop
              // loading. Otherwise a single slow /auth/me (common on flaky
              // networks / loaded CI browsers) bounces an authenticated user
              // to /login mid-navigation.
              set({ isLoading: false });
            }
          }
        };

        inFlightFetchUser = run().finally(() => {
          inFlightFetchUser = null;
        });
        return inFlightFetchUser;
      },

      switchRole: async (roleAssignmentId: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await rolesApi.switchRole(roleAssignmentId);
          const { accessToken, refreshToken } = response.data.data;

          // Update tokens
          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);

          // Fetch updated user data
          const userResponse = await authApi.me();
          set({ user: userResponse.data.data, isLoading: false });

          // The Proxy routes on the signed `cipansor-session` payload, which
          // still carries the OLD role. Re-mint it from the new token BEFORE
          // reloading, or the reload lands on a page the stale role may not
          // open and the nav is wrong until the cookie expires.
          if (!(await syncRoutingSession())) {
            // Reloading now would serve the previous role's routing. The new
            // tokens are already stored, so leaving them would pair a new role
            // with a cookie that still names the old one — an inconsistent
            // half-switch. Roll the whole session back instead: clear the
            // tokens AND the routing cookie server-side, fail closed.
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            await clearRoutingSession();
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error:
                "Peran tidak dapat disinkronkan dengan sesi. Silakan masuk kembali.",
            });
            throw new Error("Failed to sync routing session after role switch");
          }

          // Reload page to refresh navigation and permissions
          window.location.reload();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Failed to switch role";
          const axiosError = error as {
            response?: {
              data?: { error?: { message?: string }; message?: string };
            };
          };
          set({
            error:
              axiosError.response?.data?.error?.message ||
              axiosError.response?.data?.message ||
              message,
            isLoading: false,
          });
          throw error;
        }
      },

      resetAuth: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        clearSessionCookies();
        // The HttpOnly routing cookie needs the server round-trip; fire it and
        // let it settle. Not awaited because this action is synchronous, but
        // the promise is handled so it can never be an unhandled rejection.
        void clearRoutingSession();
        set({
          user: null,
          isAuthenticated: false,
          requiresTwoFactor: false,
          requiresTwoFactorSetup: false,
          tempToken: null,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => customStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration, trigger fetchUser if token exists
        if (state && typeof window !== "undefined") {
          // Finding F: a session cookie is written once and outlives the page
          // that set it. An earlier build mirrored the bearer into
          // `document.cookie`, so a returning visitor still carries the exposed
          // credential even after the write site is gone. Clear it at bootstrap,
          // not only at logout.
          clearBearerTokenCookie();
          // Remove a legacy `auth-storage` cookie an earlier build wrote. It is
          // no longer trusted by middleware, but leaving it lets an out-of-date
          // build keep reading a forgeable value.
          clearLegacyAuthStorageCookie();
          const token = localStorage.getItem("accessToken");
          if (token) {
            // Delay fetchUser to next tick to ensure store is ready
            setTimeout(() => state.fetchUser(), 0);
          }
        }
      },
    },
  ),
);
