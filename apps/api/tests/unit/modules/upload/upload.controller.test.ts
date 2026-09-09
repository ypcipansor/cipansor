import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { uploadController } from '@/modules/upload/upload.controller';

describe('UploadController', () => {
  describe('uploadFile', () => {
    it('should return 400 if no file is uploaded', async () => {
      const req = {
        file: undefined,
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await uploadController.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        data: null,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded',
        },
      });
    });

    it('should return file details if file is uploaded', async () => {
      const req = {
        file: {
          filename: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        },
        protocol: 'http',
        get: vi.fn().mockReturnValue('localhost:3000'),
        body: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await uploadController.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          url: 'http://localhost:3000/uploads/test.jpg',
          filename: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        },
      });
    });
  });
});
