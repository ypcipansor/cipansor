import { UserRole } from "./enums";

export interface UserRoleAssignment {
  id: string;
  isPrimary: boolean;
  role: {
    id: string;
    code: string;
    name: string;
    realm: string;
    description?: string;
  };
  unit?: {
    id: string;
    name: string;
  } | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  unitId?: string;
  unit?: {
    id: string;
    name: string;
    type: string;
  };
  academicYearId?: string;
  userRoles?: UserRoleAssignment[];
  // Relations that might be included
  student?: {
    id: string;
    name?: string;
    nis?: string;
  };
  teacher?: {
    id: string;
    nip?: string;
  };
  staff?: {
    id: string;
    nip?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  /**
   * Token Cloudflare Turnstile.
   *
   * Opsional karena gerbangnya dapat dimatikan seluruhnya — pengembangan,
   * e2e, dan penerapan yang belum memasang kuncinya. Ia ditukarkan dan
   * dibuang di middleware sebelum `validate(loginSchema)` berjalan, jadi
   * skema login sisi peladen tidak mengenalnya dan tidak perlu mengenalnya.
   */
  turnstileToken?: string;
}

/**
 * The result of POST /auth/login (and /auth/2fa/login).
 *
 * The browser gets `{ user }` only: the session tokens are issued as HttpOnly
 * cookies the page's JavaScript cannot read, so they are deliberately absent
 * from this body. A bearer-only client (the mobile app, the e2e API helpers)
 * asks for them with `X-Client: bearer` and receives `accessToken`/
 * `refreshToken` as before. The 2FA branches carry only their flow flag; the
 * short-lived 2FA token now rides the same HttpOnly cookie.
 */
export interface LoginResponse {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  requiresTwoFactor?: boolean;
  requiresTwoFactorSetup?: boolean;
  tempToken?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  unitId?: string | null;
  iat: number;
  exp: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  realm: string;
  permissions?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  unitId?: string;
  isPrimary: boolean;
  isActive: boolean;
  assignedAt: string;
  expiresAt?: string;
  role: Role;
  unit?: {
    id: string;
    name: string;
    type: string;
  };
  user?: User;
}

export interface SwitchRoleResponse {
  message: string;
  activeRole: UserRoleAssignment;
  /** Bearer-only clients only; the browser receives the session in cookies. */
  accessToken?: string;
  refreshToken?: string;
}

export interface AssignRoleRequest {
  userId: string;
  roleId: string;
  unitId?: string;
  isPrimary?: boolean;
}

/** GET /auth/2fa/status */
export interface TwoFactorStatus {
  isEnabled: boolean;
  /** One of the account's active roles makes 2FA mandatory: it cannot be turned off. */
  isRequired: boolean;
  /**
   * 2FA is off, not mandatory, and one of the account's active roles is
   * invited to turn it on (`SECOND_FACTOR_INVITE_ROLE_CODES`): the web offers
   * it right after sign-in.
   */
  isInvited: boolean;
}
