import { Request, Response } from 'express';
import { ApiResponse } from '@cipansor/shared';
import { generateSasUrl } from '@/utils/cloud-storage';

/** Containers served with blob-level public access need no SAS. */
const PUBLIC_CONTAINERS = new Set(['media-public']);

export const uploadController = {
  uploadFile: async (
    req: Request,
    res: Response<ApiResponse<{ url: string; filename: string; mimetype: string; size: number }>>
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
       * reference, no SAS), and the container/blob names ride alongside so the
       * we can mint a short-lived SAS for a private container here. Never
       * rebuild a local /uploads URL for a file that was already deleted after
       * being pushed to blob storage.
       */
      let fileUrl: string;
      if (req.body.fileUrl) {
        fileUrl = req.body.fileUrl;
        const containerName: string | undefined = req.body.fileContainerName;
        const blobName: string | undefined = req.body.fileBlobName;
        if (containerName && blobName && !PUBLIC_CONTAINERS.has(containerName)) {
          // Private container: the raw blob URL returns 403. Serve via a fresh
          // SAS instead, so the caller can open the file it just uploaded. The
          // stable raw URL stays in req.body.fileUrl for whoever persists it.
          try {
            fileUrl = await generateSasUrl(containerName, blobName, 60);
          } catch {
            // Fall back to the raw URL if a SAS cannot be created (e.g. no
            // connection string configured) rather than failing the upload.
          }
        }
      } else {
        const protocol = req.protocol;
        const host = req.get('host');
        fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      }

      return res.status(200).json({
        success: true,
        data: {
          url: fileUrl,
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
};
