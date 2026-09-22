import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadToCloudStorage,
  generateSasUrl,
  getStorageConfig,
  parseBlobUrl,
  deleteFromCloudStorage,
  deleteBlobFromCloudStorage,
  StorageUnavailableError,
  isAllowedContainer,
  cleanupBlobBestEffort,

  getBlobUploaderId,
  containerForDestination,
  isUploadDestination,
  UPLOAD_DESTINATIONS,
} from './cloud-storage';
import { claimBlobForDiscard, markBlobDiscarded } from '@/utils/blob-claim';
import { resolveLocalUploadPath, removeLocalUpload } from '@/utils/local-upload-store';

const {
  mockUploadFile,
  mockCreateIfNotExists,
  mockGetContainerClient,
  mockSasToString,
  mockDeleteBlob,
  mockGetProperties,
  mockSetAccessPolicy,
  mockIsBlobStillReferenced,
} = vi.hoisted(() => {
  const mockUploadFile = vi.fn().mockResolvedValue({});
  const mockDeleteBlob = vi.fn().mockResolvedValue({});
  const mockGetProperties = vi
    .fn()
    .mockResolvedValue({ createdOn: undefined, lastModified: undefined });
  const mockGetBlockBlobClient = vi.fn().mockReturnValue({
    uploadFile: mockUploadFile,
    url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf',
  });
  // Creating the container is the common case; the reconciling `getProperties`
  // / `setAccessPolicy` pair only runs for a container that already exists.
  const mockCreateIfNotExists = vi.fn().mockResolvedValue({ succeeded: true });
  const mockSetAccessPolicy = vi.fn().mockResolvedValue({});
  const mockGetContainerClient = vi.fn().mockReturnValue({
    createIfNotExists: mockCreateIfNotExists,
    getBlockBlobClient: mockGetBlockBlobClient,
    deleteBlob: mockDeleteBlob,
    getProperties: mockGetProperties,
    setAccessPolicy: mockSetAccessPolicy,
    getBlobClient: vi.fn().mockReturnValue({ getProperties: mockGetProperties }),
  });
  const mockSasToString = vi.fn(() => 'sig=fakeSasToken&se=2026-01-01T00%3A00%3A00Z');
  // The cross-record owner probe is mocked at the module boundary; the real
  // probe would need a database. Default: the blob is orphaned (deletable).
  const mockIsBlobStillReferenced = vi.fn().mockResolvedValue(false);
  return {
    mockUploadFile,
    mockGetBlockBlobClient,
    mockCreateIfNotExists,
    mockGetContainerClient,
    mockSasToString,
    mockDeleteBlob,
    mockGetProperties,
    mockSetAccessPolicy,
    mockIsBlobStillReferenced,
  };
});

vi.mock('@/utils/blob-owner', () => ({
  isBlobStillReferenced: mockIsBlobStillReferenced,
  // The cleanup path enumerates equivalent spellings of a URL; the real helper
  // is identity for a cloud URL, which is all this suite needs.
  blobReferenceCandidates: (url: string) => [url],
}));

// The cleanup path now participates in the claim protocol (BUG 9): claim →
// final probe under the claim → tombstone → physical delete. The primitives are
// mocked (the protocol's own ordering is pinned in blob-discard.test.ts and the
// real-Postgres integration suite).
vi.mock('@/utils/blob-claim', () => ({
  claimBlobForDiscard: vi
    .fn()
    .mockResolvedValue({ id: 'claim-cleanup', operationToken: 'tok', kind: 'DISCARD' }),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
  markBlobDiscarded: vi.fn().mockResolvedValue(true),
  markBlobReconcileDone: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/utils/local-upload-store', () => ({
  resolveLocalUploadPath: vi.fn().mockResolvedValue(null),
  removeLocalUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@azure/storage-blob', () => {
  return {
    BlobServiceClient: {
      fromConnectionString: vi.fn().mockReturnValue({
        getContainerClient: mockGetContainerClient,
      }),
    },
    StorageSharedKeyCredential: vi.fn().mockImplementation(function (
      this: { accountName: string; accountKey: string },
      accountName: string,
      accountKey: string
    ) {
      this.accountName = accountName;
      this.accountKey = accountKey;
    }),
    generateBlobSASQueryParameters: vi.fn(() => ({ toString: mockSasToString })),
    BlobSASPermissions: {
      parse: (permissions: string) => ({ permissions }),
    },
  };
});

const CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;AccountName=cipansorstore;AccountKey=fakeKey;EndpointSuffix=core.windows.net';

describe('Cloud Storage Utility (Azure Blob Storage Provider)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns local storage result when Azure is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_ACCOUNT;

    const result = await uploadToCloudStorage('/tmp/dummy.pdf', 'dummy.pdf', 'application/pdf');
    expect(result.provider).toBe('local');
    expect(result.url).toBe('/uploads/dummy.pdf');
  });

  it('uploads a public container with blob-level access and no SAS baked into the URL', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    const result = await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'media-public'
    );
    expect(result.provider).toBe('azure');
    expect(result.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf'
    );
    expect(result.url).not.toContain('?');
    expect(result.containerName).toBe('media-public');
    expect(result.blobName).toBe('dummy.pdf');
    expect(mockCreateIfNotExists).toHaveBeenCalledWith({ access: 'blob' });
    expect(mockUploadFile).toHaveBeenCalledWith('/tmp/dummy.pdf', {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });
  });

  it('re-applies blob access when an existing public container has the wrong policy (F9)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    // Container already exists with no public access: `createIfNotExists` did
    // not apply the policy, so the reconciling read is what has to catch it.
    mockCreateIfNotExists.mockResolvedValueOnce({ succeeded: false });
    mockGetProperties.mockResolvedValueOnce({ blobPublicAccess: undefined });

    await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'media-public'
    );

    expect(mockSetAccessPolicy).toHaveBeenCalledWith('blob');
  });

  it('leaves an existing public container alone when it is already blob-readable (F9)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockCreateIfNotExists.mockResolvedValueOnce({ succeeded: false });
    mockGetProperties.mockResolvedValueOnce({ blobPublicAccess: 'blob' });

    await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'media-public'
    );

    expect(mockSetAccessPolicy).not.toHaveBeenCalled();
  });

  it('fails the upload if a public container cannot be made blob-readable (F9)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockCreateIfNotExists.mockResolvedValueOnce({ succeeded: false });
    mockGetProperties.mockResolvedValueOnce({ blobPublicAccess: undefined });
    mockSetAccessPolicy.mockRejectedValueOnce(new Error('forbidden'));

    // Fail-fast rather than reporting success for a blob no anonymous request
    // can fetch.
    await expect(
      uploadToCloudStorage('/tmp/dummy.pdf', 'dummy.pdf', 'application/pdf', 'media-public')
    ).rejects.toThrow(/Gagal mengunggah berkas ke Azure Blob Storage/);
  });

  it('uploads a private container without baking a SAS; stores a stable blob reference', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    const result = await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'e-office-documents'
    );
    expect(result.provider).toBe('azure');
    expect(result.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf'
    );
    expect(result.url).not.toContain('?');
    expect(result.containerName).toBe('e-office-documents');
    expect(result.blobName).toBe('dummy.pdf');
    expect(mockCreateIfNotExists).toHaveBeenCalledWith({ access: undefined });
  });

  it('records the uploader id in blob metadata so a discard can be authorised (BUG 2)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'cipansor-documents',
      'user-42'
    );

    expect(mockUploadFile).toHaveBeenCalledWith('/tmp/dummy.pdf', {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
      metadata: { uploaderId: 'user-42' },
    });
  });

  it('omits metadata entirely when no uploader is supplied', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'cipansor-documents'
    );

    // The metadata key is absent rather than `undefined`, so a non-request
    // caller keeps the exact call shape it had before.
    expect(mockUploadFile).toHaveBeenCalledWith('/tmp/dummy.pdf', {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });
  });

  it('resolves credentials from the connection string alone when env vars are absent', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_ACCOUNT;
    delete process.env.AZURE_STORAGE_KEY;

    const result = await uploadToCloudStorage(
      '/tmp/dummy.pdf',
      'dummy.pdf',
      'application/pdf',
      'e-office-documents'
    );
    expect(result.provider).toBe('azure');
    expect(result.url).not.toContain('?');
  });

  it('throws when Azure is configured but the upload fails', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockUploadFile.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      uploadToCloudStorage('/tmp/dummy.pdf', 'dummy.pdf', 'application/pdf', 'e-office-documents')
    ).rejects.toThrow(/Gagal mengunggah berkas ke Azure Blob Storage/);
  });

  it('mints a short-lived SAS at request time, never persisted', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    const url = await generateSasUrl('e-office-documents', 'dummy.pdf', 60);
    expect(url).toContain(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf?'
    );
    expect(url).toContain('sig=fakeSasToken');
    expect(mockSasToString).toHaveBeenCalled();
  });

  it('throws when generating a SAS without a usable connection string', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    await expect(generateSasUrl('e-office-documents', 'dummy.pdf')).rejects.toThrow(
      /Kredensial Azure Storage/
    );
  });

  it('reports the correct storage config status', () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_ACCOUNT;

    let config = getStorageConfig();
    expect(config.primaryProvider).toBe('local');
    expect(config.azureConfigured).toBe(false);
    expect(config.azureAccount).toBeNull();

    // Account name alone does not make Azure usable: uploads branch on the
    // connection string, so the config must not advertise Azure otherwise.
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';
    config = getStorageConfig();
    expect(config.primaryProvider).toBe('local');
    expect(config.azureConfigured).toBe(false);
    expect(config.azureAccount).toBe('cipansorstore');

    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    config = getStorageConfig();
    expect(config.primaryProvider).toBe('azure');
    expect(config.azureConfigured).toBe(true);
    expect(config.azureAccount).toBe('cipansorstore');
  });
});

describe('parseBlobUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses a URL for the account this application is configured for', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf')
    ).toEqual({ containerName: 'e-office-documents', blobName: 'naskah.pdf' });
  });

  it('derives the account from the connection string when AZURE_STORAGE_ACCOUNT is unset', () => {
    delete process.env.AZURE_STORAGE_ACCOUNT;
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf')
    ).toEqual({ containerName: 'e-office-documents', blobName: 'naskah.pdf' });
  });

  it('REJECTS a foreign Azure account (BUG 2)', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    // Same container/blob path, different account: signing this with our own
    // key would mint a link for a blob we do not own.
    expect(
      parseBlobUrl('https://attackerstore.blob.core.windows.net/e-office-documents/naskah.pdf')
    ).toBeNull();
    expect(
      parseBlobUrl('https://other.blob.core.windows.net/cipansor-documents/ktp.pdf')
    ).toBeNull();
  });

  it('REJECTS every blob host when no account is configured (fail closed)', () => {
    delete process.env.AZURE_STORAGE_ACCOUNT;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf')
    ).toBeNull();
  });

  it('matches the configured account case-insensitively', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'CipansorStore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents/a.pdf')
    ).toEqual({ containerName: 'e-office-documents', blobName: 'a.pdf' });
  });

  it('decodes URL-encoded container/blob names', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl(
        'https://cipansorstore.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg'
      )
    ).toEqual({ containerName: 'student-documents', blobName: 'foto siswa/1.jpg' });
  });

  it('ignores a query string on the blob URL', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl(
        'https://cipansorstore.blob.core.windows.net/e-office-documents/a.pdf?sv=1&sig=x'
      )
    ).toEqual({ containerName: 'e-office-documents', blobName: 'a.pdf' });
  });

  it('returns null for a local /uploads URL', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(parseBlobUrl('https://cipansor.or.id/uploads/a.pdf')).toBeNull();
  });

  it('returns null for a non-blob external URL', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(parseBlobUrl('https://example.com/a.pdf')).toBeNull();
  });

  it('returns null (no throw) for a malformed percent-escape in the path (BUG 5)', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    // `decodeURIComponent('%zz')` throws URIError; a stored URL with a broken
    // escape used to escape the parser's try/catch and 500 /upload/sas and
    // /upload/discard. It must be a clean null instead.
    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/cipansor-documents/%zz.pdf')
    ).toBeNull();
    expect(parseBlobUrl('https://cipansorstore.blob.core.windows.net/%zz/broken.pdf')).toBeNull();
  });

  it('returns null for a lookalike host that merely contains the account name', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net.attacker.com/a/b.pdf')
    ).toBeNull();
    expect(parseBlobUrl('https://evil-cipansorstore.blob.core.windows.net/a/b.pdf')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(parseBlobUrl('not-a-url')).toBeNull();
  });

  it('returns null for a URL with no blob path', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents')
    ).toBeNull();
  });
});

describe('deleteFromCloudStorage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws StorageUnavailableError (never a silent success) when Azure is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    // The old contract resolved here, so reconciliation marked the blob DONE
    // and never retried it after credentials were restored. A missing
    // credential is "no remote delete happened", which is a failure.
    await expect(
      deleteFromCloudStorage('e-office-documents', 'naskah.pdf')
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('reports `unavailable` from the explicit-outcome helper without touching Azure', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    await expect(
      deleteBlobFromCloudStorage('e-office-documents', 'naskah.pdf')
    ).resolves.toBe('unavailable');
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('reports `deleted` from the explicit-outcome helper when Azure is configured', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    await expect(
      deleteBlobFromCloudStorage('e-office-documents', 'naskah.pdf')
    ).resolves.toBe('deleted');
    expect(mockDeleteBlob).toHaveBeenCalledWith('naskah.pdf', {
      deleteSnapshots: 'include',
    });
  });

  it('reports `already-absent` from the explicit-outcome helper for a 404', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('The specified blob does not exist.'), { code: 'BlobNotFound' })
    );

    await expect(
      deleteBlobFromCloudStorage('e-office-documents', 'already-gone.pdf')
    ).resolves.toBe('already-absent');
  });

  it('deletes the blob including its snapshots when Azure is configured', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;

    await deleteFromCloudStorage('e-office-documents', 'naskah.pdf');

    expect(mockDeleteBlob).toHaveBeenCalledWith('naskah.pdf', {
      deleteSnapshots: 'include',
    });
    expect(mockGetContainerClient).toHaveBeenCalledWith('e-office-documents');
  });

  it('throws when the remote delete fails', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(new Error('Network error'));

    await expect(deleteFromCloudStorage('e-office-documents', 'naskah.pdf')).rejects.toThrow(
      /Gagal menghapus berkas dari Azure Blob Storage/
    );
  });

  // ── Flag 10: a 404 must be an idempotent success, not a permanent failure ──

  it('treats BlobNotFound as an idempotent success (flag 10)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('The specified blob does not exist.'), { code: 'BlobNotFound' })
    );

    await expect(
      deleteFromCloudStorage('e-office-documents', 'already-gone.pdf')
    ).resolves.toBeUndefined();
  });

  it('treats a bare 404 status as an idempotent success', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { statusCode: 404 })
    );

    await expect(
      deleteFromCloudStorage('e-office-documents', 'already-gone.pdf')
    ).resolves.toBeUndefined();
  });

  it('does NOT swallow an authentication error (401/403)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('AuthenticationFailed'), { statusCode: 403 })
    );

    await expect(deleteFromCloudStorage('e-office-documents', 'a.pdf')).rejects.toThrow(
      /Gagal menghapus berkas/
    );
  });

  it('does NOT swallow throttling (429) or a 5xx server error', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    );
    await expect(deleteFromCloudStorage('e-office-documents', 'a.pdf')).rejects.toThrow(
      /Gagal menghapus berkas/
    );

    mockDeleteBlob.mockRejectedValueOnce(
      Object.assign(new Error('Server Busy'), { statusCode: 503 })
    );
    await expect(deleteFromCloudStorage('e-office-documents', 'a.pdf')).rejects.toThrow(
      /Gagal menghapus berkas/
    );
  });

  it('does NOT treat an unrelated 404-message as not-found (stable code over free text)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    // No `code`/`statusCode`, just a message that mentions 404: must still throw.
    mockDeleteBlob.mockRejectedValueOnce(new Error('request failed with status 404 somewhere'));

    await expect(deleteFromCloudStorage('e-office-documents', 'a.pdf')).rejects.toThrow(
      /Gagal menghapus berkas/
    );
  });
});

describe('getBlobUploaderId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the uploader recorded at upload time (BUG 2)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockGetProperties.mockResolvedValue({ metadata: { uploaderId: 'user-7' } });

    await expect(getBlobUploaderId('cipansor-documents', 'a.pdf')).resolves.toBe('user-7');
  });

  it('returns null for a blob with no recorded uploader (refused by the caller)', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockGetProperties.mockResolvedValue({ metadata: {} });

    await expect(getBlobUploaderId('cipansor-documents', 'a.pdf')).resolves.toBeNull();
  });

  it('returns null when Azure is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    await expect(getBlobUploaderId('cipansor-documents', 'a.pdf')).resolves.toBeNull();
  });

  it('returns null (fail-closed) when properties cannot be read', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    mockGetProperties.mockRejectedValueOnce(new Error('Not found'));

    await expect(getBlobUploaderId('cipansor-documents', 'a.pdf')).resolves.toBeNull();
  });
});

describe('cleanupBlobBestEffort', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deletes the blob only once no record references the URL', async () => {
    mockIsBlobStillReferenced.mockResolvedValueOnce(false);

    await expect(
      cleanupBlobBestEffort(
        'https://cipansorstore.blob.core.windows.net/cipansor-documents/9f1c.pdf'
      )
    ).resolves.toBe(true);

    expect(mockIsBlobStillReferenced).toHaveBeenCalledWith(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/9f1c.pdf'
    );
    expect(mockDeleteBlob).toHaveBeenCalledWith('9f1c.pdf', { deleteSnapshots: 'include' });
  });

  it('REFUSES to delete a blob another record still references (BUG: shared-URL destruction)', async () => {
    // The URL-uniqueness assumption does not hold across all data: a copy/clone
    // path or legacy import can point a second record at the same blob. The
    // deleting record is gone, but that other record still needs the file.
    mockIsBlobStillReferenced.mockResolvedValueOnce(true);

    await expect(
      cleanupBlobBestEffort(
        'https://cipansorstore.blob.core.windows.net/cipansor-documents/shared.pdf'
      )
    ).resolves.toBe(false);

    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('REFUSES to delete a blob hosted on a foreign Azure account (BUG 2)', async () => {
    await expect(
      cleanupBlobBestEffort('https://attackerstore.blob.core.windows.net/cipansor-documents/x.pdf')
    ).resolves.toBe(false);

    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('returns false and does not throw for a non-blob URL', async () => {
    await expect(cleanupBlobBestEffort('https://cipansor.or.id/uploads/a.pdf')).resolves.toBe(
      false
    );
    await expect(cleanupBlobBestEffort(null)).resolves.toBe(false);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('swallows a remote delete failure and reports it as false', async () => {
    mockDeleteBlob.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      cleanupBlobBestEffort('https://cipansorstore.blob.core.windows.net/cipansor-documents/a.pdf')
    ).resolves.toBe(false);
  });

  it('reports false when credentials are missing (not a phantom cleanup)', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    // The cloud URL is only parsed when the configured account matches, so this
    // reaches the delete path. With no connection string there is no remote
    // delete, and the caller must be told the blob was not cleaned.
    await expect(
      cleanupBlobBestEffort('https://cipansorstore.blob.core.windows.net/cipansor-documents/a.pdf')
    ).resolves.toBe(false);
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('swallows a reference-probe failure after the record delete (BUG 2)', async () => {
    // The probe is a DB query that runs AFTER the caller's row is gone. A throw
    // here would fail a request whose delete already committed, and the retry
    // would find no record left to delete — an unrecoverable-looking error for
    // a cleanup that is supposed to be best-effort.
    mockIsBlobStillReferenced.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      cleanupBlobBestEffort('https://cipansorstore.blob.core.windows.net/cipansor-documents/a.pdf')
    ).resolves.toBe(false);

    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('never deletes a blob when the probe fails (fail-closed)', async () => {
    // A probe that cannot prove "no record references this" must not be read as
    // an orphan: the safe direction is to leave the blob rather than destroy a
    // file a live record may still point at.
    mockIsBlobStillReferenced.mockRejectedValueOnce(new Error('timeout'));

    await cleanupBlobBestEffort(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/maybe-live.pdf'
    );

    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });
});

describe('isAllowedContainer', () => {
  it('accepts every application-owned container', () => {
    expect(isAllowedContainer('cipansor-documents')).toBe(true);
    expect(isAllowedContainer('e-office-documents')).toBe(true);
    expect(isAllowedContainer('student-documents')).toBe(true);
    expect(isAllowedContainer('media-public')).toBe(true);
  });

  it('rejects foreign or unknown containers', () => {
    expect(isAllowedContainer('human-resources')).toBe(false);
    expect(isAllowedContainer('secret-reports')).toBe(false);
    expect(isAllowedContainer('')).toBe(false);
  });
});

describe('containerForDestination', () => {
  it('maps every known destination to an allowed container', () => {
    for (const destination of UPLOAD_DESTINATIONS) {
      const container = containerForDestination(destination);
      expect(isAllowedContainer(container)).toBe(true);
    }
  });

  it('maps media-public to the blob-level public container and private to the default', () => {
    expect(containerForDestination('media-public')).toBe('media-public');
    expect(containerForDestination('private')).toBe('cipansor-documents');
    expect(containerForDestination('e-office')).toBe('e-office-documents');
    expect(containerForDestination('student')).toBe('student-documents');
  });

  it('falls back to the private container for missing or unknown destinations', () => {
    // A caller naming a container directly, or sending nonsense, must never be
    // able to publish a file: only a known purpose selects a container.
    expect(containerForDestination(undefined)).toBe('cipansor-documents');
    expect(containerForDestination(null)).toBe('cipansor-documents');
    expect(containerForDestination('')).toBe('cipansor-documents');
    expect(containerForDestination('media-public-2')).toBe('cipansor-documents');
    expect(containerForDestination('cipansor-documents')).toBe('cipansor-documents');
  });

  it('only accepts exact destination tokens', () => {
    expect(isUploadDestination('media-public')).toBe(true);
    expect(isUploadDestination('MEDIA-PUBLIC')).toBe(false);
    expect(isUploadDestination(' media-public')).toBe(false);
    expect(isUploadDestination(3)).toBe(false);
    expect(isUploadDestination(undefined)).toBe(false);
  });
});

/**
 * BUG 8: `cleanupBlobBestEffort` returned false for any `/uploads/...` URL
 * because `parseBlobUrl` yields null, so local files and their sidecars leaked
 * on every record delete. BUG 9: the probe-then-delete was not claim-guarded.
 * The tests above cover the Azure path; these cover the local path and the
 * claim participation.
 */
describe('cleanupBlobBestEffort — local uploads & claim protocol (BUG 8 / BUG 9)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    process.env.AZURE_STORAGE_CONNECTION_STRING = CONNECTION_STRING;
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';
    mockIsBlobStillReferenced.mockResolvedValue(false);
    (resolveLocalUploadPath as any).mockResolvedValue(null);
    (removeLocalUpload as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deletes a local /uploads file and its sidecar instead of silently returning false', async () => {
    (resolveLocalUploadPath as any).mockResolvedValue('/tmp/uploads-test/a.png');

    await expect(cleanupBlobBestEffort('/uploads/a.png')).resolves.toBe(true);

    expect(removeLocalUpload).toHaveBeenCalledWith('/tmp/uploads-test/a.png');
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('keeps a local file a live record still references', async () => {
    (resolveLocalUploadPath as any).mockResolvedValue('/tmp/uploads-test/a.png');
    mockIsBlobStillReferenced.mockResolvedValue(true);

    await expect(cleanupBlobBestEffort('/uploads/a.png')).resolves.toBe(false);
    expect(removeLocalUpload).not.toHaveBeenCalled();
  });

  it('reports false for a local path that is missing or escapes the uploads root', async () => {
    (resolveLocalUploadPath as any).mockResolvedValue(null);
    await expect(cleanupBlobBestEffort('/uploads/missing.png')).resolves.toBe(false);
    expect(removeLocalUpload).not.toHaveBeenCalled();
  });

  it('leaves an external/malformed URL entirely alone', async () => {
    await expect(cleanupBlobBestEffort('https://evil.example.com/x.png')).resolves.toBe(false);
    expect(removeLocalUpload).not.toHaveBeenCalled();
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it('takes a claim, re-probes under it, then tombstones before deleting (BUG 9)', async () => {
    const order: string[] = [];
    (claimBlobForDiscard as any).mockImplementation(async () => {
      order.push('claim');
      return { id: 'claim-cleanup', operationToken: 'tok', kind: 'DISCARD' };
    });
    mockIsBlobStillReferenced.mockImplementation(async () => {
      order.push('probe');
      return false;
    });
    (markBlobDiscarded as any).mockImplementation(async () => {
      order.push('tombstone');
      return true;
    });
    mockDeleteBlob.mockImplementation(async () => {
      order.push('delete');
    });

    await expect(
      cleanupBlobBestEffort('https://cipansorstore.blob.core.windows.net/cipansor-documents/a.pdf')
    ).resolves.toBe(true);

    expect(order).toEqual(['claim', 'probe', 'tombstone', 'delete']);
  });

  it('does not delete when another operation already holds the claim (BUG 9)', async () => {
    (claimBlobForDiscard as any).mockResolvedValue(null);

    await expect(
      cleanupBlobBestEffort('https://cipansorstore.blob.core.windows.net/cipansor-documents/a.pdf')
    ).resolves.toBe(false);

    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });
});
