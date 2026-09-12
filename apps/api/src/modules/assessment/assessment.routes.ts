import { Router } from 'express';
import * as controller from './assessment.controller';
import * as reportsController from './reports.controller';
import { RaportMerdekaController } from './raport-merdeka.controller';
import { P5ProjectController } from './p5-project.controller';
import { UnifiedRaportController } from './unified-raport.controller';
import { authenticate, authorize, isTeacherOrAbove } from '@/middleware/auth';
import { UserRole, RoleCode } from '@prisma/client';
import { validateQuery } from '@/middleware/error';
import { raportMerdekaQuerySchema } from '@cipansor/shared';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==================== EXAMS ====================

router.get('/exams/:id/analytics', controller.getExamAnalytics);
router.get('/units/:unitId/analytics', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER), controller.getUnitEducationAnalytics);
router.get('/analytics/integrated-alerts', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER), controller.getIntegratedRiskAlerts);
router.get('/students/:studentId/holistic', authorize(UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN, UserRole.TEACHER), controller.getStudentHolisticAnalytics);

/**
 * @swagger
 * /api/assessment/exams:
 *   get:
 *     summary: List exams
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subjectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DAILY_TEST, QUIZ, MIDTERM, FINAL, PRACTICAL, PROJECT, TAHFIDZ_TEST]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SCHEDULED, ONGOING, COMPLETED, GRADED]
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
 *         description: List of exams
 */
router.get('/exams', controller.getExams);

/**
 * @swagger
 * /api/assessment/exams/{id}:
 *   get:
 *     summary: Get exam by ID
 *     tags: [Assessment]
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
 *         description: Exam details
 */
router.get('/exams/:id', controller.getExamById);

/**
 * @swagger
 * /api/assessment/exams:
 *   post:
 *     summary: Create exam
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - subjectId
 *               - classId
 *               - type
 *               - maxScore
 *               - scheduledAt
 *             properties:
 *               title:
 *                 type: string
 *               subjectId:
 *                 type: string
 *               classId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [DAILY_TEST, QUIZ, MIDTERM, FINAL, PRACTICAL, PROJECT, TAHFIDZ_TEST]
 *               maxScore:
 *                 type: number
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               duration:
 *                 type: integer
 *                 description: Duration in minutes
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Exam created
 */
router.post('/exams', controller.createExam);

/**
 * @swagger
 * /api/assessment/exams/{id}:
 *   patch:
 *     summary: Update exam
 *     tags: [Assessment]
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
 *         description: Exam updated
 */
router.patch('/exams/:id', controller.updateExam);

/**
 * @swagger
 * /api/assessment/exams/{id}:
 *   delete:
 *     summary: Delete exam
 *     tags: [Assessment]
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
 *         description: Exam deleted
 */
router.delete('/exams/:id', controller.deleteExam);

/**
 * @swagger
 * /api/assessment/exams/{id}/status:
 *   patch:
 *     summary: Update exam status
 *     tags: [Assessment]
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
 *                 enum: [SCHEDULED, ONGOING, COMPLETED, GRADED]
 *     responses:
 *       200:
 *         description: Exam status updated
 */
router.patch('/exams/:id/status', controller.updateExamStatus);

/**
 * @swagger
 * /api/assessment/grades/exam/{examId}:
 *   get:
 *     summary: Get grades for an exam
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of grades for the exam
 */
router.get('/grades/exam/:examId', controller.getExamGrades);

// ==================== GRADES ====================

/**
 * @swagger
 * /api/assessment/grades:
 *   get:
 *     summary: List grades
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: examId
 *         schema:
 *           type: string
 *       - in: query
 *         name: studentId
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
 *         description: List of grades
 */
router.get('/grades', controller.getGrades);

/**
 * @swagger
 * /api/assessment/grades/{id}:
 *   get:
 *     summary: Get grade by ID
 *     tags: [Assessment]
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
 *         description: Grade details
 */
router.get('/grades/:id', controller.getGradeById);

/**
 * @swagger
 * /api/assessment/grades:
 *   post:
 *     summary: Create grade
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - examId
 *               - studentId
 *               - score
 *             properties:
 *               examId:
 *                 type: string
 *               studentId:
 *                 type: string
 *               score:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Grade created
 */
router.post('/grades', controller.createGrade);

/**
 * @swagger
 * /api/assessment/grades/bulk:
 *   post:
 *     summary: Bulk create grades
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - examId
 *               - grades
 *             properties:
 *               examId:
 *                 type: string
 *               grades:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     studentId:
 *                       type: string
 *                     score:
 *                       type: number
 *     responses:
 *       201:
 *         description: Grades created
 */
router.post('/grades/bulk', controller.bulkCreateGrades);

/**
 * @swagger
 * /api/assessment/grades/{id}:
 *   patch:
 *     summary: Update grade
 *     tags: [Assessment]
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
 *         description: Grade updated
 */
router.patch('/grades/:id', controller.updateGrade);

/**
 * @swagger
 * /api/assessment/grades/{id}:
 *   delete:
 *     summary: Delete grade
 *     tags: [Assessment]
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
 *         description: Grade deleted
 */
router.delete('/grades/:id', controller.deleteGrade);

// ==================== STUDENT GRADES ====================

/**
 * @swagger
 * /api/assessment/grades/student/{studentId}:
 *   get:
 *     summary: Get student grades
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: subjectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student's grades
 */
router.get('/grades/student/:studentId', controller.getStudentGrades);

// ==================== REPORT CARDS ====================

/**
 * @swagger
 * /api/assessment/report-cards:
 *   get:
 *     summary: List report cards
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         schema:
 *           type: integer
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
 *         description: List of report cards
 */
router.get('/report-cards', controller.getReportCards);

/**
 * @swagger
 * /api/assessment/report-cards/{id}:
 *   get:
 *     summary: Get report card by ID
 *     tags: [Assessment]
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
 *         description: Report card details with grades
 */
router.get('/report-cards/:id', controller.getReportCardById);

/**
 * @swagger
 * /api/assessment/report-cards:
 *   post:
 *     summary: Create report card
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - academicYearId
 *               - semester
 *             properties:
 *               studentId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               semester:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Report card created
 */
router.post('/report-cards', controller.createReportCard);

/**
 * @swagger
 * /api/assessment/report-cards/generate:
 *   post:
 *     summary: Generate report cards for class
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - academicYearId
 *               - semester
 *             properties:
 *               classId:
 *                 type: string
 *               academicYearId:
 *                 type: string
 *               semester:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Report cards generated
 */
router.post('/report-cards/generate', controller.generateReportCard);

/**
 * @swagger
 * /api/assessment/report-cards/{id}:
 *   patch:
 *     summary: Update report card
 *     tags: [Assessment]
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
 *         description: Report card updated
 */
router.patch('/report-cards/:id', controller.updateReportCard);

/**
 * @swagger
 * /api/assessment/report-cards/{id}:
 *   delete:
 *     summary: Delete report card
 *     tags: [Assessment]
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
 *         description: Report card deleted
 */
router.delete('/report-cards/:id', controller.deleteReportCard);

/**
 * @swagger
 * /api/assessment/report-cards/{id}/publish:
 *   post:
 *     summary: Publish report card
 *     tags: [Assessment]
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
 *         description: Report card published
 */
router.patch('/report-cards/:id/publish', controller.publishReportCard);

// ==================== SKHUN & TRANSKRIP ====================

/**
 * @swagger
 * /api/assessment/reports/skhun:
 *   get:
 *     summary: Generate SKHUN for a student
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: examPeriod
 *         schema:
 *           type: string
 *           enum: [UTAMA, SUSULAN]
 *     responses:
 *       200:
 *         description: SKHUN data generated
 */
router.get('/reports/skhun', reportsController.getSkhun);

/**
 * @swagger
 * /api/assessment/reports/skhun/bulk:
 *   get:
 *     summary: Generate bulk SKHUN for a class
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk SKHUN data generated
 */
router.get('/reports/skhun/bulk', reportsController.getBulkSkhun);

/**
 * @swagger
 * /api/assessment/reports/skhun/export:
 *   get:
 *     summary: Export SKHUN to Excel format
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SKHUN export data
 */
router.get('/reports/skhun/export', reportsController.exportSkhunExcel);

/**
 * @swagger
 * /api/assessment/reports/students/{studentId}/skhun:
 *   get:
 *     summary: Get SKHUN by student ID
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student SKHUN data
 */
router.get('/reports/students/:studentId/skhun', reportsController.getSkhunByStudentId);

/**
 * @swagger
 * /api/assessment/reports/students/{studentId}/transcript:
 *   get:
 *     summary: Generate transcript for a student
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: graduationYear
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transcript data generated
 */
router.get('/reports/students/:studentId/transcript', reportsController.getTranscript);

/**
 * @swagger
 * /api/assessment/reports/students/{studentId}/transcript/export:
 *   get:
 *     summary: Export transcript to Excel format
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transcript export data
 */
router.get(
  '/reports/students/:studentId/transcript/export',
  reportsController.exportTranscriptExcel
);

/**
 * @swagger
 * /api/assessment/reports/transcripts/bulk:
 *   get:
 *     summary: Generate bulk transcripts for a class
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk transcripts generated
 */
router.get('/reports/transcripts/bulk', reportsController.getBulkTranscripts);

/**
 * @swagger
 * /api/assessment/reports/report-cards/{reportCardId}/print:
 *   get:
 *     summary: Get report card print data
 *     tags: [Assessment - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportCardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report card print data
 */
router.get('/reports/report-cards/:reportCardId/print', reportsController.getReportCardPrintData);

// ==================== P5 PROJECTS ====================

router.post('/p5-projects', P5ProjectController.createProject);
router.get('/p5-projects', P5ProjectController.getProjects);
router.get('/p5-projects/:id', P5ProjectController.getProjectById);
router.patch('/p5-projects/:id', P5ProjectController.updateProject);
router.delete('/p5-projects/:id', P5ProjectController.deleteProject);
router.post('/p5-projects/assessments', P5ProjectController.upsertAssessment);
router.post('/p5-projects/assessments/bulk', P5ProjectController.bulkUpsertAssessments);

// ==================== UNIFIED RAPORT ====================

router.get('/unified-raport/students/:studentId', isTeacherOrAbove, UnifiedRaportController.generateUnifiedRaport);
router.get('/unified-raport/print/:studentId', isTeacherOrAbove, UnifiedRaportController.getPrintData);

// ==================== RAPORT MERDEKA (KURIKULUM MERDEKA) ====================

/**
 * @swagger
 * /api/assessment/raport-merdeka/p5-dimensions:
 *   get:
 *     summary: Get 6 Dimensi Profil Pelajar Pancasila (P5)
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 6 dimensions of P5 with elements
 */
router.get('/raport-merdeka/p5-dimensions', RaportMerdekaController.getP5Dimensions);

/**
 * @swagger
 * /api/assessment/raport-merdeka/cp/{subjectCode}/{gradeLevel}:
 *   get:
 *     summary: Get Capaian Pembelajaran (CP) mapping
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subjectCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject code (e.g., MTK, THF)
 *       - in: path
 *         name: gradeLevel
 *         required: true
 *         schema:
 *           type: string
 *         description: Grade level range (e.g., 1-2, 3-4, 7-9)
 *     responses:
 *       200:
 *         description: CP mapping with fase and learning outcomes
 */
router.get('/raport-merdeka/cp/:subjectCode/:gradeLevel', RaportMerdekaController.getCPMapping);

/**
 * @swagger
 * /api/assessment/raport-merdeka/tp/{subjectCode}/{fase}:
 *   get:
 *     summary: Get Tujuan Pembelajaran (TP) mapping
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subjectCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject code (e.g., MTK, THF)
 *       - in: path
 *         name: fase
 *         required: true
 *         schema:
 *           type: string
 *           enum: [A, B, C, D, E, F]
 *         description: Learning phase
 *     responses:
 *       200:
 *         description: List of learning objectives
 */
router.get('/raport-merdeka/tp/:subjectCode/:fase', RaportMerdekaController.getTPMapping);

/**
 * @swagger
 * /api/assessment/raport-merdeka/capaian:
 *   get:
 *     summary: Convert score to Capaian Pembelajaran
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: score
 *         required: true
 *         schema:
 *           type: number
 *         description: Score to convert (0-100)
 *     responses:
 *       200:
 *         description: Capaian level with description
 */
router.get('/raport-merdeka/capaian', RaportMerdekaController.getCapaianMapping);

/**
 * @swagger
 * /api/assessment/raport-merdeka/students/{studentId}:
 *   get:
 *     summary: Generate Raport Merdeka for a student
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *     responses:
 *       200:
 *         description: Complete Raport Merdeka with intrakurikuler, P5, ekstrakurikuler
 */
router.get('/raport-merdeka/students/:studentId', isTeacherOrAbove, validateQuery(raportMerdekaQuerySchema), RaportMerdekaController.generateStudentRaport);
router.get('/raport-merdeka/students/:studentId/pdf', isTeacherOrAbove, validateQuery(raportMerdekaQuerySchema), RaportMerdekaController.exportStudentRaportPdf);

/**
 * @swagger
 * /api/assessment/raport-merdeka/classes/{classId}:
 *   get:
 *     summary: Generate bulk Raport Merdeka for a class
 *     tags: [Assessment - Raport Merdeka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: academicYearId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *     responses:
 *       200:
 *         description: Bulk Raport Merdeka for all students in class
 */
router.get('/raport-merdeka/classes/:classId', isTeacherOrAbove, validateQuery(raportMerdekaQuerySchema), RaportMerdekaController.generateClassRaport);

export default router;
