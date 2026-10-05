import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { userService } from './user.service';
import { ListUsersQuery, CreateUserInput, UpdateUserInput } from './user.schema';

/**
 * List users
 * GET /api/users
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListUsersQuery;
  const result = await userService.findAll(query, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.users,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Get user by ID
 * GET /api/users/:id
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await userService.findById(id);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Create user
 * POST /api/users
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const input: CreateUserInput = req.body;
  const user = await userService.create(input, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.status(201).json({
    success: true,
    data: user,
  });
});

/**
 * Update user
 * PUT /api/users/:id
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdateUserInput = req.body;
  const user = await userService.update(id, input, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
    sub: req.user!.sub,
  });

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Delete user
 * DELETE /api/users/:id
 */
/**
 * Mark a password as leaked: sessions end, the next sign-in asks for a new one.
 * POST /api/users/:id/require-password-change
 */
export const requirePasswordChange = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await userService.requirePasswordChange(id, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
    sub: req.user!.sub,
  });

  res.json({
    success: true,
    data: result,
  });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await userService.delete(id, {
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
    sub: req.user!.sub,
  });

  res.json({
    success: true,
    data: result,
  });
});
