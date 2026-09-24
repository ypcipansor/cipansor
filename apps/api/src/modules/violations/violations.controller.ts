import { Request, Response, NextFunction } from 'express';
import * as violationService from './violations.service';
import {
  createViolationSchema,
  updateViolationSchema,
  queryViolationSchema,
} from './violations.schema';
import { Errors } from '../../middleware/error';

export async function createViolation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createViolationSchema.parse(req.body);
    const userId = req.user?.sub;

    if (!userId) {
      throw Errors.unauthorized();
    }

    const violation = await violationService.createViolation(data, userId);
    res.status(201).json({
      success: true,
      message: 'Violation recorded successfully',
      data: violation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getViolations(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryViolationSchema.parse(res.locals.validatedQuery || req.query);
    const result = await violationService.getViolations(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getViolationById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const violation = await violationService.getViolationById(id);
    if (!violation) {
      throw Errors.notFound('Violation');
    }
    res.json({
      success: true,
      data: violation,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateViolation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateViolationSchema.parse(req.body);
    const violation = await violationService.updateViolation(id, data);
    res.json({
      success: true,
      message: 'Violation updated successfully',
      data: violation,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteViolation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await violationService.deleteViolation(id);
    res.json({
      success: true,
      message: 'Violation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentViolationSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = req.params;
    const summary = await violationService.getStudentViolationSummary(studentId);
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

export async function getViolationCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await violationService.getViolationCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}
