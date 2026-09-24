import { Request, Response, NextFunction } from 'express';
import { businessUnitService } from './business-unit.service';
import { BusinessUnitType } from '@prisma/client';
import { resolveUnitId, isSuperAdminUser } from '@/utils/resolve-unit-id';
import { Errors } from '@/middleware/error';

export const businessUnitController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      // SUPER_ADMIN without a unitId filter can list all business units
      if (!unitId && !isSuperAdminUser(req)) {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      const result = await businessUnitService.list({
        unitId,
        type: req.query.type as BusinessUnitType | undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async getEfficiency(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      if (!unitId && !isSuperAdminUser(req)) {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      // SUPER_ADMIN can view efficiency without unitId scoping
      const result =
        isSuperAdminUser(req) && !unitId
          ? await businessUnitService.getBusinessEfficiency(req.params.id, undefined)
          : await businessUnitService.getBusinessEfficiency(req.params.id, unitId!);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      if (!unitId && !isSuperAdminUser(req)) {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      // SUPER_ADMIN can view any business unit without unitId scoping
      const result =
        isSuperAdminUser(req) && !unitId
          ? await businessUnitService.getById(req.params.id)
          : await businessUnitService.getById(req.params.id, unitId);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);
      if (!unitId) {
        // Note: unitId can only come from the JWT or the query string
        // (e.g. ?unitId=...). It cannot be supplied in the body because
        // CreateBusinessUnitSchema uses .strict() which rejects unknown fields.
        return next(
          Errors.badRequest(
            'Unit ID tidak ditemukan. SUPER_ADMIN harus menyertakan unitId pada query string (mis. ?unitId=...).'
          )
        );
      }

      const result = await businessUnitService.create({ ...req.body, unitId });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      if (!unitId && !isSuperAdminUser(req)) {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      // SUPER_ADMIN can update any business unit without unitId scoping
      const result =
        isSuperAdminUser(req) && !unitId
          ? await businessUnitService.update(req.params.id, undefined, req.body)
          : await businessUnitService.update(req.params.id, unitId!, req.body);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      // SUPER_ADMIN can delete any business unit without unitId scoping
      if (isSuperAdminUser(req) && !unitId) {
        await businessUnitService.delete(req.params.id);
      } else if (unitId) {
        await businessUnitService.delete(req.params.id, unitId);
      } else {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      res.json({ success: true, data: null, message: 'Business unit berhasil dihapus' });
    } catch (error) {
      next(error);
    }
  },

  async getPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const unitId = resolveUnitId(req);

      if (!unitId && !isSuperAdminUser(req)) {
        return next(Errors.badRequest('Unit ID tidak ditemukan'));
      }

      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return next(Errors.badRequest('startDate dan endDate diperlukan'));
      }

      const parsedStart = new Date(startDate as string);
      const parsedEnd = new Date(endDate as string);
      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        return next(Errors.badRequest('Format startDate atau endDate tidak valid'));
      }

      // SUPER_ADMIN can view performance without unitId scoping
      const result =
        isSuperAdminUser(req) && !unitId
          ? await businessUnitService.getPerformance(
              req.params.id,
              undefined,
              parsedStart,
              parsedEnd
            )
          : await businessUnitService.getPerformance(
              req.params.id,
              unitId!,
              parsedStart,
              parsedEnd
            );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
};
