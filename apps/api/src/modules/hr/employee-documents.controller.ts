import { Request, Response } from 'express';
import { employeeDocumentService, type EmployeeDocumentActor } from './employee-documents.service';
import { requireUser } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';
import { createEmployeeDocumentSchema } from '@cipansor/shared';

/** The authenticated actor, used by the service for ownership/unit checks. */
function actorOf(req: Request): EmployeeDocumentActor {
  const user = requireUser(req);
  return { id: user.id, roleCode: user.roleCode, unitId: user.unitId };
}

export const employeeDocumentController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = createEmployeeDocumentSchema.parse(req.body);
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
