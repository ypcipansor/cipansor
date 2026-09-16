import { z } from 'zod';

/**
 * Request body of `POST /upload/sas`: the persisted stable blob reference (raw
 * Azure blob URL or a local `/uploads/...` path) whose fresh SAS is requested.
 */
export const getSasUrlSchema = z.object({
  url: z.string().min(1, 'url wajib diisi'),
});

export type GetSasUrlBody = z.infer<typeof getSasUrlSchema>;
