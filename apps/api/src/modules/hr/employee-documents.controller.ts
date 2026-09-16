import { Request, Response, NextFunction } from 'express';
import { employeeDocumentService, type EmployeeDocumentActor } from './employee-documents.service';
import { requireUser } from '../../middleware/auth';
import { z } from 'zod';
import { EmployeeDocumentType } from '@prisma/client';

const createDocumentSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  type: z.nativeEnum(EmployeeDocumentType),
  fileUrl: z.string().url(),
  expiryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

/** The authenticated actor, used by the service for ownership/unit checks. */
function actorOf(req: Request): EmployeeDocumentActor {
  const user = requireUser(req);
  return { id: user.id, roleCode: user.roleCode, unitId: user.unitId };
}

export const employeeDocumentController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createDocumentSchema.parse(req.body);
      const result = await employeeDocumentService.create(data, actorOf(req));
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const result = await employeeDocumentService.findAll(userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await employeeDocumentService.delete(req.params.id, actorOf(req));
      res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
      next(error);
    }
  },
};
