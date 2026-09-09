import { Request, Response } from 'express';
import { ApiResponse } from '@cipansor/shared';
import { generateSasUrl } from '@/utils/cloud-storage';

/** Containers served with blob-level public access need no SAS. */
const PUBLIC_CONTAINERS = new Set(['media-public']);

export interface UploadFileResponseData {
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

export const uploadController = {
  uploadFile: async (
    req: Request,
    res: Response<ApiResponse<UploadFileResponseData>>
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          data: null as any,
          error: {
            code: 'NO_FILE',
            message: 'No file uploaded',
          },
        });
      }

      /**
       * The handleSingleUpload middleware already attached fileUrl to body when
       * it succeeded. For Azure uploads that is the raw blob URL (the stable
       * reference, no SAS), and the container/blob names ride alongside so a
       * short-lived SAS can be minted on demand — at request time — rather than
       * persisted by the caller. The response deliberately keeps `url` as the
       * stable raw reference so consumers store a link that never expires, and
       * only carries a temporary `downloadUrl` (SAS) for opening the file
       * immediately after upload. Never rebuild a local /uploads URL for a file
       * that was already deleted after being pushed to blob storage.
       */
      let stableUrl: string;
      let downloadUrl: string | undefined;
      let containerName: string | undefined;
      let blobName: string | undefined;

      if (req.body.fileUrl) {
        stableUrl = req.body.fileUrl;
        containerName = req.body.fileContainerName;
        blobName = req.body.fileBlobName;
        if (containerName && blobName && !PUBLIC_CONTAINERS.has(containerName)) {
          // Private container: the raw blob URL returns 403. Mint a fresh SAS
          // only for this response so the caller can open the file it just
          // uploaded; the stable raw URL above is what gets persisted.
          try {
            downloadUrl = await generateSasUrl(containerName, blobName, 60);
          } catch {
            // Leave downloadUrl unset (caller falls back to url / hides the
            // open affordance) rather than failing the upload when a SAS
            // cannot be created (e.g. no connection string configured).
            downloadUrl = undefined;
          }
        }
      } else {
        const protocol = req.protocol;
        const host = req.get('host');
        stableUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      }

      return res.status(200).json({
        success: true,
        data: {
          url: stableUrl,
          downloadUrl,
          containerName,
          blobName,
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        data: null as any,
        error: {
          code: 'UPLOAD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown upload error',
        },
      });
    }
  },

  /**
   * Mint a fresh short-lived SAS for a persisted stable blob URL (the raw URL
   * returned by {@link uploadFile} and stored by consumers). Private blobs
   * return 403 without a SAS, and any SAS persisted earlier has expired — so a
   * consumer that stored a stable reference must hit this endpoint at display
   * or download time to obtain a valid link. Local /uploads URLs and public
   * blob URLs pass through unchanged.
   */
  getSasUrl: async (
    req: Request,
    res: Response<
      ApiResponse<{ url: string; downloadUrl?: string }>
    >
  ) => {
    try {
      const { url } = (req.body ?? {}) as { url?: string };
      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          success: false,
          data: null as any,
          error: { code: 'URL_REQUIRED', message: 'url wajib diisi' },
        });
      }
      const { parseBlobUrl } = await import('@/utils/cloud-storage');
      const parsed = parseBlobUrl(url);
      if (!parsed || PUBLIC_CONTAINERS.has(parsed.containerName)) {
        // Not a private blob — a local /uploads path, a public blob, or an
        // unrecognised URL. Callers should render `url` directly.
        return res.status(200).json({ success: true, data: { url } });
      }
      const downloadUrl = await generateSasUrl(
        parsed.containerName,
        parsed.blobName,
        60
      );
      return res.status(200).json({ success: true, data: { url, downloadUrl } });
    } catch (error) {
      return res.status(500).json({
        success: false,
        data: null as any,
        error: {
          code: 'SAS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown SAS error',
        },
      });
    }
  },
};
