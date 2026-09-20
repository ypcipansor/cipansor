import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadToCloudStorage,
  generateSasUrl,
  getStorageConfig,
  parseBlobUrl,
  deleteFromCloudStorage,
  isAllowedContainer,
  cleanupBlobBestEffort,

  getBlobUploaderId,
  containerForDestination,
  isUploadDestination,
  UPLOAD_DESTINATIONS,
} from './cloud-storage';

const {
  mockUploadFile,
  mockCreateIfNotExists,
  mockGetContainerClient,
  mockSasToString,
  mockDeleteBlob,
  mockGetProperties,
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
  const mockCreateIfNotExists = vi.fn().mockResolvedValue({});
  const mockGetContainerClient = vi.fn().mockReturnValue({
    createIfNotExists: mockCreateIfNotExists,
    getBlockBlobClient: mockGetBlockBlobClient,
    deleteBlob: mockDeleteBlob,
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
    mockIsBlobStillReferenced,
  };
});

vi.mock('@/utils/blob-owner', () => ({
  isBlobStillReferenced: mockIsBlobStillReferenced,
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

  it('no-ops (resolves) when Azure is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    await expect(
      deleteFromCloudStorage('e-office-documents', 'naskah.pdf')
    ).resolves.toBeUndefined();
    expect(mockDeleteBlob).not.toHaveBeenCalled();
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
