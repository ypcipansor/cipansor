import { Request, Response, NextFunction } from 'express';
import * as rewardService from './rewards.service';
import { createRewardSchema, updateRewardSchema, queryRewardSchema } from './rewards.schema';
import { Errors } from '../../middleware/error';

export async function createReward(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRewardSchema.parse(req.body);
    const userId = req.user?.sub;

    if (!userId) {
      throw Errors.unauthorized();
    }

    const reward = await rewardService.createReward(data, userId);
    res.status(201).json({
      success: true,
      message: 'Reward recorded successfully',
      data: reward,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRewards(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryRewardSchema.parse(res.locals.validatedQuery || req.query);
    const result = await rewardService.getRewards(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRewardById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const reward = await rewardService.getRewardById(id);
    if (!reward) {
      throw Errors.notFound('Reward');
    }
    res.json({
      success: true,
      data: reward,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateReward(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateRewardSchema.parse(req.body);
    const reward = await rewardService.updateReward(id, data);
    res.json({
      success: true,
      message: 'Reward updated successfully',
      data: reward,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteReward(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await rewardService.deleteReward(id);
    res.json({
      success: true,
      message: 'Reward deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentRewardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = req.params;
    const summary = await rewardService.getStudentRewardSummary(studentId);
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentPointBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = req.params;
    const balance = await rewardService.getStudentPointBalance(studentId);
    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRewardCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await rewardService.getRewardCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRewardCategoryById(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await rewardService.getRewardCategoryById(req.params.id);
    if (!category) throw Errors.notFound('Reward category');
    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTopStudentsByPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const unitId = req.query.unitId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const topStudents = await rewardService.getTopStudentsByPoints(unitId, limit);
    res.json({
      success: true,
      data: topStudents,
    });
  } catch (error) {
    next(error);
  }
}
