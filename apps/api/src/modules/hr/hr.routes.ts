import { Router } from 'express';
import {
  ADMIN_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  VICE_PRINCIPAL_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PESANTREN_EDUCATOR_ROLE_CODES,
  PT_ACADEMIC_ROLE_CODES,
  TATA_USAHA_ROLE_CODES,
  BENDAHARA_ROLE_CODES,
  PT_STAFF_ROLE_CODES,
  SUPPORT_ROLE_CODES,
  BUSINESS_ROLE_CODES,
} from '@cipansor/shared';
import * as controller from './hr.controller';
import { departmentController } from './departments.controller';
import { contractController } from './contracts.controller';
import { leaveBalanceController } from './leave-balances.controller';
import { employeeDocumentController } from './employee-documents.controller';
import { employmentHistoryController } from './employment-history.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validateQuery } from '../../middleware/error';
import {
  queryStaffAttendanceSchema,
  queryLeaveSchema,
  queryStaffSchema,
  queryTeachersSchema,
  queryEmployeesSchema,
} from './hr.schema';

const router = Router();

/**
 * Explicit RoleCode groups for the HR module, replacing the deprecated legacy
 * `UserRole` enum the routes were written against.
 *
 * The lists are written out rather than imported as re-exports so the check is
 * grep-able at each route: ADMIN_ROLE_CODES is intentionally narrower than the
 * legacy `UNIT_ADMIN` bucket (which also expanded to governance). These groups
 * are not identical to LEGACY_ROLE_EXPANSION — this is a deliberate narrowing
 * of who may read/write personnel data, not a mechanical rename.
 */
const ADMIN_ROLES = [...ADMIN_ROLE_CODES, ...GOVERNANCE_ROLE_CODES];
const TEACHER_ROLES = [
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...PT_ACADEMIC_ROLE_CODES,
];
const STAFF_ROLES = [
  ...TATA_USAHA_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
  ...PT_STAFF_ROLE_CODES,
  ...SUPPORT_ROLE_CODES,
  ...BUSINESS_ROLE_CODES,
];

router.use(authenticate);

// ==================== STAFF ====================

/**
 * @swagger
 * /api/hr/staff:
 *   get:
 *     summary: List staff members
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
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
 *         description: List of staff members
 */
router.get(
  '/employees',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  validateQuery(queryEmployeesSchema),
  controller.getEmployees
);

/**
 * @swagger
 * /api/hr/employees/{id}:
 *   get:
 *     summary: Get one employee (teacher or staff) by user id
 *     tags: [HR]
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
 *         description: Employee detail
 *       404:
 *         description: Employee not found
 */
// Registered before `/employees/:userId/documents` for readability; Express
// matches on the full path, so the sibling document/history routes are
// unaffected by the order.
router.get(
  '/employees/:id',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.getEmployeeById
);

router.get(
  '/staff',
  authorize(...ADMIN_ROLES),
  validateQuery(queryStaffSchema),
  controller.getStaffList
);

/**
 * @swagger
 * /api/hr/teachers:
 *   get:
 *     summary: List teachers (for pickers and directories)
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, ON_LEAVE]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated teacher list with user + unit info
 */
router.get(
  '/teachers',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  validateQuery(queryTeachersSchema),
  controller.getTeachers
);

/**
 * @swagger
 * /api/hr/staff/{id}:
 *   get:
 *     summary: Get staff member by ID
 *     tags: [HR]
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
 *         description: Staff member details
 */
router.get(
  '/staff/:id',
  authorize(...ADMIN_ROLES),
  controller.getStaffById
);

// ==================== STAFF ATTENDANCE ====================

/**
 * @swagger
 * /api/hr/attendance:
 *   get:
 *     summary: List staff attendance
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
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
 *         description: List of staff attendance records
 */
router.get(
  '/attendance',
  authorize(...ADMIN_ROLES),
  validateQuery(queryStaffAttendanceSchema),
  controller.getStaffAttendance
);

/**
 * @swagger
 * /api/hr/attendance:
 *   post:
 *     summary: Record staff attendance
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - staffId
 *               - date
 *               - status
 *             properties:
 *               staffId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [PRESENT, ABSENT, LATE, LEAVE, SICK]
 *               checkIn:
 *                 type: string
 *                 format: date-time
 *               checkOut:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Attendance recorded
 */
router.post(
  '/attendance',
  authorize(...ADMIN_ROLES),
  controller.createStaffAttendance
);

/**
 * @swagger
 * /api/hr/attendance/bulk:
 *   post:
 *     summary: Record bulk staff attendance
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - records
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     staffId:
 *                       type: string
 *                     status:
 *                       type: string
 *     responses:
 *       201:
 *         description: Bulk attendance recorded
 */
router.post(
  '/attendance/bulk',
  authorize(...ADMIN_ROLES),
  controller.recordBulkAttendance
);

/**
 * @swagger
 * /api/hr/attendance/{id}:
 *   get:
 *     summary: Get attendance record by ID
 *     tags: [HR]
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
 *         description: Attendance record details
 */
router.get(
  '/attendance/:id',
  authorize(...ADMIN_ROLES),
  controller.getStaffAttendanceById
);

/**
 * @swagger
 * /api/hr/attendance/{id}:
 *   put:
 *     summary: Update attendance record
 *     tags: [HR]
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
 *         description: Attendance updated
 */
router.put(
  '/attendance/:id',
  authorize(...ADMIN_ROLES),
  controller.updateStaffAttendance
);

/**
 * @swagger
 * /api/hr/attendance/{id}:
 *   delete:
 *     summary: Delete attendance record
 *     tags: [HR]
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
 *         description: Attendance deleted
 */
router.delete(
  '/attendance/:id',
  authorize(...ADMIN_ROLES),
  controller.deleteStaffAttendance
);

/**
 * @swagger
 * /api/hr/staff/{staffId}/attendance/summary:
 *   get:
 *     summary: Get staff attendance summary
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Staff attendance summary (present, absent, late counts)
 */
router.get(
  '/staff/:staffId/attendance/summary',
  authorize(...ADMIN_ROLES, ...STAFF_ROLES),
  controller.getStaffAttendanceSummary
);

// ==================== LEAVES ====================

/**
 * @swagger
 * /api/hr/leaves:
 *   get:
 *     summary: List leave requests
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, CANCELLED]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ANNUAL, SICK, PERSONAL, MATERNITY, PATERNITY]
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
 *         description: List of leave requests
 */
router.get(
  '/leaves',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  validateQuery(queryLeaveSchema),
  controller.getLeaves
);

/**
 * @swagger
 * /api/hr/leaves:
 *   post:
 *     summary: Create leave request
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - startDate
 *               - endDate
 *               - reason
 *             properties:
 *               staffId:
 *                 type: string
 *               teacherId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [ANNUAL, SICK, PERSONAL, MATERNITY, PATERNITY]
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Leave request created
 */
router.post(
  '/leaves',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.createLeave
);

/**
 * @swagger
 * /api/hr/leaves/{id}:
 *   get:
 *     summary: Get leave request by ID
 *     tags: [HR]
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
 *         description: Leave request details
 */
router.get(
  '/leaves/:id',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.getLeaveById
);

/**
 * @swagger
 * /api/hr/leaves/{id}:
 *   put:
 *     summary: Update leave request
 *     tags: [HR]
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
 *         description: Leave request updated
 */
router.put(
  '/leaves/:id',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.updateLeave
);

/**
 * @swagger
 * /api/hr/leaves/{id}/approve:
 *   patch:
 *     summary: Approve or reject leave request
 *     tags: [HR]
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
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Leave request approved/rejected
 */
router.patch(
  '/leaves/:id/approve',
  authorize(...ADMIN_ROLES),
  controller.approveLeave
);

/**
 * @swagger
 * /api/hr/leaves/{id}/cancel:
 *   patch:
 *     summary: Cancel leave request
 *     tags: [HR]
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
 *         description: Leave request cancelled
 */
router.patch(
  '/leaves/:id/cancel',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.cancelLeave
);

/**
 * @swagger
 * /api/hr/leaves/{id}:
 *   delete:
 *     summary: Delete leave request
 *     tags: [HR]
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
 *         description: Leave request deleted
 */
router.delete(
  '/leaves/:id',
  authorize(...ADMIN_ROLES),
  controller.deleteLeave
);

/**
 * @swagger
 * /api/hr/staff/{staffId}/leave-balance:
 *   get:
 *     summary: Get staff leave balance
 *     tags: [HR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff leave balance by type
 */
router.get(
  '/staff/:staffId/leave-balance',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  controller.getLeaveBalance
);

router.get(
  '/analytics/retention-risk',
  authorize(...ADMIN_ROLES),
  controller.getRetentionRisk
);

// ==================== DEPARTMENTS ====================

router.post(
  '/departments',
  authorize(...ADMIN_ROLES),
  departmentController.create
);
router.get(
  '/departments',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  departmentController.findAll
);
router.get(
  '/departments/:id',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  departmentController.findOne
);
router.patch(
  '/departments/:id',
  authorize(...ADMIN_ROLES),
  departmentController.update
);
router.delete(
  '/departments/:id',
  authorize(...ADMIN_ROLES),
  departmentController.delete
);

// ==================== CONTRACTS ====================

router.post(
  '/contracts',
  authorize(...ADMIN_ROLES),
  contractController.create
);
router.get(
  '/contracts',
  authorize(...ADMIN_ROLES),
  contractController.findAll
);
router.get(
  '/contracts/expiring',
  authorize(...ADMIN_ROLES),
  contractController.getExpiring
);
router.get(
  '/contracts/user/:userId',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  contractController.findByUser
);
router.patch(
  '/contracts/:id',
  authorize(...ADMIN_ROLES),
  contractController.update
);

// ==================== EMPLOYEE DOCUMENTS ====================

router.get(
  '/employees/:userId/documents',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  employeeDocumentController.findAll
);
router.post(
  '/documents',
  authorize(...ADMIN_ROLES),
  employeeDocumentController.create
);
router.delete(
  '/documents/:id',
  authorize(...ADMIN_ROLES),
  employeeDocumentController.delete
);

// ==================== EMPLOYMENT HISTORY ====================

router.get(
  '/employees/:userId/history',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  employmentHistoryController.findAll
);
router.post(
  '/history',
  authorize(...ADMIN_ROLES),
  employmentHistoryController.create
);

// ==================== LEAVE BALANCES (ENHANCED) ====================

router.get(
  '/leave-balances/user/:userId',
  authorize(...ADMIN_ROLES, ...TEACHER_ROLES, ...STAFF_ROLES),
  leaveBalanceController.getBalances
);
router.post(
  '/leave-balances/initialize',
  authorize(...ADMIN_ROLES),
  leaveBalanceController.initialize
);
router.patch(
  '/leave-balances/:id',
  authorize(...ADMIN_ROLES),
  leaveBalanceController.update
);

export default router;
