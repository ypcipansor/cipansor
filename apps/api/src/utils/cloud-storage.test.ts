import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadToCloudStorage,
  generateSasUrl,
  getStorageConfig,
  parseBlobUrl,
  deleteFromCloudStorage,
  isAllowedContainer,
  cleanupBlobBestEffort,
} from './cloud-storage';

const {
  mockUploadFile,
  mockCreateIfNotExists,
  mockGetContainerClient,
  mockSasToString,
  mockDeleteBlob,
} = vi.hoisted(() => {
  const mockUploadFile = vi.fn().mockResolvedValue({});
  const mockDeleteBlob = vi.fn().mockResolvedValue({});
  const mockGetBlockBlobClient = vi.fn().mockReturnValue({
    uploadFile: mockUploadFile,
    url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf',
  });
  const mockCreateIfNotExists = vi.fn().mockResolvedValue({});
  const mockGetContainerClient = vi.fn().mockReturnValue({
    createIfNotExists: mockCreateIfNotExists,
    getBlockBlobClient: mockGetBlockBlobClient,
    deleteBlob: mockDeleteBlob,
  });
  const mockSasToString = vi.fn(() => 'sig=fakeSasToken&se=2026-01-01T00%3A00%3A00Z');
  return {
    mockUploadFile,
    mockGetBlockBlobClient,
    mockCreateIfNotExists,
    mockGetContainerClient,
    mockSasToString,
    mockDeleteBlob,
  };
});

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
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg')
    ).toEqual({ containerName: 'student-documents', blobName: 'foto siswa/1.jpg' });
  });

  it('ignores a query string on the blob URL', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net/e-office-documents/a.pdf?sv=1&sig=x')
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

  it('returns null for a lookalike host that merely contains the account name', () => {
    process.env.AZURE_STORAGE_ACCOUNT = 'cipansorstore';

    expect(
      parseBlobUrl('https://cipansorstore.blob.core.windows.net.attacker.com/a/b.pdf')
    ).toBeNull();
    expect(
      parseBlobUrl('https://evil-cipansorstore.blob.core.windows.net/a/b.pdf')
    ).toBeNull();
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

  it('deletes the blob for a URL on this account (BUG 3: URL uniqueness assumed)', async () => {
    // The recorded filename is a per-upload crypto.randomUUID (see
    // `uploadFilenameFor` in middleware/upload.ts and its uniqueness test), so
    // the URL identifies exactly one upload and no cross-record probe is
    // needed. If a copy/clone path is ever added it must call `findBlobOwner`
    // first — the assumption this test pins.
    await expect(
      cleanupBlobBestEffort(
        'https://cipansorstore.blob.core.windows.net/cipansor-documents/9f1c.pdf'
      )
    ).resolves.toBe(true);

    expect(mockDeleteBlob).toHaveBeenCalledWith('9f1c.pdf', { deleteSnapshots: 'include' });
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
