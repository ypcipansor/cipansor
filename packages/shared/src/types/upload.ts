/**
 * Upload + on-demand SAS contracts, shared by the API (`apps/api`) and the web
 * client (`apps/web`) so the response shape can never drift between the two.
 *
 * The upload response deliberately separates the STABLE reference from any
 * TEMPORARY access link: consumers must persist `url` (the raw blob URL for
 * Azure, or a `/uploads/...` path for local storage — neither carries an
 * expiring SAS), and use `downloadUrl` only to open the file immediately after
 * upload.
 */

/**
 * Logical upload destinations. The client names a *purpose*, never a container:
 * a caller that could name the container freely could push a KTP scan into the
 * public media container and make it world-readable. The server maps each
 * purpose to a concrete container; an unknown or missing purpose falls back to
 * private.
 */
export const UPLOAD_DESTINATIONS = [
  "private",
  "media-public",
  "e-office",
  "student",
] as const;
export type UploadDestination = (typeof UPLOAD_DESTINATIONS)[number];

/** Response of `POST /upload` (see uploadApi.uploadFile / UploadFileResult). */
export interface UploadFileResult {
  /** Stable reference to persist — never a short-lived SAS. */
  url: string;
  /** Temporary SAS to open the just-uploaded file. Only present for private Azure containers. */
  downloadUrl?: string;
  /** Azure container the blob lives in (present only for Azure uploads). */
  containerName?: string;
  /** Azure blob name within the container (present only for Azure uploads). */
  blobName?: string;
  filename: string;
  mimetype: string;
  size: number;
}

/** Request body of `POST /upload/sas`. */
export interface GetSasUrlRequest {
  /** The persisted stable blob URL (raw Azure blob URL or /uploads path). */
  url: string;
}

/** Response body of `POST /upload/sas`. */
export interface GetSasUrlResult {
  url: string;
  /** Fresh short-lived SAS for a private blob. Absent for public/local URLs. */
  downloadUrl?: string;
}
