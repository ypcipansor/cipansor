import { Request, Response } from 'express';
import { employeeDocumentService, type EmployeeDocumentActor } from './employee-documents.service';
import { requireUser } from '../../middleware/auth';
import { z } from 'zod';
import { EmployeeDocumentType } from '@prisma/client';
import { asyncHandler } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';

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
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = createDocumentSchema.parse(req.body);
    const result = await employeeDocumentService.create(data, actorOf(req));
    res.status(201).json(ApiResponse.success(result));
  }),

  findAll: asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const result = await employeeDocumentService.findAll(userId, actorOf(req));
    res.json(ApiResponse.success(result));
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await employeeDocumentService.delete(req.params.id, actorOf(req));
    res.json(ApiResponse.success(null, 'Document deleted'));
  }),
};
