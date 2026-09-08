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

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
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
  accessToken: string;
  refreshToken: string;
}

export interface AssignRoleRequest {
  userId: string;
  roleId: string;
  unitId?: string;
  isPrimary?: boolean;
}
