import { z } from 'zod';
import { RoleCode } from '@prisma/client';

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Register schema (admin creates user)
// Accepts `roleCode` (new) OR `role` (legacy) for backward compatibility with
// existing API clients, scripts, and mobile apps that still send `{ role: 'TEACHER' }`.
// If both are provided, `roleCode` takes precedence.
//
// NOTE: Per-unit legacy roles (TEACHER, STAFF, STUDENT, PARENT) cannot be
// resolved to a specific RoleCode at schema-validation time because the
// correct mapping depends on the target Unit's type (TKQ_GURU vs SDIT_GURU
// vs SMPIT_GURU vs SMAQ_GURU).  Resolution is deferred to the service
// layer (see AuthService.register), which has DB access to look up the
// Unit.type and pick the correct per-unit RoleCode.
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
  roleCode: z.nativeEnum(RoleCode, { errorMap: () => ({ message: 'Invalid role code' }) }).optional(),
  // DEPRECATED: Legacy `role` field. Use `roleCode` instead.
  // Accepted for backward compatibility with pre-migration API clients.
  // Restricted to the known legacy UserRole enum values so that invalid
  // strings (e.g. 'admin', 'HACKER') are rejected at schema-validation time
  // with a clean Zod error, rather than falling through to the service
  // layer which would produce a less actionable error message.
  role: z
    .enum(['SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    .optional(),
  unitId: z.string().uuid().optional().nullable(),
}).refine(
  (data) => data.roleCode || data.role,
  { message: 'Either roleCode or role is required', path: ['roleCode'] },
);

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
});

// Types
export type LoginInput = z.infer<typeof loginSchema>;
// RegisterInput: either `roleCode` OR `role` is present (guaranteed by refine).
// The service layer resolves the legacy `role` field to a proper RoleCode
// using the target Unit's type when `roleCode` is not provided.
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
