import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { studentService } from './student.service';
import { ListStudentsQuery, CreateStudentInput, UpdateStudentInput } from './student.schema';

/**
 * List students
 * GET /api/students
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  // Read only what `validateQuery` produced. Express 5 makes `req.query`
  // read-only; the middleware parks the parsed result in
  // `res.locals.validatedQuery`. Falling back to the raw `req.query` here
  // would bypass that schema (CodeQL js/sensitive-get-query flagged `gender`
  // arriving from the raw query string) and would also lose the schema's
  // page/limit defaults.
  const query = res.locals.validatedQuery as ListStudentsQuery;
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
