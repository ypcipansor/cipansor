import { Request, Response } from 'express';
import { NotificationType } from '@prisma/client';
import { asyncHandler } from '@/middleware/error';
import { announcementService } from './announcements.service';

/**
 * List announcements
 * GET /api/announcements
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { unitId, type, priority, published, page, limit } = req.query;

  const result = await announcementService.findAll({
    unitId: (unitId as string) || req.user?.unitId || undefined,
    type: type as NotificationType,
    priority: priority ? parseInt(priority as string) : undefined,
    published: published === 'true',
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 20,
  });

  res.json({ success: true, ...result });
});

/**
 * Announcement statistics
 * GET /api/announcements/stats
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const unitId = (req.query.unitId as string) || req.user?.unitId || undefined;
  const stats = await announcementService.getStats(unitId);
  res.json({ success: true, data: stats });
});

/**
 * Recent announcements
 * GET /api/announcements/recent
 */
export const getRecent = asyncHandler(async (req: Request, res: Response) => {
  const unitId = (req.query.unitId as string) || req.user?.unitId || undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
  const announcements = await announcementService.getRecent(unitId, limit);
  res.json({ success: true, data: announcements });
});

/**
 * Get announcement by ID
 * GET /api/announcements/:id
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementService.findById(req.params.id);
  if (!announcement) {
    return res.status(404).json({ success: false, error: { message: 'Announcement not found' } });
  }
  res.json({ success: true, data: announcement });
});

/**
 * Create announcement
 * POST /api/announcements
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await announcementService.create({
    ...req.body,
    unitId: req.body.unitId || req.user?.unitId || undefined,
    createdById: (req.user as any).id || (req.user as any).userId,
  });
  res.status(201).json({ success: true, data: announcement });
});

/**
 * Update announcement
 * PATCH /api/announcements/:id
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req.user as any)?.id || (req.user as any)?.userId || (req.user as any)?.sub;
  const announcement = await announcementService.update(req.params.id, req.body, actorId);
  res.json({ success: true, data: announcement });
});

/**
 * Delete announcement
 * DELETE /api/announcements/:id
 */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await announcementService.delete(req.params.id);
  res.json({ success: true, message: 'Announcement deleted' });
});
