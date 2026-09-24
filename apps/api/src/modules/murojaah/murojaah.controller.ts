import { Request, Response, NextFunction } from 'express';
import { murojaahService } from './murojaah.service';
import { ApiResponse } from '@/utils/response';
import { assertStudentInScope } from '@/utils/student-scope';

// ============================================
// Murojaah Controllers
// ============================================

/**
 * List murojaah records with filters
 */
export const listMurojaah = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // `validateQuery` parks the parsed result in `res.locals.validatedQuery`
    // (Express 5 makes `req.query` read-only). Reading `req.query` directly
    // discarded the schema's page=1/limit=20 defaults, so a call that omitted
    // `page` computed `skip: NaN` and Prisma answered with a 500.
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.findAll(query, req.user!);
    res.json(
      ApiResponse.paginated(
        result.records,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get single murojaah record by ID
 */
export const getMurojaahById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const record = await murojaahService.findById(id, req.user!);
    res.json(ApiResponse.success(record));
  } catch (error) {
    next(error);
  }
};

/**
 * Create new murojaah record
 */
export const createMurojaah = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.id;
    const record = await murojaahService.create(req.body, userId);
    res.status(201).json(ApiResponse.success(record, 'Murojaah record created successfully'));
  } catch (error) {
    next(error);
  }
};

/**
 * Update murojaah record
 */
export const updateMurojaah = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const record = await murojaahService.update(id, req.body);
    res.json(ApiResponse.success(record, 'Murojaah record updated successfully'));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete murojaah record
 */
export const deleteMurojaah = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await murojaahService.delete(id);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Add mistake to murojaah record
 */
export const addMistake = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mistake = await murojaahService.addMistake(req.body);
    res.status(201).json(ApiResponse.success(mistake, 'Mistake added successfully'));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete mistake from murojaah record
 */
export const deleteMistake = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await murojaahService.deleteMistake(id);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Get student murojaah history
 */
export const getStudentHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.getStudentHistory(studentId, query, req.user!);
    res.json(
      ApiResponse.paginated(
        result.records,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get student murojaah summary/statistics
 */
export const getStudentSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    await assertStudentInScope(studentId, req.user!);
    const query = { ...req.query, studentId } as any;
    const summary = await murojaahService.getStudentSummary(query);
    res.json(ApiResponse.success(summary));
  } catch (error) {
    next(error);
  }
};

/**
 * Get halaqoh murojaah records
 */
export const getHalaqohRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { halaqohId } = req.params;
    const query = { halaqohId, ...req.query } as any;
    const result = await murojaahService.getHalaqohRecords(query);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Get murojaah schedule recommendation for student
 */
export const getMurojaahSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    await assertStudentInScope(studentId, req.user!);
    const schedule = await murojaahService.getMurojaahSchedule(studentId);
    res.json(ApiResponse.success(schedule));
  } catch (error) {
    next(error);
  }
};

// ============================================
// Analytics Controllers
// ============================================

/**
 * Get quality distribution analytics
 */
export const getQualityDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.getQualityDistribution(query);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Get mistake patterns analytics
 */
export const getMistakePatterns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.getMistakePatterns(query);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Get consistency score analytics
 */
export const getConsistencyScore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.getConsistencyScore(query);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};

/**
 * Get top performers
 */
export const getTopPerformers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (res.locals.validatedQuery || req.query) as any;
    const result = await murojaahService.getTopPerformers(query);
    res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
};
