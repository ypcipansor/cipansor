import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { complaintsController } from '../complaints.controller';
import { complaintsService } from '../complaints.service';

vi.mock('../complaints.service', () => ({
  complaintsService: {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateStatus: vi.fn(),
    assignHandler: vi.fn(),
    addComment: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    complaint: {
      findUnique: vi.fn(),
    },
  },
}));

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { sub: 'user-1', role: 'SUPER_ADMIN', unitId: 'unit-1' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) {
      (this as any).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
  } as unknown as Response & { statusCode: number; jsonPayload: any };

  return { req, res };
}

describe('complaintsController validation errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('returns 400 Validation error with errors array when payload is invalid', async () => {
      const { req, res } = mockReqRes({ body: {} }); // Invalid empty payload
      await complaintsController.create(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonPayload).toHaveProperty('message', 'Validation error');
      expect(res.jsonPayload).toHaveProperty('errors');
      expect(Array.isArray(res.jsonPayload.errors)).toBe(true);
      expect(res.jsonPayload.errors.length).toBeGreaterThan(0);
      expect(res.jsonPayload.errors[0]).toHaveProperty('code');
      expect(res.jsonPayload.errors[0]).toHaveProperty('message');
      expect(res.jsonPayload.errors[0]).toHaveProperty('path');
      expect(complaintsService.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('returns 400 Validation error with errors array when status payload is invalid', async () => {
      const { req, res } = mockReqRes({ params: { id: 'c-1' } as any, body: { status: 'INVALID_STATUS' } });
      await complaintsController.updateStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonPayload).toHaveProperty('message', 'Validation error');
      expect(res.jsonPayload).toHaveProperty('errors');
      expect(Array.isArray(res.jsonPayload.errors)).toBe(true);
      expect(res.jsonPayload.errors.length).toBeGreaterThan(0);
      expect(complaintsService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('assignHandler', () => {
    it('returns 400 Validation error with errors array when handlerId is invalid', async () => {
      const { req, res } = mockReqRes({ params: { id: 'c-1' } as any, body: { handlerId: 'not-a-uuid' } });
      await complaintsController.assignHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonPayload).toHaveProperty('message', 'Validation error');
      expect(res.jsonPayload).toHaveProperty('errors');
      expect(Array.isArray(res.jsonPayload.errors)).toBe(true);
      expect(res.jsonPayload.errors.length).toBeGreaterThan(0);
      expect(complaintsService.assignHandler).not.toHaveBeenCalled();
    });
  });

  describe('addComment', () => {
    it('returns 400 Validation error with errors array when content is empty', async () => {
      const { req, res } = mockReqRes({ params: { id: 'c-1' } as any, body: { content: '' } });
      await complaintsController.addComment(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonPayload).toHaveProperty('message', 'Validation error');
      expect(res.jsonPayload).toHaveProperty('errors');
      expect(Array.isArray(res.jsonPayload.errors)).toBe(true);
      expect(res.jsonPayload.errors.length).toBeGreaterThan(0);
      expect(complaintsService.addComment).not.toHaveBeenCalled();
    });
  });
});
