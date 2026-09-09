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
  SSOLoginRequest,
  SSOConfigResponse,
  SSOLoginResult,
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
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

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
 */
let refreshInFlight: Promise<string> | null = null;

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

function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken =
      typeof window !== "undefined"
        ? localStorage.getItem("refreshToken")
        : null;
    if (!refreshToken) throw new NoSessionError();

    const response = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken,
    });
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", newRefreshToken);
    document.cookie = `accessToken=${accessToken}; path=/; max-age=86400; samesite=lax`;
    return accessToken as string;
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
    const authPaths = ["/auth/login", "/auth/register", "/auth/refresh"];
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
        const accessToken = await refreshAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        // An anonymous visitor never had a session to lose. Public pages call
        // protected endpoints (the SPMB page reads /units), and bouncing a
        // prospective parent to the staff login screen over that 401 is far
        // worse than letting the caller render its own empty state.
        const hadSession =
          typeof window !== "undefined" && !!localStorage.getItem("accessToken");
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

  ssoLogin: (data: SSOLoginRequest) =>
    api.post<ApiResponse<SSOLoginResult>>("/auth/sso/login", data),

  getSSOConfig: () =>
    api.get<ApiResponse<SSOConfigResponse>>("/auth/sso/config"),

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
//
// The upload response deliberately separates the STABLE reference from any
// TEMPORARY access link: consumers must PERSIST `url` (the raw blob URL for
// Azure, or a `/uploads/...` path for local storage — neither carries an
// expiring SAS), and use `downloadUrl` only to open the file immediately after
// upload. To display or download a persisted private reference later, call
// `sasUrl` to mint a fresh SAS on demand.
export interface UploadFileResult {
  /** Stable reference to persist — never a short-lived SAS. */
  url: string;
  /** Temporary SAS to open the just-uploaded file. Only present for private Azure containers. */
  downloadUrl?: string;
  /** Azure container the blob lives in (present only for Azure uploads). */
  containerName?: string;
  /** Azure blob name within the container (present only for Azure uploads). */
  blobName?: string;
  filename: string;
  mimetype: string;
  size: number;
}

export const uploadApi = {
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<UploadFileResult>>("/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  /**
   * Mint a fresh short-lived SAS for a persisted stable URL (the raw blob URL
   * stored via {@link uploadFile}). Private blobs return 403 without a SAS, and
   * any SAS persisted earlier has expired — so call this at display/download
   * time. Local /uploads URLs and public blob URLs return `{ url }` unchanged
   * (no `downloadUrl`).
   */
  sasUrl: async (url: string) => {
    return api.post<ApiResponse<{ url: string; downloadUrl?: string }>>(
      "/upload/sas",
      { url },
    );
  },
};

export default api;
