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
  };
});

vi.mock('../upload.service', () => {
  return {
    resolveSasForBlob: vi.fn(),
  };
});

import { uploadController } from '../upload.controller';
import { resolveSasForBlob } from '../upload.service';

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

describe('uploadController.uploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 NO_FILE when no file was uploaded', async () => {
    const req = makeReq({ file: undefined });
    const res = makeRes();

    await uploadController.uploadFile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as any).mock.calls[0][0].error.code).toBe('NO_FILE');
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

    await uploadController.uploadFile(req, res);

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

    await uploadController.uploadFile(req, res);

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
    expect(data.containerName).toBe('e-office-documents');
    expect(data.blobName).toBe('dummy.pdf');
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

    await uploadController.uploadFile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf'
    );
    expect(data.downloadUrl).toBeUndefined();
  });

  it('returns the middleware fileUrl when present without container metadata', async () => {
    const req = makeReq({
      file: {
        filename: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File,
      body: { fileUrl: 'https://blob.example.com/stable/dummy.pdf' },
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res);

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe('https://blob.example.com/stable/dummy.pdf');
    expect(data.downloadUrl).toBeUndefined();
  });

  it('builds the local /uploads URL when the middleware set no fileUrl', async () => {
    const req = makeReq({
      file: {
        filename: 'dummy.pdf',
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File,
      body: {},
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res);

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe('https://cipansor.or.id/uploads/dummy.pdf');
  });
});

describe('uploadController.getSasUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 URL_REQUIRED when no url is provided', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as any).mock.calls[0][0].error.code).toBe('URL_REQUIRED');
    expect(resolveSasForBlob).not.toHaveBeenCalled();
  });

  it('delegates a local /uploads URL to the service (no SAS needed)', async () => {
    (resolveSasForBlob as any).mockResolvedValue({
      url: 'https://cipansor.or.id/uploads/a.pdf',
    });
    const req = makeReq({ body: { url: 'https://cipansor.or.id/uploads/a.pdf' } });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(resolveSasForBlob).toHaveBeenCalledWith(
      'https://cipansor.or.id/uploads/a.pdf',
      baseUser
    );
    const data = (res.json as any).mock.calls[0][0].data;
    expect(data).toEqual({ url: 'https://cipansor.or.id/uploads/a.pdf' });
    expect(data.downloadUrl).toBeUndefined();
  });

  it('returns the service result for a public blob URL (no downloadUrl)', async () => {
    (resolveSasForBlob as any).mockResolvedValue({
      url: 'https://cipansorstore.blob.core.windows.net/media-public/pic.jpg',
    });
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/media-public/pic.jpg' },
    });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.downloadUrl).toBeUndefined();
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

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf'
    );
    expect(data.downloadUrl).toContain('sig=fakeSas');
    expect(resolveSasForBlob).toHaveBeenCalledWith(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf',
      baseUser
    );
  });

  it('maps a service FORBIDDEN error to a 403 FORBIDDEN response', async () => {
    const err = new Error('Anda tidak berwenang mengakses berkas tersebut');
    (err as any).statusCode = 403;
    (resolveSasForBlob as any).mockRejectedValueOnce(err);
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf' },
    });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as any).mock.calls[0][0].error.code).toBe('FORBIDDEN');
  });

  it('returns 500 SAS_ERROR when SAS generation fails', async () => {
    (resolveSasForBlob as any).mockRejectedValueOnce(new Error('boom'));
    const req = makeReq({
      body: { url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf' },
    });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as any).mock.calls[0][0].error.code).toBe('SAS_ERROR');
  });

  it('rejects when the route lacks an authenticated user', async () => {
    const req = makeReq({ user: undefined, body: { url: 'https://x.windows.net/a/b' } });
    const res = makeRes();

    await uploadController.getSasUrl(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
