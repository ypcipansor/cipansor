import { Router } from 'express';
import { authenticate, isAdmin, isAdminOrSelf } from '@/middleware/auth';
import { validate, validateQuery, validateParams } from '@/middleware/error';
import * as controller from './user.controller';
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from './user.schema';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List users (Admin only)
 *     description: Get paginated list of users with optional filters
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [SUPER_ADMIN, UNIT_ADMIN, TEACHER, STAFF, STUDENT, PARENT]
 *         description: Filter by role
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by unit
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', isAdmin, validateQuery(listUsersQuerySchema), controller.list);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID (Admin, or the user themselves)
 *     description: Get user details by their ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', isAdminOrSelf(), validateParams(userIdParamSchema), controller.getById);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create user (Admin only)
 *     description: Create a new user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Ahmad Fauzi
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, UNIT_ADMIN, TEACHER, STAFF, STUDENT, PARENT]
 *               unitId:
 *                 type: string
 *                 format: uuid
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', isAdmin, validate(createUserSchema), controller.create);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (Admin only)
 *     description: Update user information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, UNIT_ADMIN, TEACHER, STAFF, STUDENT, PARENT]
 *               unitId:
 *                 type: string
 *                 format: uuid
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.put(
  '/:id',
  isAdmin,
  validateParams(userIdParamSchema),
  validate(updateUserSchema),
  controller.update
);

/**
 * @swagger
 * /api/users/{id}/require-password-change:
 *   post:
 *     summary: Mark a password as leaked (Admin only)
 *     description: >
 *       Ends every session of the account and makes its next sign-in ask for a
 *       new password. Super Admin for any account; a unit admin for accounts of
 *       their unit that are not required to use 2FA.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Marked; sessions ended
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/:id/require-password-change',
  isAdmin,
  validateParams(userIdParamSchema),
  controller.requirePasswordChange
);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     description: Soft delete a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.delete('/:id', isAdmin, validateParams(userIdParamSchema), controller.remove);

export default router;
