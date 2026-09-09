import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/utils/cloud-storage', () => {
  return {
    generateSasUrl: vi.fn().mockResolvedValue(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/dummy.pdf?sig=fakeSas&se=2026-01-01T00%3A00%3A00Z'
    ),
  };
});

import { uploadController } from '../upload.controller';

function makeReq(partial: Partial<Request> = {}): Request {
  return {
    body: {},
    protocol: 'https',
    get: vi.fn(() => 'cipansor.or.id'),
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

  it('returns the middleware fileUrl (raw blob) for a public container', async () => {
    const req = makeReq({
      file: { filename: 'dummy.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File,
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
    expect(data.url).toBe(
      'https://cipansorstore.blob.core.windows.net/media-public/dummy.pdf'
    );
  });

  it('serves a private container via on-demand SAS instead of the raw blob URL', async () => {
    const req = makeReq({
      file: { filename: 'dummy.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File,
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
    expect(data.url).toContain('sig=fakeSas');
    expect(data.url).toContain('/e-office-documents/dummy.pdf?');
  });

  it('falls back to the raw URL when SAS generation fails', async () => {
    const { generateSasUrl } = await import('@/utils/cloud-storage');
    (generateSasUrl as any).mockRejectedValueOnce(new Error('no connection string'));

    const req = makeReq({
      file: { filename: 'dummy.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File,
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
  });

  it('returns the middleware fileUrl when present without container metadata', async () => {
    const req = makeReq({
      file: { filename: 'dummy.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File,
      body: { fileUrl: 'https://blob.example.com/stable/dummy.pdf' },
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res);

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe('https://blob.example.com/stable/dummy.pdf');
  });

  it('builds the local /uploads URL when the middleware set no fileUrl', async () => {
    const req = makeReq({
      file: { filename: 'dummy.pdf', mimetype: 'application/pdf', size: 100 } as Express.Multer.File,
      body: {},
    });
    const res = makeRes();

    await uploadController.uploadFile(req, res);

    const data = (res.json as any).mock.calls[0][0].data;
    expect(data.url).toBe('https://cipansor.or.id/uploads/dummy.pdf');
  });
});
