import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import * as musyrifService from './musyrif.service';

// Bodies and queries arrive parsed by validate()/validateQuery() in
// dormitories.routes.ts.

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(ApiResponse.success(await musyrifService.listAssignments(req.params.id)));
});

export const candidates = asyncHandler(async (_req: Request, res: Response) => {
  const { q } = res.locals.validatedQuery as { q?: string };
  res.json(ApiResponse.success(await musyrifService.listCandidates(q)));
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await musyrifService.assign(req.params.id, req.body);
  res.status(201).json(ApiResponse.success(assignment, 'Musyrif ditugaskan'));
});

export const end = asyncHandler(async (req: Request, res: Response) => {
  await musyrifService.endAssignment(req.params.id, req.params.assignmentId);
  res.json(ApiResponse.success(null, 'Penugasan diakhiri'));
});
