import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { API_BASE_URL } from "./api-origin";

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
  GetSasUrlRequest,
  GetSasUrlResult,
  UploadFileResult,
  UploadDestination,
} from "@cipansor/shared";
import {
  clearSessionCookies,
  clearRoutingSessionOnServer,
} from "@/lib/session-cookie";

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

// The API origin/base URL live in `lib/api-origin.ts` so the file resolver can
// anchor a host-relative `/uploads/<file>` reference to the same origin this
// instance talks to. `API_URL` is kept as the local alias every call site below
// already uses.
const API_URL = API_BASE_URL;

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

/**
 * The bearer rotated, but the server-signed routing cookie could not be
 * re-minted against the new token.
 *
 * This is a definitive, fail-closed outcome, not a transient one to swallow: if
 * the API now reports a different primary role/RoleCode, the Proxy would keep
 * routing off the old cookie until it expired. Rather than let a new bearer sit
 * beside a stale routing identity, the caller treats this like a rejected
 * session and signs the user back in.
 */
class RoutingSessionRefreshError extends Error {
  constructor() {
    super("Routing session could not be re-minted after token refresh");
    this.name = "RoutingSessionRefreshError";
  }
}

/**
 * Re-mint the server-signed `cipansor-session` cookie for a freshly rotated
 * bearer, so the Next Proxy routes off the CURRENT role instead of the one the
 * previous cookie carried.
 *
 * Uses native `fetch`, deliberately NOT the `api` axios instance. Two reasons,
 * both correctness-critical:
 *
 *  - **No recursion.** A 401 from this call would run through the response
 *    interceptor, which calls `refreshAccessToken()` again — the token was just
 *    rotated, so that path could loop. `fetch` is below the interceptor layer.
 *  - **No stale header.** The request interceptor attaches whatever
 *    `localStorage.accessToken` holds; going direct lets us send the exact
 *    token we just received.
 *
 * `POST /api/session` answers `200 { session: false }` whenever it did NOT sign
 * a cookie, so only `session === true` counts as success. Any network failure,
 * non-2xx, malformed body or `session: false` resolves `false` — never a
 * rejection — so the caller can decide the fail-closed path.
 */
async function remintRoutingSession(accessToken: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return false;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return false;
    }
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { session?: unknown }).session === true
    );
  } catch {
    return false;
  }
}

export function refreshAccessToken(): Promise<string> {
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
    // The rotated bearer token must NOT be mirrored into a JS-readable cookie
    // (finding F); middleware routes off the server-signed `cipansor-session`
    // cookie, never the raw token or a client-writable profile blob.
    //
    // The routing cookie is re-minted here (finding 2): a refresh can return a
    // different primary role/RoleCode, and leaving the old cookie in place
    // would route the user to the wrong dashboard until it expired.
    if (!(await remintRoutingSession(accessToken as string))) {
      throw new RoutingSessionRefreshError();
    }
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
          typeof window !== "undefined" &&
          !!localStorage.getItem("accessToken");
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
          refreshError instanceof RoutingSessionRefreshError ||
          status === 400 ||
          status === 401 ||
          status === 403;
        if (!isDefinitive) {
          return Promise.reject(error);
        }

        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        // Finding A: `cipansor-session` is `HttpOnly`, so `clearSessionCookies`
        // alone cannot remove it. Redirecting to `/login` while the Proxy still
        // saw the old routing session bounced the user back into a protected
        // page until the cookie expired. Ask the SERVER to clear it first, via
        // native `fetch` (NOT the axios instance, whose 401 interceptor would
        // re-enter this refresh path and recurse). Best-effort: it never
        // rejects, so an offline browser still clears localStorage and lands on
        // `/login`.
        await clearRoutingSessionOnServer().catch(() => undefined);
        clearSessionCookies();
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
//
// The upload response contract (UploadFileResult) lives in @cipansor/shared so
// the API and the web client can never drift apart.

export const uploadApi = {
  uploadFile: async (file: File, destination?: UploadDestination) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<UploadFileResult>>(
      destination
        ? `/upload?destination=${encodeURIComponent(destination)}`
        : "/upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  },
  /**
   * Mint a fresh short-lived SAS for a persisted stable URL (the raw blob URL
   * stored via {@link uploadFile}). Private blobs return 403 without a SAS, and
   * any SAS persisted earlier has expired — so call this at display/download
   * time. Local /uploads URLs and public blob URLs return `{ url }` unchanged
   * (no `downloadUrl`).
   */
  sasUrl: async (url: string) => {
    const body: GetSasUrlRequest = { url };
    return api.post<ApiResponse<GetSasUrlResult>>("/upload/sas", body);
  },
  /**
   * Discard an upload whose follow-up record was never saved, so the blob does
   * not linger in private storage. Safe by construction: the API refuses to
   * discard a blob any record references.
   *
   * **Call only after the record-create request has definitively failed.** The
   * API waits out a short race window and re-checks the reference index, so a
   * concurrent create that commits wins and the discard is refused
   * (`409`); treat that as "not orphaned after all", not as an error to retry
   * blindly. Calling this speculatively — before the create has resolved — can
   * only end in that refusal.
   */
  discard: async (url: string) => {
    const body: GetSasUrlRequest = { url };
    return api.post<ApiResponse<null>>("/upload/discard", body);
  },
};

export default api;
