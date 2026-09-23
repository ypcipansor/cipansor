import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  type BlobSASSignatureValues,
} from '@azure/storage-blob';
import { logger } from '@/lib/logger';
import { isBlobStillReferenced, blobReferenceCandidates } from '@/utils/blob-owner';
import { parseAzureBlobIdentity } from '@/utils/blob-identity';
import { discardUnderClaim } from '@/utils/blob-discard';
import { resolveLocalUploadPath, removeLocalUpload } from '@/utils/local-upload-store';
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
 * Guarantee a public container's access policy is actually `blob`.
 *
 * `createIfNotExists` sets the access policy ONLY when it creates the container.
 * For one that already exists it is a no-op, so a `media-public` provisioned
 * earlier by hand, by a different tool, or with a renamed container keeps
 * whatever policy it had — and `isPublicContainer()` still reports it public, so
 * the code serves raw `blob.core.windows.net/media-public/...` URLs that Azure
 * then rejects with 404 (private) for every anonymous `<img>`. Public media
 * therefore appeared in the app but not in the browser, with nothing in the
 * logs.
 *
 * Reconcile the existing policy explicitly instead of trusting the create. On
 * divergence this corrects the policy and warns; if the correction itself
 * fails, the error propagates and the upload fails loudly rather than reporting
 * success for a blob no one can fetch.
 */
async function ensurePublicBlobAccess(
  containerClient: ReturnType<BlobServiceClient['getContainerClient']>,
  containerName: string,
  justCreated: boolean
): Promise<void> {
  const current = justCreated ? 'blob' : (await containerClient.getProperties()).blobPublicAccess;
  if (current === 'blob' || current === 'container') return;

  logger.warn('Public container had the wrong access policy; applying blob access', {
    container: containerName,
    found: current ?? 'private',
  });
  await containerClient.setAccessPolicy('blob');
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
      const created = await containerClient.createIfNotExists({
        access: publicContainer ? 'blob' : undefined,
      });
      if (publicContainer) {
        await ensurePublicBlobAccess(containerClient, containerName, created.succeeded);
      }

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
/**
 * The lifetime of a freshly minted SAS, in minutes. Exported so the client can
 * be told how long its link lives (see `GetSasUrlResult.expiresIn`) and refresh
 * before it dies — an open page that rendered an image an hour ago must not
 * hold a URL that has since expired.
 */
export const SAS_TTL_MINUTES = 60;

export async function generateSasUrl(
  containerName: string,
  blobName: string,
  expiresInMinutes: number = SAS_TTL_MINUTES
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
 * True when an Azure storage error means "the blob is not there".
 *
 * Delete on an absent blob must be an idempotent SUCCESS, or reconciliation
 * retries it forever. The check uses the stable `code` (`BlobNotFound`) and
 * `statusCode` (404) the SDK exposes — never a free-text message match, which
 * would also catch a 404 that is not about the blob. 401/403/429/5xx are NOT
 * not-found: they are auth, throttling or server errors and must propagate.
 */
function isBlobNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; statusCode?: unknown; details?: { errorCode?: unknown } };
  if (e.code === 'BlobNotFound' || e.details?.errorCode === 'BlobNotFound') return true;
  return e.statusCode === 404;
}

/**
 * Thrown when a remote delete cannot even be attempted because the storage
 * credentials are not configured.
 *
 * This is deliberately NOT a silent success. A caller that reads "no
 * credentials" as "the blob is gone" marks the delete DONE and never retries it
 * once the credentials are restored, leaving a live blob behind forever — the
 * exact bug this class closes.
 */
export class StorageUnavailableError extends Error {
  constructor(message = 'Kredensial Azure Storage belum dikonfigurasi.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/** The explicit result of a delete attempt, so callers never infer it. */
export type BlobDeleteOutcome = 'deleted' | 'already-absent' | 'unavailable';

/**
 * Delete a blob from Cloud Storage and report the outcome explicitly.
 *
 * The three outcomes are distinct for a reason:
 *
 *  - `deleted` — the blob was removed now;
 *  - `already-absent` — a 404 / `BlobNotFound`; already gone, so an idempotent
 *    success for every caller;
 *  - `unavailable` — storage credentials are not configured, so NO remote
 *    request was made. A reconciler MUST reschedule this rather than treat it
 *    as a successful delete, or the blob is never retried.
 *
 * Any other Azure failure (auth, throttling, 5xx) still throws, exactly as
 * before, so the caller's retry/backoff machinery runs.
 */
export async function deleteBlobFromCloudStorage(
  containerName: string,
  blobName: string,
  options: { timeoutMs?: number } = {}
): Promise<BlobDeleteOutcome> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    return 'unavailable';
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    // Finding D: the Azure SDK sets no client-side per-request timeout by
    // default (`tryTimeoutInMs` is undefined) and retries up to 4 times, so a
    // hung connection could outlast the reconcile lease. The caller passes a
    // ceiling well under it; aborting throws (a non-404), so the row is
    // rescheduled rather than mistaken for a delete.
    const abortSignal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
    await containerClient.deleteBlob(blobName, { deleteSnapshots: 'include', abortSignal });
    logger.info('Blob deleted from Azure Blob Storage', { container: containerName, blobName });
    return 'deleted';
  } catch (error) {
    if (isBlobNotFoundError(error)) {
      // Idempotent: the blob is already absent, so the delete succeeded.
      logger.info('Blob already absent from Azure Blob Storage', {
        container: containerName,
        blobName,
      });
      return 'already-absent';
    }
    logger.error('Azure Blob Storage delete failed', { container: containerName, blobName, error });
    throw new Error(
      `Gagal menghapus berkas dari Azure Blob Storage: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a blob from Cloud Storage, throwing when no remote delete was
 * performed.
 *
 * Record-delete paths and the discard protocol use this: they must be able to
 * tell a real delete from a no-op, so a missing connection string is a failure
 * (`StorageUnavailableError`), not a silent success. On a genuinely local-only
 * deployment this path is unreachable for a cloud blob: `parseBlobUrl` returns
 * null unless the configured account is ours, so callers never reach here.
 *
 * A 404 / `BlobNotFound` still counts as success (already gone). Auth,
 * throttling and server errors still throw.
 */
export async function deleteFromCloudStorage(
  containerName: string,
  blobName: string
): Promise<void> {
  const outcome = await deleteBlobFromCloudStorage(containerName, blobName);
  if (outcome === 'unavailable') {
    throw new StorageUnavailableError();
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
 * **Race (BUG 9).** The probe-then-delete is not atomic, so a reference created
 * between the two would be destroyed. Cleanup therefore runs the SAME claim
 * protocol as `discardOrphanBlob` (`discardUnderClaim`): claim → final probe
 * under the claim → tombstone → physical delete. Cleanup here has no actor
 * (the record is already gone), so it identifies itself with a constant
 * operation holder — never a user id.
 *
 * **Local files (BUG 8).** A `/uploads/...` URL used to make `parseBlobUrl`
 * return null and the whole function return false, so the file and its sidecar
 * leaked forever on a local-only deployment. Local references are now resolved
 * through the same hardened name/realpath/containment check the discard path
 * uses, claimed, re-probed, then unlinked.
 */
export async function cleanupBlobBestEffort(fileUrl: string | null | undefined): Promise<boolean> {
  if (!fileUrl) return false;
  // The ENTIRE body is the best-effort boundary, not just the delete. The
  // reference probe is a database query, and it runs *after* the caller's
  // record row is already gone: letting it reject would fail a request whose
  // delete has already committed, and a retry would then find no record to
  // delete at all. Parsing can also reject on a malformed stored URL. Anything
  // thrown here is logged and reported as "not cleaned", never propagated.
  try {
    const parsed = parseBlobUrl(fileUrl);

    if (!parsed) {
      // Not a cloud blob. Distinguish a valid local upload from an
      // external/malformed URL. `resolveLocalUploadPath` returns null for the
      // latter (and for a missing file), so a foreign URL is left alone while a
      // real local file is reclaimed.
      const resolved = await resolveLocalUploadPath(fileUrl);
      if (!resolved) return false;

      const refs = referenceCandidates(fileUrl);
      const outcome = await discardUnderClaim(
        fileUrl,
        CLEANUP_CLAIM_HOLDER,
        () => isStillReferencedByRefs(refs),
        () => removeLocalUpload(resolved)
      );
      // "referenced" / "busy" / "claim-lost" all mean we did not delete.
      return outcome === 'deleted';
    }

    const outcome = await discardUnderClaim(
      fileUrl,
      CLEANUP_CLAIM_HOLDER,
      () => isStillReferencedByRefs(referenceCandidates(fileUrl)),
      () => deleteFromCloudStorage(parsed.containerName, parsed.blobName)
    );
    return outcome === 'deleted';
  } catch (error) {
    logger.error('Best-effort blob cleanup failed; record already deleted', {
      fileUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * A stable holder id for record-delete cleanup. The record is already gone, so
 * there is no acting user; a constant keeps the audit trail honest without
 * pretending a person did it. The claim's identity is its operation token, not
 * this string.
 */
const CLEANUP_CLAIM_HOLDER = 'system:cleanup';

/** Every stored spelling of `url` a record could hold (local or Azure). */
function referenceCandidates(url: string): string[] {
  return Array.from(new Set([...blobReferenceCandidates(url)]));
}

/** True when any spelling in `refs` is still referenced by a live record. */
async function isStillReferencedByRefs(refs: readonly string[]): Promise<boolean> {
  for (const ref of refs) {
    if (await isBlobStillReferenced(ref)) return true;
  }
  return false;
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
 *
 * The path is resolved through {@link parseAzureBlobIdentity} so this parser and
 * the claim/reference code always name the SAME physical blob. Reading
 * `parsed.pathname` would apply the WHATWG URL parser's dot-segment removal and
 * send a delete for `a/./b` to `a/b` — a different blob, because an Azure name
 * is an opaque object key, not a filesystem path.
 */
export function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
  const identity = parseAzureBlobIdentity(url);
  if (!identity) return null;

  const account = configuredStorageAccount();
  if (!account || identity.account !== account) return null;

  return { containerName: identity.container, blobName: identity.blobPath };
}
