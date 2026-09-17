import { z } from "zod";
import { UPLOAD_DESTINATIONS } from "../types/upload";

/**
 * Query contract for `POST /upload`: the logical purpose the caller is
 * uploading for.
 *
 * The client names a purpose, never a container — the API maps the validated
 * value to a concrete container server-side, so a caller cannot smuggle a KTP
 * scan into the public media container. An absent or unrecognised value becomes
 * undefined and the server treats it as private: an unknown purpose can never
 * *select* a container, so the only safe direction to fail is private.
 */
export const uploadQuerySchema = z.object({
  destination: z.enum(UPLOAD_DESTINATIONS).optional().catch(undefined),
});

export type UploadQuery = z.infer<typeof uploadQuerySchema>;
