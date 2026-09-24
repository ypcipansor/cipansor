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

/**
 * A stored reference to an uploaded file.
 *
 * New local-storage uploads persist a host-relative `/uploads/<file>` path,
 * never an absolute URL built from the request `Host`: a domain/proxy change
 * would leave every stored row pointing at an origin that no longer serves the
 * file. A row written before that change may still hold the absolute
 * `https://<any-host>/uploads/<file>` spelling, and public media or an external
 * link is an ordinary absolute URL, so both spellings must validate.
 *
 * This is a shape check, not an authorization one — ownership is decided at
 * read time against the record that references the file.
 */
export const uploadedFileRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) =>
      value.startsWith("/uploads/") ||
      z.string().url().safeParse(value).success,
    {
      message: "Referensi berkas harus berupa URL atau jalur /uploads/",
    },
  );

export type UploadedFileRef = z.infer<typeof uploadedFileRefSchema>;

/** An array of uploaded-file references (e.g. a record's attachment list). */
export const uploadedFileRefListSchema = z.array(uploadedFileRefSchema);
