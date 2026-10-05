import { z } from 'zod';
import { createAnnouncementSchema, updateAnnouncementSchema } from '@cipansor/shared';

/** The contract lives once, in `@cipansor/shared`; the web validates the same shapes. */
export { createAnnouncementSchema, updateAnnouncementSchema };

export type CreateAnnouncementBody = z.output<typeof createAnnouncementSchema>;
export type UpdateAnnouncementBody = z.output<typeof updateAnnouncementSchema>;

export const announcementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Only what is live now: published, not expired, not withdrawn. */
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  unitId: z.string().uuid().optional(),
  priority: z.coerce.number().int().min(0).max(2).optional(),
});
export type AnnouncementListQuery = z.output<typeof announcementListQuerySchema>;

export const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
