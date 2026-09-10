import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AxiosError } from "axios";
import { User, authApi, rolesApi, LoginRequest } from "@/lib/api";
import { SSOLoginRequest, LoginResponse } from "@cipansor/shared";

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

// Custom storage that syncs with cookies for middleware
const customStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    const item = localStorage.getItem(name);
    // Also sync to cookie for middleware
    if (item) {
      document.cookie = `${name}=${encodeURIComponent(item)}; path=/; max-age=86400; samesite=lax`;
    }
    return item;
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(name, value);
    // Also sync to cookie for middleware
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=86400; samesite=lax`;
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(name);
    // Also remove from cookie
    document.cookie = `${name}=; path=/; max-age=0`;
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
            document.cookie = `accessToken=${responseData.tempToken}; path=/; max-age=3600; samesite=lax`;
            return;
          }

          const { user, accessToken, refreshToken } = responseData as LoginResponse;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);
          document.cookie = `accessToken=${accessToken}; path=/; max-age=86400; samesite=lax`;

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            requiresTwoFactor: false,
            requiresTwoFactorSetup: false,
            tempToken: null,
          });
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
            document.cookie = `accessToken=${data.tempToken}; path=/; max-age=3600; samesite=lax`;
            return;
          }

          const { user, accessToken, refreshToken } = data;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);
          // Also set token in cookie for middleware
          document.cookie = `accessToken=${accessToken}; path=/; max-age=86400; samesite=lax`;

          set({
            user,
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
          document.cookie = `accessToken=${accessToken}; path=/; max-age=86400; samesite=lax`;

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
          document.cookie = "accessToken=; path=/; max-age=0";
          document.cookie = "auth-storage=; path=/; max-age=0";
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
              // Also remove from cookies
              document.cookie = "accessToken=; path=/; max-age=0";
              document.cookie = "auth-storage=; path=/; max-age=0";
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
          document.cookie = `accessToken=${accessToken}; path=/; max-age=86400; samesite=lax`;

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
        document.cookie = "accessToken=; path=/; max-age=0";
        document.cookie = "auth-storage=; path=/; max-age=0";
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
