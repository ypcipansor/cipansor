import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  type BlobSASSignatureValues,
} from '@azure/storage-blob';
import { logger } from '@/lib/logger';

export interface StorageUploadResult {
  /** Stable URL. For a private Azure container this is the raw blob URL (no SAS) — never a persisted expiry. */
  url: string;
  provider: 'azure' | 'local';
  filename: string;
  /** Present only for Azure uploads: the container the blob lives in. */
  containerName?: string;
  /** Present only for Azure uploads: the blob name within the container. */
  blobName?: string;
}

/** Public containers use blob-level access and need no SAS; everything else is private. */
function isPublicContainer(containerName: string): boolean {
  return containerName === 'media-public';
}

interface ResolvedCredentials {
  accountName: string;
  accountKey: string;
}

/** Resolve the account name + key from env vars, falling back to the connection string. */
function resolveCredentials(connectionString: string): ResolvedCredentials {
  const envName = process.env.AZURE_STORAGE_ACCOUNT;
  const envKey = process.env.AZURE_STORAGE_KEY;
  if (envName && envKey) return { accountName: envName, accountKey: envKey };

  const accountName = envName ?? connectionString.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = envKey ?? connectionString.match(/AccountKey=([^;]+)/)?.[1];
  if (!accountName || !accountKey) {
    throw new Error('Kunci kredensial Azure Storage wajib dikonfigurasi untuk container privat.');
  }
  return { accountName, accountKey };
}

/**
 * Upload a local file to Cloud Storage (Azure Blob Storage if configured, otherwise local disk).
 *
 * For private containers the raw blob URL is returned (WITHOUT a SAS), so the caller never persists
 * a short-lived signed link. Access to private blobs is granted at request time via {@link generateSasUrl}.
 */
export async function uploadToCloudStorage(
  localFilePath: string,
  filename: string,
  mimeType: string,
  containerName: string = 'cipansor-documents'
): Promise<StorageUploadResult> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (connectionString) {
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const publicContainer = isPublicContainer(containerName);
      await containerClient.createIfNotExists({
        access: publicContainer ? 'blob' : undefined,
      });

      const blockBlobClient = containerClient.getBlockBlobClient(filename);
      await blockBlobClient.uploadFile(localFilePath, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
        },
      });

      logger.info('File uploaded to Azure Blob Storage', {
        filename,
        container: containerName,
        rawUrl: blockBlobClient.url,
      });

      return {
        url: blockBlobClient.url,
        provider: 'azure',
        filename,
        containerName,
        blobName: filename,
      };
    } catch (error) {
      logger.error('Azure Blob Storage upload failed', { error, filename });
      throw new Error(
        `Gagal mengunggah berkas ke Azure Blob Storage: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Fallback to local storage URL when Azure is NOT configured
  return {
    url: `/uploads/${filename}`,
    provider: 'local',
    filename,
  };
}

/**
 * Generate a short-lived SAS URL for a private blob, used at download/request time.
 *
 * A SAS is minted fresh on every call instead of being stored, so a link that has expired (or was
 * never going to be used) is never persisted. `expiresInMinutes` defaults to a short window (60 min).
 */
export async function generateSasUrl(
  containerName: string,
  blobName: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString || !connectionString.includes('AccountKey=')) {
    throw new Error(
      'Kredensial Azure Storage (connection string) wajib dikonfigurasi untuk membuat SAS.'
    );
  }

  const { accountName, accountKey } = resolveCredentials(connectionString);
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const values: BlobSASSignatureValues = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'),
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
  };
  const sasToken = generateBlobSASQueryParameters(values, sharedKeyCredential).toString();

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  return `${containerClient.getBlockBlobClient(blobName).url}?${sasToken}`;
}

/**
 * Get cloud storage configuration details
 */
export function getStorageConfig() {
  // Azure uploads can only run when a connection string is present (see
  // uploadToCloudStorage — it branches on AZURE_STORAGE_CONNECTION_STRING).
  // Reporting the account name alone as "configured" would advertise Azure
  // while every upload would quietly fall back to local disk.
  const isAzureConfigured = Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);

  return {
    primaryProvider: isAzureConfigured ? 'azure' : 'local',
    azureConfigured: isAzureConfigured,
    azureAccount: process.env.AZURE_STORAGE_ACCOUNT || null,
    containers: {
      eOffice: 'e-office-documents',
      studentDocs: 'student-documents',
      publicMedia: 'media-public',
    },
  };
}
/**
 * Parse a raw Blob Storage URL into its container and blob name.
 *
 * Format: `https://<account>.blob.core.windows.net/<container>/<blob-path>`
 * Used by the on-demand SAS endpoint to translate a persisted stable URL
 * (no SAS) back into the container/blob needed to mint a fresh link.
 */
export function parseBlobUrl(
  url: string
): { containerName: string; blobName: string } | null {
  // Container: up to the first `/` or `?`; blob: everything after the next `/`
  // up to any query string or fragment that a SAS may have carried.
  const m = url.match(/^https?:\/\/[^/]+\.blob\.core\.windows\.net\/([^/?]+)\/([^?#]+)/);
  if (!m) return null;
  const containerName = decodeURIComponent(m[1]);
  const blobName = decodeURIComponent(m[2]);
  if (!containerName || !blobName) return null;
  return { containerName, blobName };
}
