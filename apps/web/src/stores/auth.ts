import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AxiosError } from "axios";
import { User, authApi, rolesApi, LoginRequest } from "@/lib/api";

/**
 * Auth state.
 *
 * Access and refresh tokens live ONLY in server-issued `HttpOnly` cookies. They
 * are never written to `localStorage` and never to `document.cookie` — a cookie
 * written from JavaScript can never be `HttpOnly`, so any script on the origin
 * could read a 30-day refresh token and replay it. The API sets the cookies on
 * login / refresh / 2FA / role-switch; the browser only ever holds the user
 * object (not a credential) for rendering.
 */

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresTwoFactor: boolean;
  requiresTwoFactorSetup: boolean;
  tempToken: string | null;

  login: (credentials: LoginRequest) => Promise<void>;
  verifyTwoFactor: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  switchRole: (roleAssignmentId: string) => Promise<void>;
  clearError: () => void;
  resetAuth: () => void;
}

/**
 * The user object is persisted under the `auth-storage` key so a reload can
 * paint the shell before `/auth/me` answers. It is explicitly NOT a credential:
 * every request is authenticated by the `HttpOnly` cookie the browser attaches,
 * and a tampered `user` blob only changes what the UI claims, never what the
 * API allows.
 */
const userOnlyStorage = {
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

/** Best-effort removal of the pre-migration client-written credentials. */
function purgeLegacyClientSecrets() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("token");
  // Non-HttpOnly cookies written by the old store. Expiring them is safe: the
  // authoritative session cookies are `access_token` / `refresh_token`.
  document.cookie = "accessToken=; path=/; max-age=0";
  document.cookie = "auth-storage=; path=/; max-age=0";
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
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      requiresTwoFactor: false,
      requiresTwoFactorSetup: false,
      tempToken: null,

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(credentials);
          const data = response.data.data as {
            requiresTwoFactor?: boolean;
            requiresTwoFactorSetup?: boolean;
            user?: User;
          };

          if (data.requiresTwoFactor) {
            set({ requiresTwoFactor: true, isLoading: false });
            return;
          }

          if (data.requiresTwoFactorSetup) {
            // The API set the short-lived 2FA cookie; nothing is held here.
            set({ requiresTwoFactorSetup: true, isLoading: false });
            return;
          }

          set({
            user: data.user ?? null,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
            tempToken: null,
          });
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
          // The temporary token travels in the `HttpOnly` 2FA cookie the API
          // set at login; the OTP goes in the body.
          const response = await authApi.verify2FA({ token });
          const { user } = response.data.data;

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            tempToken: null,
          });
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
          // The API revokes the refresh token (read from its cookie) and clears
          // every session cookie.
          await authApi.logout();
        } catch {
          // Ignore logout errors
        } finally {
          purgeLegacyClientSecrets();
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
              // Session genuinely rejected (no/expired cookie) — clear it.
              purgeLegacyClientSecrets();
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
          // The API rotates the role and sets fresh cookies itself.
          await rolesApi.switchRole(roleAssignmentId);

          // Fetch updated user data
          const userResponse = await authApi.me();
          set({ user: userResponse.data.data, isLoading: false });

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
        purgeLegacyClientSecrets();
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
      storage: createJSONStorage(() => userOnlyStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration, confirm the session with the API. The `HttpOnly`
        // cookie is the only credential, so the request is sent unconditionally
        // and a 401 clears the (non-credential) persisted user.
        if (state && typeof window !== "undefined") {
          setTimeout(() => state.fetchUser(), 0);
        }
      },
    },
  ),
);
