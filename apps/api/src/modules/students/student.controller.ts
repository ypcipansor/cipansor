import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { studentService } from './student.service';
import { ListStudentsQuery, CreateStudentInput, UpdateStudentInput } from './student.schema';

/**
 * List students
 * GET /api/students
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = (res.locals.validatedQuery || req.query) as ListStudentsQuery;
  const result = await studentService.findAll(query, {
    role: req.user!.role,
    roleCode: req.user!.roleCode,
    unitId: req.user!.unitId,
  });

  res.json({
    success: true,
    data: result.students,
    meta: {
      pagination: result.pagination,
    },
  });
});

/**
 * Lookup internal alumni by NIK or NISN for re-enrollment
 * GET /api/students/alumni/lookup
 */
export const lookupAlumni = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.query;
  const student = await studentService.findInternalAlumniByIdentifier(String(identifier || ''));

  res.json({
    success: true,
    data: student,
  });
});

/**
 * Get student by ID
 * GET /api/students/:id
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const student = await studentService.findById(id);

  res.json({
    success: true,
    data: student,
  });
});

/**
 * Get complete student profile (Student 360 view)
 * GET /api/students/:id/complete-profile
 */
export const getCompleteProfile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const student = await studentService.getCompleteProfile(id);

  res.json({
    success: true,
    data: student,
  });
});

/**
 * Create student
 * POST /api/students
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const input: CreateStudentInput = req.body;
  const student = await studentService.create(input);

  res.status(201).json({
    success: true,
    data: student,
  });
});

/**
 * Mark student as graduated
 * POST /api/students/:id/graduate
 */
export const graduate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { graduateYear, graduationDate } = req.body;

  let year: number | undefined;
  if (graduateYear) {
    year = Number(graduateYear);
  } else if (graduationDate) {
    year = new Date(graduationDate).getFullYear();
  }

  const student = await studentService.graduateStudent(id, year);

  res.json({
    success: true,
    data: student,
    message: 'Santri berhasil dinyatakan lulus',
  });
});

/**
 * Update student
 * PUT /api/students/:id
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: UpdateStudentInput = req.body;
  const student = await studentService.update(id, input);

  res.json({
    success: true,
    data: student,
  });
});

/**
 * Delete student
 * DELETE /api/students/:id
 */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await studentService.delete(id);

  res.json({
    success: true,
    data: result,
  });
});
