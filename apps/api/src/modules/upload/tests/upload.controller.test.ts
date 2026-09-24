import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/utils/cloud-storage', () => {
  return {
    generateSasUrl: vi
      .fn()
      .mockResolvedValue(
        'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf?sig=fakeSas&se=2026-01-01T00%3A00%3A00Z'
      ),
    parseBlobUrl: vi.fn().mockImplementation((url: string) => {
      const m = url.match(/^https?:\/\/[^/]+\.blob\.core\.windows\.net\/([^/?]+)\/([^?#]+)/);
      return m ? { containerName: m[1], blobName: m[2] } : null;
    }),
    isPublicContainer: vi.fn((name: string) => name === 'media-public'),
    isAllowedContainer: vi.fn(() => true),
    deleteFromCloudStorage: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../upload.service', () => {
  return {
    resolveSasForBlob: vi.fn(),
    discardOrphanBlob: vi.fn(),
  };
});

vi.mock('@/middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('@/middleware/auth')>('@/middleware/auth');
  return {
    ...actual,
    requireUser: vi.fn((req: any) => req.user),
  };
});

import { uploadController } from '../upload.controller';
import { resolveSasForBlob, discardOrphanBlob } from '../upload.service';

const baseUser = { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: 'unit-1', permissions: [] };

function makeReq(partial: Partial<Request> = {}): Request {
  return {
    body: {},
    protocol: 'https',
    get: vi.fn(() => 'cipansor.or.id'),
    user: baseUser,
    ...partial,
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

function makeNext() {
  return vi.fn();
}

/**
 * `asyncHandler` routes a rejection to `next` through a `.catch()`, so the
 * handler promise settles one microtask before `next` is called.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('uploadController.uploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes a missing file through the standard asyncHandler (400 BAD_REQUEST)', async () => {
    const req = makeReq({ file: undefined });
    const res = makeRes();
    const next = makeNext();

    await uploadController.uploadFile(req, res, next);
    await flush();

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('keeps url stable (raw blob) and omits downloadUrl for a public container', async () => {
    const req = makeReq({
      file: {
        filename: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File,
      body: {
        fileUrl: 'https://cipansorstore.blob.core.windows.net/media-public/dummy.pdf',
        fileContainerName: 'media-public',
        fileBlobName: 'dummy.pdf',
      },
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(200);
    const data = (res.json as any).mock.calls[0][0].data;
    // url must remain the stable raw reference, NOT a SAS
    expect(data.url).toBe('https://cipansorstore.blob.core.windows.net/media-public/dummy.pdf');
    expect(data.downloadUrl).toBeUndefined();
    expect(data.containerName).toBe('media-public');
    expect(data.blobName).toBe('dummy.pdf');
  });

  it('keeps url as the stable raw blob URL and exposes a temporary downloadUrl for a private container', async () => {
    const req = makeReq({
      file: {
        filename: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File,
      body: {
        fileUrl: 'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf',
        fileContainerName: 'e-office-documents',
        fileBlobName: 'dummy.pdf',
      },
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(200);
    const data = (res.json as any).mock.calls[0][0].data;
    // STABLE: consumers must persist url, which is the raw blob URL (no SAS)
    expect(data.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf'
    );
    expect(data.url).not.toContain('sig=');
    // TEMPORARY: downloadUrl carries the short-lived SAS for immediate access
    expect(data.downloadUrl).toContain('sig=fakeSas');
    expect(data.downloadUrl).toContain('/e-office-documents/dummy.pdf?');
  });

  it('omits downloadUrl (keeps raw url) when SAS generation fails', async () => {
    const { generateSasUrl } = await import('@/utils/cloud-storage');
    (generateSasUrl as any).mockRejectedValueOnce(new Error('no connection string'));

    const req = makeReq({
      file: {
        filename: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File,
      body: {
        fileUrl: 'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf',
        fileContainerName: 'e-office-documents',
        fileBlobName: 'dummy.pdf',
      },
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res, makeNext());

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf'
    );
    expect(data.downloadUrl).toBeUndefined();
  });
});

describe('uploadController.getSasUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing url via the standard Zod validation error (400)', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    const next = makeNext();

    await uploadController.getSasUrl(req, res, next);
    await flush();

    // Zod rejects synchronously; asyncHandler hands it to the error middleware.
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(resolveSasForBlob).not.toHaveBeenCalled();
  });

  it('delegates a local /uploads URL to the service (no SAS needed)', async () => {
    (resolveSasForBlob as any).mockResolvedValue({
      url: 'https://cipansor.or.id/uploads/a.pdf',
    });
    const req = makeReq({ body: { url: 'https://cipansor.or.id/uploads/a.pdf' } });
    const res = makeRes();

    await uploadController.getSasUrl(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(resolveSasForBlob).toHaveBeenCalledWith(
      'https://cipansor.or.id/uploads/a.pdf',
      baseUser
    );
    const data = (res.json as any).mock.calls[0][0].data;
    expect(data).toEqual({ url: 'https://cipansor.or.id/uploads/a.pdf' });
  });

  it('returns the SAS minted by the service for an accessible private blob', async () => {
    (resolveSasForBlob as any).mockResolvedValue({
      url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf',
      downloadUrl:
        'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf?sig=fakeSas',
    });
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf' },
    });
    const res = makeRes();

    await uploadController.getSasUrl(req, res, makeNext());

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.downloadUrl).toContain('sig=fakeSas');
  });

  it('propagates a service FORBIDDEN error (standard middleware -> 403)', async () => {
    const err = new Error('Anda tidak berwenang mengakses berkas tersebut');
    (err as any).code = 'FORBIDDEN';
    (err as any).statusCode = 403;
    vi.mocked(resolveSasForBlob).mockImplementationOnce(async () => {
      throw err;
    });
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/cipansor-documents/naskah.pdf' },
    });
    const res = makeRes();
    const next = makeNext();

    await uploadController.getSasUrl(req, res, next);
    await flush();

    expect((next.mock.calls[0]?.[0] as any)?.statusCode).toBe(403);
  });
});

describe('uploadController.discardUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discards an orphan blob for the authenticated actor', async () => {
    (discardOrphanBlob as any).mockResolvedValue(undefined);
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/cipansor-documents/orphan.pdf' },
    });
    const res = makeRes();

    await uploadController.discardUpload(req, res, makeNext());

    expect(discardOrphanBlob).toHaveBeenCalledWith(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/orphan.pdf',
      baseUser
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
