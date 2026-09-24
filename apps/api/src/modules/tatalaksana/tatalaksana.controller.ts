import { Request, Response, NextFunction } from 'express';
import { tataLaksanaService } from './tatalaksana.service';

export const getSOPs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.getSOPs(req.query);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const getSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.getSOP(req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const createSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.createSOP({
      ...req.body,
      createdById: req.user?.id,
      effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
      reviewDate: req.body.reviewDate ? new Date(req.body.reviewDate) : undefined,
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

export const updateSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.updateSOP(req.params.id, {
      ...req.body,
      effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
      reviewDate: req.body.reviewDate ? new Date(req.body.reviewDate) : undefined,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const approveSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.approveSOP(req.params.id, req.user!.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const activateSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.activateSOP(req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const createRevision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.createRevision({
      ...req.body,
      revisedById: req.user!.id,
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

export const deleteSOP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tataLaksanaService.deleteSOP(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getSOPSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tataLaksanaService.getSOPSummary(req.query.unitId as string);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
