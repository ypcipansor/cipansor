import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  type BlobSASSignatureValues,
} from '@azure/storage-blob';
import { logger } from '@/lib/logger';
import { isBlobStillReferenced } from '@/utils/blob-owner';
import {
  UPLOAD_DESTINATIONS as SHARED_UPLOAD_DESTINATIONS,
  type UploadDestination as SharedUploadDestination,
} from '@cipansor/shared';

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

/**
 * Allowlist of containers this application is allowed to read/write/delete.
 *
 * A SAS endpoint must never sign a blob URL inside an arbitrary container: that
 * would turn "mint a link for my document" into "mint a link for anything we can
 * guess the URL of". Every caller that reaches Azure blob storage resolves its
 * container against this set; anything else is rejected.
 */
export const STORAGE_CONTAINERS = [
  'cipansor-documents', // generic upload middleware default (HR, misc)
  'e-office-documents', // E-Office correspondence naskah + attachments
  'student-documents', // student/boarding records
  'media-public', // public media (blob-level access, no SAS needed)
] as const;

export type StorageContainer = (typeof STORAGE_CONTAINERS)[number];

/** True when `containerName` is one this application owns. */
export function isAllowedContainer(containerName: string): boolean {
  return (STORAGE_CONTAINERS as readonly string[]).includes(containerName);
}

/** Public containers use blob-level access and need no SAS; everything else is private. */
export function isPublicContainer(containerName: string): boolean {
  return containerName === 'media-public';
}

/**
 * Logical upload destinations, mapped server-side to a concrete container.
 *
 * The contract lives in `@cipansor/shared` so the web client names the same
 * purposes; only the container mapping is server-side (the client must never
 * be able to name a container directly).
 */
export const UPLOAD_DESTINATIONS = SHARED_UPLOAD_DESTINATIONS;
export type UploadDestination = SharedUploadDestination;

const DESTINATION_CONTAINERS: Record<UploadDestination, StorageContainer> = {
  private: 'cipansor-documents',
  'media-public': 'media-public',
  'e-office': 'e-office-documents',
  student: 'student-documents',
};

/** True when `value` is a destination this application recognises. */
export function isUploadDestination(value: unknown): value is UploadDestination {
  return typeof value === 'string' && (UPLOAD_DESTINATIONS as readonly string[]).includes(value);
}

/** Resolve a logical destination to its container. Anything unrecognised is private. */
export function containerForDestination(destination?: string | null): StorageContainer {
  return isUploadDestination(destination)
    ? DESTINATION_CONTAINERS[destination]
    : 'cipansor-documents';
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
  containerName: string = 'cipansor-documents',
  uploaderId?: string | null
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
        // Record who uploaded the blob so an orphan can later be discarded by
        // its uploader only (see `upload.service.ts` `discardOrphanBlob`). It
        // rides with the blob and is removed with it. Omitted entirely when
        // there is no uploader, so the call shape is unchanged for other callers.
        ...(uploaderId ? { metadata: { uploaderId } } : {}),
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
 * Delete a blob from Cloud Storage.
 *
 * Wired into record-delete paths so removing a record does not leave its
 * private document (HR records, letters, student docs) stored forever. When
 * Azure is not configured there is no remote blob to remove; the function
 * resolves successfully (the local staging file, if any, is the caller's
 * concern). Throws when deletion fails so the caller can decide whether to
 * roll back.
 */
export async function deleteFromCloudStorage(
  containerName: string,
  blobName: string
): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    // Local-only deployment: nothing remote to delete.
    return;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.deleteBlob(blobName, { deleteSnapshots: 'include' });
    logger.info('Blob deleted from Azure Blob Storage', { container: containerName, blobName });
  } catch (error) {
    logger.error('Azure Blob Storage delete failed', { container: containerName, blobName, error });
    throw new Error(
      `Gagal menghapus berkas dari Azure Blob Storage: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * A blob's creation time in Azure, or null when it cannot be read (no
 * connection string / local-only / not found / permission denied).
 */
export async function getBlobCreatedAt(
  containerName: string,
  blobName: string
): Promise<Date | null> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) return null;

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    const properties = await blobClient.getProperties();
    return properties.createdOn ?? properties.lastModified ?? null;
  } catch (error) {
    logger.warn('Blob properties could not be read', {
      container: containerName,
      blobName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The user id that uploaded `blobName`, from the blob's `uploaderId` metadata,
 * or null when it is missing (no connection string / not found / uploaded
 * before this metadata existed).
 *
 * Discard authorisation reads this: an orphan blob has no record to name an
 * owner, so the uploader recorded at write time is the only thing that can
 * bind the delete to a person. A null result is treated as "not yours" by the
 * caller, never as "anyone may delete it".
 */
export async function getBlobUploaderId(
  containerName: string,
  blobName: string
): Promise<string | null> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) return null;

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    const properties = await blobClient.getProperties();
    return properties.metadata?.uploaderId ?? null;
  } catch (error) {
    logger.warn('Blob uploader metadata could not be read', {
      container: containerName,
      blobName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** How long to wait before re-probing, so an in-flight create can commit. */
export const RACE_RECHECK_DELAY_MS = 2_000;

/**
 * Gap between the settle probe and the final probe that guards the delete.
 *
 * Two separated observations rather than one: a create that commits between
 * them is caught by the second, which leaves only the single-statement gap
 * between that probe and the delete as the residual window.
 */
export const RACE_FINAL_RECHECK_DELAY_MS = 500;

/**
 * Delete a blob only when it is still an orphan after a delayed re-probe.
 *
 * Upload and create-record are two requests. A discard can slip between them:
 * it reads "no record references this" at the instant the create request is
 * committing, and an immediate delete would destroy a blob the new record just
 * started pointing at.
 *
 * Three things make the delete safe, in order of how much they buy:
 *
 *  1. **A soft age floor anchored to the blob's own creation time.** When
 *     Azure can report `createdOn`, the settle window is measured from when the
 *     blob appeared rather than from when the discard was invoked. A discard
 *     called a moment after upload — the normal case — therefore still gives an
 *     in-flight create the full {@link RACE_RECHECK_DELAY_MS}. (A *hard* age
 *     floor would be wrong: the discard's only legitimate caller runs it right
 *     after a create request has failed, so the blob is always seconds old and
 *     a hard floor would refuse every real discard, leaving the orphan forever.)
 *  2. **Two separated probes.** The settle probe catches anything that
 *     committed during the window; the final probe, a
 *     {@link RACE_FINAL_RECHECK_DELAY_MS} later, is a second, independent
 *     observation, so a record committed *between* the two is still caught.
 *  3. **Adjacency.** The delete is the very next statement after the final
 *     probe returns false — no intervening await — so the window that remains
 *     is as small as this design can make it.
 *
 * The residual window (a create committing in the instant between the final
 * probe and Azure's delete) is inherent to a blob delete that is not
 * transactional with the database write that references it; closing it fully
 * would need a lease/marker the create path also honours. It is left here,
 * documented, rather than papered over: the discard is the rare failure path
 * (create already failed), and the two probes make the race require a create to
 * land in a sub-second window *after* the settle delay has already elapsed.
 *
 * `recheck` returns true when a record now references the blob.
 */
export async function deleteBlobIfStillOrphaned(
  containerName: string,
  blobName: string,
  recheck: () => Promise<boolean>,
  delayMs: number = RACE_RECHECK_DELAY_MS
): Promise<boolean> {
  // Soft age floor: give an in-flight create the full window measured from the
  // blob's creation, not from the moment the discard was invoked.
  const createdAt = await getBlobCreatedAt(containerName, blobName);
  const ageMs = createdAt ? Math.max(Date.now() - createdAt.getTime(), 0) : 0;
  const settleDelay = Math.max(delayMs - ageMs, 0);
  if (settleDelay > 0) {
    await sleep(settleDelay);
  }

  // Probe 1 (settle): anything that committed during the window stops us here.
  if (await recheck()) return false;

  // Probe 2 (final): a separate observation shortly before the irreversible
  // delete, catching a create that committed between probe 1 and now.
  const finalDelay = delayMs > 0 ? RACE_FINAL_RECHECK_DELAY_MS : 0;
  if (finalDelay > 0) {
    await sleep(finalDelay);
  }
  if (await recheck()) return false;

  await deleteFromCloudStorage(containerName, blobName);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort removal of the blob backing a persisted record URL.
 *
 * Record-delete paths call this *after* the database row is gone. Failure to
 * delete is logged and swallowed: the record is authoritative, and turning a
 * stale-blob sweep into a failed delete would be worse for the user than
 * leaving one orphan behind (which a later sweep can reclaim). For paths that
 * must know whether the blob was actually removed (e.g. rollback), call
 * {@link deleteFromCloudStorage} directly and handle its rejection.
 *
 * **Cross-record owner probe.** The blob name is normally a
 * `crypto.randomUUID()` minted per physical upload (see the multer disk
 * storage in `middleware/upload.ts`), so the URL usually identifies exactly
 * one upload. That is not guaranteed across all data — a copy/clone path or
 * imported legacy rows can point a second record at the same URL, and the
 * deleting record may itself be one that was cloned forward. So this checks
 * {@link isBlobStillReferenced} first and refuses to delete while any record
 * still references the blob; only a genuinely orphaned blob is reclaimed.
 * Covered by the shared-URL test in `cloud-storage.test.ts`.
 */
export async function cleanupBlobBestEffort(fileUrl: string | null | undefined): Promise<boolean> {
  if (!fileUrl) return false;
  const parsed = parseBlobUrl(fileUrl);
  if (!parsed) return false;
  if (await isBlobStillReferenced(fileUrl)) {
    return false;
  }
  try {
    await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
    return true;
  } catch (error) {
    logger.error('Best-effort blob cleanup failed; record already deleted', {
      container: parsed.containerName,
      blobName: parsed.blobName,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Best-effort removal of several persisted record URLs (e.g. all photos of a
 * report), so a bulk record delete does not leave a trail of orphaned blobs.
 */
export async function cleanupBlobsBestEffort(
  fileUrls: Array<string | null | undefined>
): Promise<void> {
  await Promise.all(fileUrls.map((url) => cleanupBlobBestEffort(url)));
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
 * The storage account this application is configured to use, or null when no
 * account is configured.
 *
 * Read from `AZURE_STORAGE_ACCOUNT` first, falling back to the `AccountName`
 * of the connection string — the same two sources {@link resolveCredentials}
 * draws from, so parsing and signing can never disagree about which account is
 * ours.
 */
export function configuredStorageAccount(): string | null {
  const envName = process.env.AZURE_STORAGE_ACCOUNT?.trim();
  if (envName) return envName.toLowerCase();
  const fromConnectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING?.match(/AccountName=([^;]+)/)?.[1];
  return fromConnectionString ? fromConnectionString.trim().toLowerCase() : null;
}

/**
 * Parse a raw Blob Storage URL into its container and blob name.
 *
 * Format: `https://<account>.blob.core.windows.net/<container>/<blob-path>`
 * Used by the on-demand SAS endpoint to translate a persisted stable URL
 * (no SAS) back into the container/blob needed to mint a fresh link.
 *
 * The host must be the account THIS application is configured for. A bare
 * `[^/]+\.blob\.core\.windows\.net` match accepted any Azure account, so a
 * foreign URL with the same container/blob path was signed with our own key —
 * turning "mint a link for my document" into "mint a link for anything on any
 * account whose URL you can guess". Returning null for a foreign host makes the
 * caller refuse it instead (see `resolveSasForBlob`).
 */
export function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.match(/^([^.]+)\.blob\.core\.windows\.net$/i);
  if (!host) return null;

  const account = configuredStorageAccount();
  if (!account || host[1].toLowerCase() !== account) return null;

  // Container: the first path segment; blob: the remainder. A query string or
  // fragment that a SAS may have carried is dropped by URL parsing.
  const segments = parsed.pathname.replace(/^\/+/, '').split('/');
  if (segments.length < 2) return null;
  // `decodeURIComponent` throws URIError on a broken escape (e.g. `%zz`). It
  // used to sit outside any try/catch, so a malformed stored URL turned
  // /upload/sas and /upload/discard into 500s instead of a clean refusal.
  let containerName: string;
  let blobName: string;
  try {
    containerName = decodeURIComponent(segments[0]);
    blobName = decodeURIComponent(segments.slice(1).join('/'));
  } catch {
    return null;
  }
  if (!containerName || !blobName) return null;
  return { containerName, blobName };
}
