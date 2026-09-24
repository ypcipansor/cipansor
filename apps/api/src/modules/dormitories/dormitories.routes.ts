import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as controller from './dormitories.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validateQuery } from '../../middleware/error';
import {
  queryDormitorySchema,
  queryRoomSchema,
  queryRoomAssignmentSchema,
} from './dormitories.schema';

const router = Router();

router.use(authenticate);

// ==================== SPECIFIC ROUTES (Must be before dynamic /:id) ====================

/**
 * @swagger
 * /api/dormitories/my-students:
 *   get:
 *     summary: Get students assigned to current Musyrif
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of students
 */
router.get('/my-students', authenticate, controller.getStudentsByMusyrif);

/**
 * @swagger
 * /api/dormitories/rooms/list:
 *   get:
 *     summary: List rooms
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dormitoryId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, FULL, MAINTENANCE]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of rooms
 */
router.get(
  '/rooms/list',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validateQuery(queryRoomSchema),
  controller.getRooms
);

/**
 * @swagger
 * /api/dormitories/assignments/list:
 *   get:
 *     summary: List room assignments
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of room assignments
 */
router.get(
  '/assignments/list',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validateQuery(queryRoomAssignmentSchema),
  controller.getRoomAssignments
);

// ==================== DORMITORIES (General) ====================

/**
 * @swagger
 * /api/dormitories:
 *   get:
 *     summary: List dormitories
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [MALE, FEMALE]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of dormitories
 */
router.get(
  '/',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  validateQuery(queryDormitorySchema),
  controller.getDormitories
);

/**
 * @swagger
 * /api/dormitories:
 *   post:
 *     summary: Create dormitory
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - unitId
 *               - gender
 *             properties:
 *               name:
 *                 type: string
 *               unitId:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE]
 *               capacity:
 *                 type: integer
 *               supervisorId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Dormitory created
 */
router.post('/', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN), controller.createDormitory);

/**
 * @swagger
 * /api/dormitories/rooms/{id}/social-analytics:
 *   get:
 *     summary: Get room social analytics (harmony score, violation summary)
 *     tags: [Dormitories]
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
 *         description: Room social analytics
 *       404:
 *         description: Room not found
 */
router.get(
  '/rooms/:id/social-analytics',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getRoomSocialAnalytics
);

/**
 * @swagger
 * /api/dormitories/{id}:
 *   get:
 *     summary: Get dormitory by ID
 *     tags: [Dormitories]
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
 *         description: Dormitory details
 *       404:
 *         description: Dormitory not found
 */
router.get(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getDormitoryById
);

/**
 * @swagger
 * /api/dormitories/{id}/stats:
 *   get:
 *     summary: Get dormitory statistics
 *     tags: [Dormitories]
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
 *         description: Dormitory statistics (occupancy, room status, etc.)
 */
router.get(
  '/:id/stats',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getDormitoryStats
);

/**
 * @swagger
 * /api/dormitories/{id}:
 *   put:
 *     summary: Update dormitory
 *     tags: [Dormitories]
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
 *         description: Dormitory updated
 */
router.put(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateDormitory
);

/**
 * @swagger
 * /api/dormitories/{id}:
 *   delete:
 *     summary: Delete dormitory
 *     tags: [Dormitories]
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
 *         description: Dormitory deleted
 */
router.delete(
  '/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteDormitory
);

// ==================== ROOMS ====================

/**
 * @swagger
 * /api/dormitories/rooms:
 *   post:
 *     summary: Create room
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dormitoryId
 *               - name
 *               - capacity
 *             properties:
 *               dormitoryId:
 *                 type: string
 *               name:
 *                 type: string
 *               capacity:
 *                 type: integer
 *               floor:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Room created
 */
router.post('/rooms', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN), controller.createRoom);

/**
 * @swagger
 * /api/dormitories/rooms/{id}:
 *   get:
 *     summary: Get room by ID
 *     tags: [Dormitories]
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
 *         description: Room details
 */
router.get(
  '/rooms/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getRoomById
);

/**
 * @swagger
 * /api/dormitories/rooms/{id}/occupancy:
 *   get:
 *     summary: Get room occupancy
 *     tags: [Dormitories]
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
 *         description: Room occupancy with current students
 */
router.get(
  '/rooms/:id/occupancy',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getRoomOccupancy
);

/**
 * @swagger
 * /api/dormitories/rooms/{id}:
 *   put:
 *     summary: Update room
 *     tags: [Dormitories]
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
 *         description: Room updated
 */
router.put(
  '/rooms/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateRoom
);

/**
 * @swagger
 * /api/dormitories/rooms/{id}:
 *   delete:
 *     summary: Delete room
 *     tags: [Dormitories]
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
 *         description: Room deleted
 */
router.delete(
  '/rooms/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.deleteRoom
);

// ==================== ROOM ASSIGNMENTS ====================

/**
 * @swagger
 * /api/dormitories/assignments:
 *   post:
 *     summary: Create room assignment
 *     tags: [Dormitories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - studentId
 *             properties:
 *               roomId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               bedNumber:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Room assignment created
 */
router.post(
  '/assignments',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.createRoomAssignment
);

/**
 * @swagger
 * /api/dormitories/assignments/{id}:
 *   get:
 *     summary: Get room assignment by ID
 *     tags: [Dormitories]
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
 *         description: Room assignment details
 */
router.get(
  '/assignments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER),
  controller.getRoomAssignmentById
);

/**
 * @swagger
 * /api/dormitories/assignments/{id}:
 *   put:
 *     summary: Update room assignment
 *     tags: [Dormitories]
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
 *         description: Room assignment updated
 */
router.put(
  '/assignments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.updateRoomAssignment
);

/**
 * @swagger
 * /api/dormitories/assignments/{id}:
 *   delete:
 *     summary: End room assignment
 *     tags: [Dormitories]
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
 *         description: Room assignment ended
 */
router.delete(
  '/assignments/:id',
  authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN),
  controller.endRoomAssignment
);

export default router;
