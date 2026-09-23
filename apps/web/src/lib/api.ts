import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

// Allow any request to opt out of the global error toast in the response
// interceptor. Best-effort aggregation calls (the role dashboards fire several
// parallel requests the user may not be authorised for) set this so a 403/404
// on one of them doesn't spam "missing permission" / "route not found".
declare module "axios" {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean;
  }
}
import {
  User,
  LoginRequest,
  LoginResponse,
  UserRoleAssignment,
  Role,
  RoleAssignment,
  SwitchRoleResponse,
  AssignRoleRequest,
  ApiResponse,
  PaginatedResponse as SharedPaginatedResponse,
  TahfidzRecord,
  TahfidzDashboardStats,
  TahfidzStudentSummary,
  CreateTahfidzInput,
  UpdateTahfidzInput,
} from "@cipansor/shared";

// 2FA Types
export interface TwoFactorGenerateResponse {
  secret: string;
  qrCodeUrl: string;
}

export interface TwoFactorEnableResponse {
  recoveryCodes: string[];
}

export interface TwoFactorStatusResponse {
  isEnabled: boolean;
}

// Explicitly export SharedPaginatedResponse for new modules
export type { SharedPaginatedResponse };
// Re-export shared types
export * from "@cipansor/shared";

// Compatibility alias
export type UserRole = UserRoleAssignment;

// LEGACY PaginatedResponse
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Local types for Roles (since shared was not updated)
export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

// NEXT_PUBLIC_API_URL is the API *base* origin (no /api suffix); the `/api`
// prefix is appended here so every consumer of this env var uses one
// convention. Callers of this axios instance use bare paths (e.g. "/students").
//
// `??`, not `||`, on purpose. An empty value is a meaningful setting: it makes
// the base relative ("/api"), so the bundle talks to whichever origin served
// the page. That is what lets one image serve both cipansor.or.id and
// portal.cipansor.or.id with the API same-origin on each — the value is inlined
// at build time, so an absolute origin baked here would make one of the two
// hosts cross-origin and put CORS on the critical path. `||` would have folded
// that empty string into the localhost fallback and silently broken it.
// Unset still falls back to localhost:3001 for `pnpm dev`, where the web dev
// server (:3000) and the API (:3001) really are different origins.
const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api`;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // The session lives in server-issued `HttpOnly` cookies, which the browser
  // attaches automatically only when the request is same-origin *and* this is
  // set. Production is same-origin (`NEXT_PUBLIC_API_URL` empty → "/api"); in
  // `pnpm dev` the API is a different origin (localhost:3001), where the API's
  // CORS config must echo the origin and allow credentials.
  withCredentials: true,
});

// No request interceptor sets an Authorization header from storage: there is no
// JavaScript-readable token to attach. The cookie travels with the request.

/**
 * Single-flight refresh.
 *
 * The API rotates refresh tokens: `/auth/refresh` deletes the presented token
 * and issues a new one. A page that fires several requests in parallel with an
 * expired access token therefore used to send several concurrent refreshes —
 * the first rotated the token and the rest presented one the server had just
 * deleted, got 401 "Refresh token not found", and the catch below logged the
 * user out. That is exactly what the audit caught: pages bouncing to /login
 * and then, via middleware, to the role dashboard, losing the requested page.
 *
 * Now the first 401 performs the refresh and everyone else awaits its result.
 * The refresh token is presented by the `HttpOnly` cookie; a body is not sent.
 */
let refreshInFlight: Promise<void> | null = null;

/**
 * There is no session to refresh.
 *
 * This is NOT the same as a rejected session. An anonymous visitor on a public
 * page (`/public/spmb`, `/wakaf-infaq`) whose page happens to call a
 * protected endpoint will land here — and bouncing them to /login would be
 * wrong: they never claimed to be logged in. Treating this as a definitive
 * logout sent the landing page's "Daftar SPMB" call-to-action straight to the
 * staff login screen.
 */
class NoSessionError extends Error {
  constructor() {
    super("No session to refresh");
    this.name = "NoSessionError";
  }
}

export function hasSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  // The `auth-storage` key holds the (non-credential) user blob the store
  // persists while a session is expected to exist. Its presence is only a hint
  // used to decide whether a 401 should bounce to /login; the credential is the
  // HttpOnly cookie.
  //
  // The key existing is NOT the hint. The store re-persists an empty state
  // (`user: null, isAuthenticated: false`) after a 401 on `/auth/me`, so an
  // anonymous visitor who has ever loaded a page has the key — and treating
  // that as a session made every later visit fire a *speculative* refresh. Once
  // a failed refresh also clears the session cookies server-side, that stray
  // request destroys whatever session the next request legitimately presents
  // (a sign-in racing the stale refresh), which is the login bounce this was
  // meant to prevent. Only a blob naming a user is a session.
  const raw = localStorage.getItem("auth-storage");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { user?: unknown; isAuthenticated?: boolean };
    };
    const state = parsed?.state;
    return Boolean(state?.user) || state?.isAuthenticated === true;
  } catch {
    return false;
  }
}

function refreshSession(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    if (typeof window === "undefined" || !hasSessionHint()) {
      throw new NoSessionError();
    }
    // No body: the API reads the refresh token from its `HttpOnly` cookie and
    // sets the replacement access/refresh cookies on the response.
    await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      skipErrorToast?: boolean;
    };

    // Auth endpoints that should NEVER trigger token refresh —
    // their 401 means "wrong credentials", not "expired token".
    const authPaths = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/session/clear",
    ];
    const requestUrl = originalRequest?.url ?? "";
    const isAuthEndpoint = authPaths.some((p) => requestUrl.includes(p));

    // Handle 401 Unauthorized (Token Refresh) — skip for auth endpoints
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        await refreshSession();
        return api(originalRequest);
      } catch (refreshError) {
        // An anonymous visitor never had a session to lose. Public pages call
        // protected endpoints (the SPMB page reads /units), and bouncing a
        // prospective parent to the staff login screen over that 401 is far
        // worse than letting the caller render its own empty state.
        const hadSession = hasSessionHint();
        if (!hadSession) {
          return Promise.reject(error);
        }

        // Only a definitive rejection means the session is really gone. A 429
        // from the rate limiter, a 5xx or a dropped connection says nothing
        // about the token's validity, and logging the user out over one would
        // throw away a working session — the same reasoning as `fetchUser` in
        // stores/auth.ts.
        const status = (refreshError as AxiosError)?.response?.status;
        const isDefinitive =
          refreshError instanceof NoSessionError ||
          status === 400 ||
          status === 401 ||
          status === 403;
        if (!isDefinitive) {
          return Promise.reject(error);
        }

        // End the session server-side. Clearing the `HttpOnly`
        // access/refresh/routing cookies is a server-only act, and it is what
        // stops the stale `cipansor_routing` hint from trapping the user in a
        // login loop. `/auth/refresh`'s own 401 handler already deletes them,
        // but a client that reached the failure through a path whose response
        // did not (or whose clearing response was lost) still needs a
        // guaranteed door; `session/clear` is unauthenticated precisely so it
        // works when the credentials are already invalid, and it is listed in
        // `authPaths` above so it can never recurse into this refresh logic.
        //
        // Best-effort: if the network is down the client state is still cleared.
        try {
          await axios.post(
            `${API_URL}/auth/session/clear`,
            {},
            { withCredentials: true },
          );
        } catch {
          // Ignored — see above.
        }

        // Clear the non-credential user blob; the server cleared the HttpOnly
        // cookies above. Best-effort legacy cleanup too.
        localStorage.removeItem("auth-storage");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        document.cookie = "accessToken=; path=/; max-age=0";
        document.cookie = "auth-storage=; path=/; max-age=0";

        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login")
        ) {
          window.location.href = "/login";
        }
      }
    }

    // Extract the human-readable error message from the API response envelope
    const data = error.response?.data as any;
    const friendlyMessage =
      data?.error?.message ||
      data?.message ||
      error.message ||
      "Terjadi kesalahan sistem";
    const code = data?.error?.code;

    // Show toast for all errors EXCEPT 401 on non-auth endpoints
    // (those are handled by the refresh logic above or silently redirected)
    // and EXCEPT calls that opted out via `skipErrorToast` — best-effort
    // aggregation calls (e.g. the role dashboards fire several parallel
    // requests the user may not be authorised for) handle their own failures
    // and must not spam "missing permission" / "route not found" toasts.
    if (
      !originalRequest?.skipErrorToast &&
      (error.response?.status !== 401 || isAuthEndpoint)
    ) {
      toast.error(friendlyMessage, {
        description: code ? `Error Code: ${code}` : undefined,
      });
    }

    // Attach the friendly message so downstream catch blocks get it easily
    if (data?.error?.message) {
      error.message = data.error.message;
    }

    return Promise.reject(error);
  },
);

// Auth API
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>("/auth/login", data),

  logout: () => api.post("/auth/logout"),

  me: () => api.get<ApiResponse<User>>("/auth/me"),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put("/auth/password", data),

  // 2FA methods
  generate2FA: () =>
    api.post<ApiResponse<TwoFactorGenerateResponse>>("/auth/2fa/generate"),
  enable2FA: (data: { token: string }) =>
    api.post<ApiResponse<TwoFactorEnableResponse>>("/auth/2fa/enable", data),
  verify2FA: (data: { token: string }) =>
    api.post<ApiResponse<LoginResponse>>("/auth/2fa/login", data),
  disable2FA: (data: { token: string; userId?: string }) =>
    api.post<ApiResponse<void>>("/auth/2fa/disable", data),
  get2FAStatus: () =>
    api.get<ApiResponse<TwoFactorStatusResponse>>("/auth/2fa/status"),
};

export const rolesApi = {
  // Get current user's roles
  getMyRoles: () =>
    api.get<ApiResponse<UserRoleAssignment[]>>("/roles/my-roles"),

  // Switch active role
  switchRole: (roleAssignmentId: string) =>
    api.post<ApiResponse<SwitchRoleResponse>>("/roles/switch", {
      roleAssignmentId,
    }),

  // Get all roles (optionally filtered by realm)
  getAllRoles: (realm?: string) =>
    api.get<ApiResponse<Role[]>>("/roles", {
      params: realm ? { realm } : undefined,
    }),

  // Get role by ID
  getRoleById: (id: string) => api.get<ApiResponse<Role>>(`/roles/${id}`),

  // Create role
  createRole: (data: CreateRoleInput) =>
    api.post<ApiResponse<Role>>("/roles", data),

  // Update role
  updateRole: (id: string, data: UpdateRoleInput) =>
    api.patch<ApiResponse<Role>>(`/roles/${id}`, data),

  // Get roles assigned to a user
  getUserRoles: (userId: string) =>
    api.get<ApiResponse<RoleAssignment[]>>(`/roles/users/${userId}`),

  // Assign role to user
  assignRole: (data: AssignRoleRequest) =>
    api.post<ApiResponse<RoleAssignment>>("/roles/assign", data),

  // Set primary role for user
  setPrimaryRole: (userId: string, roleAssignmentId: string) =>
    api.patch<ApiResponse<RoleAssignment>>(`/roles/users/${userId}/primary`, {
      roleAssignmentId,
    }),

  // Remove role assignment
  removeRoleAssignment: (assignmentId: string) =>
    api.delete<ApiResponse<void>>(`/roles/assignments/${assignmentId}`),
};

// Tahfidz API
export const tahfidzApi = {
  getRecords: (params?: any) =>
    api.get<SharedPaginatedResponse<TahfidzRecord>>("/tahfidz", { params }),

  getRecordById: (id: string) =>
    api.get<ApiResponse<TahfidzRecord>>(`/tahfidz/${id}`),

  createRecord: (data: CreateTahfidzInput) =>
    api.post<ApiResponse<TahfidzRecord>>("/tahfidz", data),

  updateRecord: (id: string, data: UpdateTahfidzInput) =>
    api.put<ApiResponse<TahfidzRecord>>(`/tahfidz/${id}`, data),

  deleteRecord: (id: string) => api.delete<ApiResponse<void>>(`/tahfidz/${id}`),

  getDashboard: (params: { unitId?: string; year?: number; month?: number }) =>
    api.get<ApiResponse<TahfidzDashboardStats>>("/tahfidz/stats", {
      params,
    }),

  getStudentSummary: (studentId: string) =>
    api.get<ApiResponse<TahfidzStudentSummary>>(
      `/tahfidz/summary/${studentId}`,
    ),
};

// General Upload API
export const uploadApi = {
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<
      ApiResponse<{
        url: string;
        filename: string;
        mimetype: string;
        size: number;
      }>
    >("/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

export default api;
