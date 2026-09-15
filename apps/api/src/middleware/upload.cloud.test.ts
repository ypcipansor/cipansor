import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

const { mockUploadToCloudStorage } = vi.hoisted(() => {
  return {
    mockUploadToCloudStorage: vi.fn().mockResolvedValue({
      provider: 'azure',
      url: 'https://cipansorstore.blob.core.windows.net/e-office-documents/x.png',
      containerName: 'e-office-documents',
      blobName: 'x.png',
    }),
  };
});

vi.mock('@/utils/cloud-storage', () => {
  return {
    uploadToCloudStorage: mockUploadToCloudStorage,
  };
});

vi.mock('multer', () => {
  class MulterErrorMock extends Error {
    code = 'MULTER_ERROR';
  }
  const single = vi.fn((field: string) => (req: any, _res: any, cb: any) => {
    req.file = (req as any).__fileToAssign;
    cb();
  });
  const defaultFn = vi.fn(() => ({
    single,
  }));
  (defaultFn as any).diskStorage = vi.fn(() => ({}));
  (defaultFn as any).MulterError = MulterErrorMock;
  return { default: defaultFn };
});

import { handleSingleUpload } from './upload';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function tmpFile(content: Buffer): string {
  const p = path.join(os.tmpdir(), `upload-cloud-${Date.now()}-${Math.random()}`);
  fs.writeFileSync(p, content);
  return p;
}

describe('handleSingleUpload cloud failure', () => {
  it('deletes the staging file when the Azure upload rejects', async () => {
    const p = tmpFile(png);
    const req = {
      body: {},
      file: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
      __fileToAssign: {
        filename: 'x.png',
        originalname: 'x.png',
        mimetype: 'image/png',
        size: png.length,
        path: p,
      },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    mockUploadToCloudStorage.mockRejectedValueOnce(new Error('network down'));

    const handler = handleSingleUpload('file');
    handler(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // The staging file must not outlive a failed cloud upload.
    expect(fs.existsSync(p)).toBe(false);
  });
});
