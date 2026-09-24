import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '@/config';

export interface JwtPayload {
  id: string;
  sub: string;
  email: string;
  roleId: string; // Active Role ID from UserRoleAssignment
  roleCode: string; // RoleCode string for quick checks (e.g. 'SUPER_ADMIN')
  /**
   * SELURUH peran aktif pengguna, diisi ulang dari basis data pada permintaan
   * tata kelola foundation-decisions (Finding B3). `roleCode` adalah peran
   * PRIMARY; kolom ini memuat peran lain yang juga aktif sehingga cek bacaan
   * global tidak salah menolak pemegang peran sekunder. Opsional agar token
   * lama (yang hanya punya `roleCode`) tetap valid.
   */
  roleCodes?: string[];
  unitId: string | null;
  permissions: string[]; // Permissions array from the Role record
  type: 'access' | 'refresh';
  isTemp?: boolean; // For 2FA temporary tokens
  // DEPRECATED: Legacy role field derived from roleCode at authentication time.
  // Kept so that unmigrated controllers/services that reference `req.user.role`
  // continue to work. Maps granular RoleCodes back to the legacy UserRole enum
  // values (SUPER_ADMIN, UNIT_ADMIN, TEACHER, STAFF, STUDENT, PARENT).
  // TODO: Remove once all modules are migrated to use roleCode.
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access token
 */
export function generateAccessToken(payload: Omit<JwtPayload, 'type'>, expiresIn?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt as any).sign({ ...payload, type: 'access' }, config.jwt.secret, {
    expiresIn: expiresIn || config.jwt.expiresIn,
    jwtid: randomUUID(),
  });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(
  payload: Omit<JwtPayload, 'type'>,
  expiresIn?: string
): string {
  // A unique jti guarantees distinct tokens even for two logins issued in the
  // same second (identical payload + iat would otherwise collide on the
  // refresh_tokens.token unique constraint → "field already exists").
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt as any).sign({ ...payload, type: 'refresh' }, config.jwt.secret, {
    expiresIn: expiresIn || config.jwt.refreshExpiresIn,
    jwtid: randomUUID(),
  });
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(
  payload: Omit<JwtPayload, 'type'>,
  expiresIn?: string
): TokenPair {
  return {
    accessToken: generateAccessToken(payload, expiresIn),
    refreshToken: generateRefreshToken(payload, expiresIn),
  };
}

/**
 * Verify and decode token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JwtPayload | null {
  return jwt.decode(token) as JwtPayload | null;
}

/**
 * Get expiration date from JWT expiry string
 */
export function getExpirationDate(expiresIn: string): Date {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiry format');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case 's':
      return new Date(now.getTime() + value * 1000);
    case 'm':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error('Invalid expiry unit');
  }
}
