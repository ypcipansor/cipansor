import type { Request } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import * as service from './announcements.service';
import {
  announcementListQuerySchema,
  createAnnouncementSchema,
  recentQuerySchema,
  updateAnnouncementSchema,
} from './announcements.schema';
import type { AnnouncementActor } from './announcements.access';

const actorOf = (req: Request): AnnouncementActor => {
  if (!req.user) throw Errors.unauthorized();
  return { sub: req.user.sub, roleCode: req.user.roleCode, unitId: req.user.unitId };
};

/** GET /announcements — the caller's board. */
export const list = asyncHandler(async (req, res) => {
  const result = await service.list(actorOf(req), announcementListQuerySchema.parse(req.query));
  res.json({ success: true, ...result });
});

/** GET /announcements/stats */
export const getStats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.stats(actorOf(req)) });
});

/** GET /announcements/recent — the dashboards' card. */
export const getRecent = asyncHandler(async (req, res) => {
  const { limit } = recentQuerySchema.parse(req.query);
  res.json({ success: true, data: await service.recent(actorOf(req), limit) });
});

/** GET /announcements/compose — what the caller may publish, and where. */
export const getComposeOptions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.composeOptions(actorOf(req)) });
});

/** GET /announcements/:id */
export const getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getById(actorOf(req), req.params.id) });
});

/** POST /announcements — publish, and deliver to the audience's bells. */
export const create = asyncHandler(async (req, res) => {
  const data = await service.create(actorOf(req), createAnnouncementSchema.parse(req.body));
  res.status(201).json({ success: true, data });
});

/** PATCH /announcements/:id — new words; the audience stays. */
export const update = asyncHandler(async (req, res) => {
  const data = await service.update(
    actorOf(req),
    req.params.id,
    updateAnnouncementSchema.parse(req.body)
  );
  res.json({ success: true, data });
});

/** POST /announcements/:id/withdraw */
export const withdraw = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.withdraw(actorOf(req), req.params.id) });
});
