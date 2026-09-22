import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AxiosError } from "axios";
import { User, authApi, rolesApi, LoginRequest } from "@/lib/api";
import { SSOLoginRequest, LoginResponse } from "@cipansor/shared";
import {
  clearBearerTokenCookie,
  clearLegacyAuthStorageCookie,
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

/**
 * Ask the server to mint (or, on logout, clear) the signed routing session.
 * Fire-and-forget and best-effort: the store already holds the session, and a
 * failed sync only means the Proxy guard will not recognise it — the API still
 * authenticates every real call.
 */
function syncRoutingSession(clear = false) {
  if (typeof window === "undefined") return;
  const token = clear ? null : localStorage.getItem("accessToken");
  if (!clear && !token) return;
  fetch("/api/session", {
    method: clear ? "DELETE" : "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
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

          if ('requiresTwoFactor' in responseData && responseData.requiresTwoFactor) {
            set({
              requiresTwoFactor: true,
              tempToken: responseData.tempToken,
              isLoading: false,
            });
            return;
          }

          if ('requiresTwoFactorSetup' in responseData && responseData.requiresTwoFactorSetup) {
            set({
              requiresTwoFactorSetup: true,
              tempToken: responseData.tempToken,
              isLoading: false,
            });
            localStorage.setItem("accessToken", responseData.tempToken);
            return;
          }

          const { user, accessToken, refreshToken } = responseData as LoginResponse;

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
          syncRoutingSession();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "SSO Login failed";
          const axiosError = error as {
            response?: { data?: { error?: { message?: string }; message?: string } };
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
          syncRoutingSession();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Login failed";
          const axiosError = error as {
            response?: { data?: { error?: { message?: string }; message?: string } };
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
          syncRoutingSession();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "2FA Verification failed";
          const axiosError = error as {
            response?: { data?: { error?: { message?: string }; message?: string } };
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
          // Also remove from cookies
          clearSessionCookies();
          syncRoutingSession(true);
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
          } catch (error: unknown) {
            const status = (error as AxiosError)?.response?.status;
            if (status === 401 || status === 403) {
              // Token genuinely rejected — clear the session.
              localStorage.removeItem("accessToken");
              localStorage.removeItem("refreshToken");
              clearSessionCookies();
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

          // Reload page to refresh navigation and permissions
          window.location.reload();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Failed to switch role";
          const axiosError = error as {
            response?: { data?: { error?: { message?: string }; message?: string } };
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
        syncRoutingSession(true);
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
