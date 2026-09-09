import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uploadToCloudStorage, generateSasUrl, getStorageConfig } from './cloud-storage';

const {
  mockUploadFile,
  mockCreateIfNotExists,
  mockGetContainerClient,
  mockSasToString,
} = vi.hoisted(() => {
  const mockUploadFile = vi.fn().mockResolvedValue({});
  const mockGetBlockBlobClient = vi.fn().mockReturnValue({
    uploadFile: mockUploadFile,
    url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf',
  });
  const mockCreateIfNotExists = vi.fn().mockResolvedValue({});
  const mockGetContainerClient = vi.fn().mockReturnValue({
    createIfNotExists: mockCreateIfNotExists,
    getBlockBlobClient: mockGetBlockBlobClient,
  });
  const mockSasToString = vi.fn(() => 'sig=fakeSasToken&se=2026-01-01T00%3A00%3A00Z');
  return {
    mockUploadFile,
    mockGetBlockBlobClient,
    mockCreateIfNotExists,
    mockGetContainerClient,
    mockSasToString,
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
