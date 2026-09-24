import { NextFunction, Request, Response } from 'express';
import { TahfidzService, tahfidzService } from './tahfidz.service';
import { CreateTahfidzInput, UpdateTahfidzInput } from '@cipansor/shared';
import { generateCertificateSchema, listTahfidzQuerySchema } from './tahfidz.schema';
import { getQuranProgressMap } from './tahfidz.analytics';
import { requireUser } from '../../middleware/auth';
import { seesAllUnits } from '@/utils/resolve-unit-id';
import { assertStudentInScope } from '@/utils/student-scope';
import { Errors } from '@/middleware/error';

export class TahfidzController {
  private service: TahfidzService;

  constructor() {
    this.service = tahfidzService;
  }

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = requireUser(req);
      const query = listTahfidzQuerySchema.parse(req.query);

      const result = await this.service.findAll(query, currentUser);
      // Standard paginated envelope ({ data: [...], meta: { pagination } }) so
      // consumers (tahfidz list, dashboard) get an array at `.data`, matching
      // every other module. Previously this nested the array under data.records,
      // crashing those pages with "data.map is not a function".
      res.json({
        success: true,
        data: result.records,
        meta: { pagination: result.pagination },
      });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findById(req.params.id, requireUser(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recordedById = requireUser(req).id;
      const input: CreateTahfidzInput = req.body;
      const result = await this.service.create(input, recordedById);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const input: UpdateTahfidzInput = req.body;
      const result = await this.service.update(id, input);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const result = await this.service.delete(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getStudentSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const result = await this.service.getStudentSummary(studentId, requireUser(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // A unit's staff see their own unit; only a cross-unit account (the
      // yayasan board, the muhafidz) may pick one or see all of them.
      const user = requireUser(req);
      const unitId = seesAllUnits(user)
        ? (req.query.unitId as string | undefined)
        : (user.unitId ?? undefined);
      if (!unitId && !seesAllUnits(user)) throw Errors.forbidden('No unit on this account');
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;

      const result = await this.service.getDashboardStats({ unitId, year, month });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  generateCertificate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const createdById = requireUser(req).id;
      const input = generateCertificateSchema.parse(req.body);
      const result = await this.service.generateCertificate(input, createdById);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getQuranMap = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      await assertStudentInScope(studentId, requireUser(req));
      const result = await getQuranProgressMap(studentId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
