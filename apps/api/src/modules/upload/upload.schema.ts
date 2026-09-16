import { z } from 'zod';

/**
 * Request body of `POST /upload/sas`: the persisted stable blob reference (raw
 * Azure blob URL or a local `/uploads/...` path) whose fresh SAS is requested.
 */
export const getSasUrlSchema = z.object({
  url: z.string().min(1, 'url wajib diisi'),
});

export type GetSasUrlBody = z.infer<typeof getSasUrlSchema>;

/**
 * The `POST /upload` query contract is owned by `@cipansor/shared` so the web
 * client names the same purposes; re-exported here for the route.
 */
export { uploadQuerySchema, type UploadQuery } from '@cipansor/shared';
