import { Request, Response, NextFunction } from 'express';
import { contractService } from './contracts.service';
import { sendResponse } from '@/utils/response';
import { Errors } from '@/middleware/error';

export const contractController = {
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await contractService.create({
        ...req.body,
        actorId: req.user?.sub,
        startDate: new Date(req.body.startDate),
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      });
      sendResponse(res, result, 'Contract created successfully', 201);
    } catch (error) {
      next(error);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await contractService.update(id, {
        ...req.body,
        actorId: req.user?.sub,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      });
      sendResponse(res, result, 'Contract updated successfully');
    } catch (error) {
      next(error);
    }
  },

  findAll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { unitId } = req.user!;
      if (!unitId) throw Errors.badRequest('Unit ID missing from user');

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;

      const result = await contractService.findAll(unitId, { page, limit, search, status });
      sendResponse(res, result, 'Contracts retrieved successfully');
    } catch (error) {
      next(error);
    }
  },

  findByUser: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const result = await contractService.findByUser(userId);
      sendResponse(res, result, 'User contracts retrieved successfully');
    } catch (error) {
      next(error);
    }
  },

  getExpiring: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { unitId } = req.user!;
      if (!unitId) throw Errors.badRequest('Unit ID missing from user');

      const days = Number(req.query.days) || 30;
      const result = await contractService.findExpiring(unitId, days);
      sendResponse(res, result, 'Expiring contracts retrieved successfully');
    } catch (error) {
      next(error);
    }
  },
};
