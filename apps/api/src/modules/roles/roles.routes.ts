import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate, authorize, isAdmin } from '@/middleware/auth';
import { validate, validateQuery } from '@/middleware/error';
import {
  getRolesQuerySchema,
  assignRoleSchema,
  switchRoleSchema,
  setPrimaryRoleSchema,
  createRoleSchema,
  updateRoleSchema,
} from './roles.schema';
import { UserRole } from '@prisma/client';

const router = Router();

/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [Roles]
 *     summary: Get all roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: string
 *           enum: [GLOBAL, YAYASAN, PAUD, SD_IT, SMP_IT, SMA_ALQURAN]
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get(
  '/',
  authenticate,
  validateQuery(getRolesQuerySchema),
  rolesController.getAllRoles.bind(rolesController)
);

/**
 * @openapi
 * /api/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create a new role (Super Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleInput'
 *     responses:
 *       201:
 *         description: Role created
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  validate(createRoleSchema),
  rolesController.createRole.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/my-roles:
 *   get:
 *     tags: [Roles]
 *     summary: Get current user's role assignments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's role assignments
 */
router.get('/my-roles', authenticate, rolesController.getMyRoles.bind(rolesController));

/**
 * @openapi
 * /api/roles/switch:
 *   post:
 *     tags: [Roles]
 *     summary: Switch active role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleAssignmentId
 *             properties:
 *               roleAssignmentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Role switched, new tokens returned
 */
router.post(
  '/switch',
  authenticate,
  validate(switchRoleSchema),
  rolesController.switchRole.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/users/{userId}:
 *   get:
 *     tags: [Roles]
 *     summary: Get user's role assignments (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's role assignments
 */
router.get(
  '/users/:userId',
  authenticate,
  isAdmin,
  rolesController.getUserRoles.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get role by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role details
 */
router.get('/:id', authenticate, rolesController.getRoleById.bind(rolesController));

/**
 * @openapi
 * /api/roles/{id}:
 *   patch:
 *     tags: [Roles]
 *     summary: Update role (Super Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleInput'
 *     responses:
 *       200:
 *         description: Role updated
 */
router.patch(
  '/:id',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  validate(updateRoleSchema),
  rolesController.updateRole.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/assign:
 *   post:
 *     tags: [Roles]
 *     summary: Assign role to user (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - roleId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               roleId:
 *                 type: string
 *                 format: uuid
 *               unitId:
 *                 type: string
 *                 format: uuid
 *               isPrimary:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Role assigned
 */
// Role changes: isAdmin, not authorize(UNIT_ADMIN). The legacy UNIT_ADMIN
// bucket also holds every yayasan organ, and they are not system
// administrators (see ADMIN_ROLE_CODES). What a unit admin may change is
// decided per request in rolesService.assertMayManage.
router.post(
  '/assign',
  authenticate,
  isAdmin,
  validate(assignRoleSchema),
  rolesController.assignRole.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/users/{userId}/primary:
 *   patch:
 *     tags: [Roles]
 *     summary: Set primary role for user (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleAssignmentId
 *             properties:
 *               roleAssignmentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Primary role updated
 */
router.patch(
  '/users/:userId/primary',
  authenticate,
  isAdmin,
  validate(setPrimaryRoleSchema),
  rolesController.setPrimaryRole.bind(rolesController)
);

/**
 * @openapi
 * /api/roles/assignments/{id}:
 *   delete:
 *     tags: [Roles]
 *     summary: Remove role assignment (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Role assignment removed
 */
router.delete(
  '/assignments/:id',
  authenticate,
  isAdmin,
  rolesController.removeRoleAssignment.bind(rolesController)
);

export default router;
