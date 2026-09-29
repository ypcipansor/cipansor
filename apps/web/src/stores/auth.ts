import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AxiosError } from "axios";
import { User, authApi, rolesApi, LoginRequest } from "@/lib/api";
import {
  clearTwoFactorInvite,
  markTwoFactorInvite,
} from "@/lib/two-factor-invite";
import { clearPrivateServiceWorkerCaches } from "@/lib/push-cache";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresTwoFactor: boolean;
  requiresTwoFactorSetup: boolean;

  login: (credentials: LoginRequest) => Promise<void>;
  verifyTwoFactor: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  switchRole: (roleAssignmentId: string) => Promise<void>;
  clearError: () => void;
  resetAuth: () => void;
}

/**
 * Auth state.
 *
 * The session itself is no longer here. The API issues the access and refresh
 * tokens as HttpOnly cookies the page's JavaScript cannot read; this store
 * keeps only the *user*, so the UI can render a name and a role. That is why
 * there is no `accessToken`/`refreshToken` anywhere below — an earlier version
 * kept both in `localStorage` and mirrored a readable `accessToken` cookie for
 * `middleware.ts`, which one XSS could exfiltrate.
 *
 * Persisting the user still matters (a reload should show the shell before
 * `/auth/me` answers), but it is no longer a credential: a forged
 * `auth-storage` localStorage entry cannot authenticate anything, because the
 * API — not the client — decides whether the request carries a session. The
 * Next middleware no longer reads it at all; it reads the API-set HttpOnly
 * `cipansor_principal` cookie for routing.
 */
/**
 * Drop what the old client left behind. A browser that signed in before the
 * session moved to HttpOnly cookies still holds the access and refresh tokens
 * in `localStorage`. Nothing reads them any more, but a script still could,
 * and the refresh token stays valid for weeks. (The old readable `accessToken`
 * cookie carried only the 15-minute access token and expires within a day.)
 * Runs on every rehydration; once they are gone it does nothing.
 */
export function dropLegacySessionTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

const userOnlyStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    dropLegacySessionTokens();
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

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(credentials);
          const data = response.data.data;

          if (data.requiresTwoFactor) {
            set({ requiresTwoFactor: true, isLoading: false });
            return;
          }

          if (data.requiresTwoFactorSetup) {
            // The short-lived 2FA token is in an HttpOnly cookie; the setup
            // component calls /auth/2fa/generate next, which the cookie
            // authenticates, and then signs in again.
            set({ requiresTwoFactorSetup: true, isLoading: false });
            return;
          }

          // Signed in with the password alone: the app shell may invite this
          // account to turn 2FA on (it asks the API whether it is invited).
          markTwoFactorInvite();

          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
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
          // The temporary token authenticates this call from its HttpOnly
          // cookie, so there is nothing to place in a header first.
          const response = await authApi.verify2FA({ token });
          const { user } = response.data.data;

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
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
          // The API revokes the refresh token from its cookie and clears every
          // session cookie. The client only drops its copy of the user.
          await authApi.logout();
        } catch {
          // Ignore logout errors — the local wipe below is the important part.
        } finally {
          // Cached per-user content (pages, private images) outlives the
          // session; drop it so the next person on this device cannot read a
          // former user's data from Cache Storage (CWE-524). Best-effort —
          // never block the logout.
          void clearPrivateServiceWorkerCaches();
          clearTwoFactorInvite();
          set({
            user: null,
            isAuthenticated: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
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
              // The session cookie is gone or rejected. There is nothing
              // client-side to clear beyond the cached user.
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
          // The API rotates the session cookies; the body carries the new
          // active role only.
          await rolesApi.switchRole(roleAssignmentId);

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
        set({
          user: null,
          isAuthenticated: false,
          requiresTwoFactor: false,
          requiresTwoFactorSetup: false,
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
        // After hydration, ask the API who we are — the cookie decides, not
        // anything persisted here.
        if (state && typeof window !== "undefined") {
          setTimeout(() => state.fetchUser(), 0);
        }
      },
    },
  ),
);
