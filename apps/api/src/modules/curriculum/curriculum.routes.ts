import { Router } from 'express';
import * as controller from './curriculum.controller';
import {
  assignTeacherSubjectSchema,
  createSubjectSchema,
  CURRICULUM_MANAGER_ROLE_CODES,
} from '@cipansor/shared';
import { authenticate, authorize, isTeacherOrAbove } from '@/middleware/auth';
import { validate } from '@/middleware/error';
import { updateSubjectSchema } from './curriculum.schema';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Subjects, teaching assignments, lesson plans and the timetable are set by
// teachers and the school's leadership. Until 2026-09-24 every write here
// accepted any signed-in account, santri and wali included. Reads stay open:
// the santri dashboard shows its timetable from /schedules.
router.use((req, res, next) => (req.method === 'GET' ? next() : isTeacherOrAbove(req, res, next)));

/**
 * A unit's subjects and their guru pengampu are kept by its admin, kepala
 * sekolah and wakasek (and the super admin); the service holds each of them to
 * their own unit. One list, which the web reads to show its buttons.
 */
const manageSubjects = authorize(...CURRICULUM_MANAGER_ROLE_CODES);

// ==================== SUBJECTS ====================

/**
 * @swagger
 * /api/curriculum/subjects:
 *   get:
 *     summary: List subjects
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of subjects
 */
router.get('/subjects', controller.getSubjects);

/**
 * @swagger
 * /api/curriculum/subjects/{id}:
 *   get:
 *     summary: Get subject by ID
 *     tags: [Curriculum]
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
 *         description: Subject details
 */
router.get('/subjects/:id', controller.getSubjectById);

/**
 * @swagger
 * /api/curriculum/subjects:
 *   post:
 *     summary: Create subject
 *     tags: [Curriculum]
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
 *               - code
 *               - unitId
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               unitId:
 *                 type: string
 *               description:
 *                 type: string
 *               credits:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Subject created
 */
router.post('/subjects', manageSubjects, validate(createSubjectSchema), controller.createSubject);

/**
 * @swagger
 * /api/curriculum/subjects/{id}:
 *   patch:
 *     summary: Update subject
 *     tags: [Curriculum]
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
 *         description: Subject updated
 */
router.patch(
  '/subjects/:id',
  manageSubjects,
  validate(updateSubjectSchema),
  controller.updateSubject
);

/**
 * @swagger
 * /api/curriculum/subjects/{id}:
 *   delete:
 *     summary: Delete subject
 *     tags: [Curriculum]
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
 *         description: Subject deleted
 */
router.delete('/subjects/:id', manageSubjects, controller.deleteSubject);

// ==================== TEACHER SUBJECTS ====================

/**
 * @swagger
 * /api/curriculum/teacher-subjects:
 *   post:
 *     summary: Assign teacher to subject
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teacherId
 *               - subjectId
 *               - classId
 *             properties:
 *               teacherId:
 *                 type: string
 *               subjectId:
 *                 type: string
 *               classId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Teacher assigned to subject
 */
router.post(
  '/teacher-subjects',
  manageSubjects,
  validate(assignTeacherSubjectSchema),
  controller.assignTeacherToSubject
);

/**
 * @swagger
 * /api/curriculum/teacher-subjects/{id}:
 *   delete:
 *     summary: Remove teacher from subject
 *     tags: [Curriculum]
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
 *         description: Assignment removed
 */
router.delete('/teacher-subjects/:id', manageSubjects, controller.removeTeacherFromSubject);

/**
 * @swagger
 * /api/curriculum/teachers/{teacherId}/subjects:
 *   get:
 *     summary: Get teacher's subjects
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of subjects assigned to teacher
 */
router.get('/teachers/:teacherId/subjects', controller.getTeacherSubjects);

// ==================== LESSON PLANS ====================

/**
 * @swagger
 * /api/curriculum/lesson-plans:
 *   get:
 *     summary: List lesson plans
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teacherId
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
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
 *         description: List of lesson plans
 */
router.get('/lesson-plans', controller.getLessonPlans);

/**
 * @swagger
 * /api/curriculum/lesson-plans/{id}:
 *   get:
 *     summary: Get lesson plan by ID
 *     tags: [Curriculum]
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
 *         description: Lesson plan details
 */
router.get('/lesson-plans/:id', controller.getLessonPlanById);

/**
 * @swagger
 * /api/curriculum/lesson-plans:
 *   post:
 *     summary: Create lesson plan
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teacherSubjectId
 *               - title
 *               - objectives
 *             properties:
 *               teacherSubjectId:
 *                 type: string
 *               title:
 *                 type: string
 *               objectives:
 *                 type: array
 *                 items:
 *                   type: string
 *               content:
 *                 type: string
 *               activities:
 *                 type: string
 *               materials:
 *                 type: string
 *               scheduledDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Lesson plan created
 */
router.post('/lesson-plans', controller.createLessonPlan);

/**
 * @swagger
 * /api/curriculum/lesson-plans/{id}:
 *   patch:
 *     summary: Update lesson plan
 *     tags: [Curriculum]
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
 *         description: Lesson plan updated
 */
router.patch('/lesson-plans/:id', controller.updateLessonPlan);

/**
 * @swagger
 * /api/curriculum/lesson-plans/{id}:
 *   delete:
 *     summary: Delete lesson plan
 *     tags: [Curriculum]
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
 *         description: Lesson plan deleted
 */
router.delete('/lesson-plans/:id', controller.deleteLessonPlan);

/**
 * @swagger
 * /api/curriculum/lesson-plans/{id}/complete:
 *   post:
 *     summary: Mark lesson plan as complete
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lesson plan marked complete
 */
router.post('/lesson-plans/:id/complete', controller.markLessonPlanComplete);

// ==================== SCHEDULES ====================

/**
 * @swagger
 * /api/curriculum/schedules:
 *   get:
 *     summary: List schedules
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: day
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 6
 *     responses:
 *       200:
 *         description: List of schedules
 */
router.get('/schedules', controller.getSchedules);

/**
 * @swagger
 * /api/curriculum/schedules/{id}:
 *   get:
 *     summary: Get schedule by ID
 *     tags: [Curriculum]
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
 *         description: Schedule details
 */
router.get('/schedules/:id', controller.getScheduleById);

/**
 * @swagger
 * /api/curriculum/schedules:
 *   post:
 *     summary: Create schedule
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teacherSubjectId
 *               - day
 *               - startTime
 *               - endTime
 *             properties:
 *               teacherSubjectId:
 *                 type: string
 *               day:
 *                 type: integer
 *                 description: 0=Sunday, 1=Monday, etc.
 *               startTime:
 *                 type: string
 *                 format: time
 *               endTime:
 *                 type: string
 *                 format: time
 *               room:
 *                 type: string
 *     responses:
 *       201:
 *         description: Schedule created
 */
router.post('/schedules', controller.createSchedule);

/**
 * @swagger
 * /api/curriculum/schedules/{id}:
 *   patch:
 *     summary: Update schedule
 *     tags: [Curriculum]
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
 *         description: Schedule updated
 */
router.patch('/schedules/:id', controller.updateSchedule);

/**
 * @swagger
 * /api/curriculum/schedules/{id}:
 *   delete:
 *     summary: Delete schedule
 *     tags: [Curriculum]
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
 *         description: Schedule deleted
 */
router.delete('/schedules/:id', controller.deleteSchedule);

// ==================== SCHEDULE LOOKUPS ====================

/**
 * @swagger
 * /api/curriculum/classes/{classId}/schedule:
 *   get:
 *     summary: Get class schedule
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weekly schedule for class
 */
router.get('/classes/:classId/schedule', controller.getClassSchedule);

/**
 * @swagger
 * /api/curriculum/teachers/{teacherId}/schedule:
 *   get:
 *     summary: Get teacher schedule
 *     tags: [Curriculum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weekly schedule for teacher
 */
router.get('/teachers/:teacherId/schedule', controller.getTeacherSchedule);

export default router;
