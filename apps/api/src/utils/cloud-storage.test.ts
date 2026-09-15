import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadToCloudStorage,
  generateSasUrl,
  getStorageConfig,
  parseBlobUrl,
  deleteFromCloudStorage,
  isAllowedContainer,
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
  it('parses a raw blob URL into container and blob', () => {
    expect(
      parseBlobUrl('https://acct.blob.core.windows.net/e-office-documents/naskah.pdf')
    ).toEqual({ containerName: 'e-office-documents', blobName: 'naskah.pdf' });
  });

  it('decodes URL-encoded container/blob names', () => {
    expect(
      parseBlobUrl('https://acct.blob.core.windows.net/student-documents/foto%20siswa%2F1.jpg')
    ).toEqual({ containerName: 'student-documents', blobName: 'foto siswa/1.jpg' });
  });

  it('ignores a query string on the blob URL', () => {
    expect(
      parseBlobUrl('https://acct.blob.core.windows.net/e-office-documents/a.pdf?sv=1&sig=x')
    ).toEqual({ containerName: 'e-office-documents', blobName: 'a.pdf' });
  });

  it('returns null for a local /uploads URL', () => {
    expect(parseBlobUrl('https://cipansor.or.id/uploads/a.pdf')).toBeNull();
  });

  it('returns null for a non-blob external URL', () => {
    expect(parseBlobUrl('https://example.com/a.pdf')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseBlobUrl('not-a-url')).toBeNull();
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
