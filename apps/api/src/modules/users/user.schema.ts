import { z } from 'zod';

// Query params
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']).optional(),
  unitId: z.string().uuid().optional(),
});

// Create user
export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  // Bounds only; the policy (15 characters for a new account, the blocklist)
  // runs in the service — lib/password-policy.ts. No composition rules.
  password: z
    .string()
    .min(8, 'Kata sandi minimal 8 karakter')
    .max(256, 'Kata sandi terlalu panjang'),
  role: z.enum(['SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
  unitId: z.string().uuid().optional().nullable(),
});

// Update user
export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']).optional(),
  unitId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

// Params
export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});

// Types
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
