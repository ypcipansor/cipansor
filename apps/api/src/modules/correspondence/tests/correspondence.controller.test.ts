import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../correspondence.service', () => ({
  CorrespondenceService: {
    updateLetter: vi.fn(),
  },
}));

import { CorrespondenceController } from '../correspondence.controller';
import { CorrespondenceService } from '../correspondence.service';
import { ApiResponse } from '@/utils/response';

const mockResponse = () => {
  const res: any = {};
  res.json = vi.fn((body) => res);
  res.status = vi.fn(() => res);
  return res as Response;
};

const mockRequest = (overrides: Partial<Request> = {}) =>
  ({
    params: { id: 'letter-1' },
    body: { subject: 'Naskah diperbarui', urgency: 'URGENT' },
    user: {
      id: 'user-1',
      role: 'UNIT_ADMIN',
      roleCode: 'UNIT_ADMIN',
      unitId: 'unit-smp-1',
    },
    ...overrides,
  }) as unknown as Request;

describe('CorrespondenceController.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates to CorrespondenceService.updateLetter and responds with the letter', async () => {
    const serviceResult = { id: 'letter-1', subject: 'Naskah diperbarui' };
    (CorrespondenceService.updateLetter as any).mockResolvedValue(serviceResult);
    const apiSpy = vi.spyOn(ApiResponse, 'success').mockImplementation((data, message) => ({
      success: true,
      message: message ?? 'OK',
      data,
    }));

    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    // asyncHandler fire-and-forgets the wrapped promise, so await the async
    // effect via waitFor rather than trusting the wrapper's return value.
    CorrespondenceController.update(req, res, next);
    await vi.waitFor(() => {
      expect(res.json).toHaveBeenCalled();
    });

    expect(CorrespondenceService.updateLetter).toHaveBeenCalledWith(
      'letter-1',
      { subject: 'Naskah diperbarui', urgency: 'URGENT' },
      'user-1',
      { id: 'user-1', role: 'UNIT_ADMIN', roleCode: 'UNIT_ADMIN', unitId: 'unit-smp-1' }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: serviceResult })
    );
    apiSpy.mockRestore();
  });

  it('propagates a service error through the asyncHandler', async () => {
    const serviceError = new Error('Semester harus bernilai 1 (Ganjil) atau 2 (Genap)');
    (CorrespondenceService.updateLetter as any).mockRejectedValue(serviceError);

    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    CorrespondenceController.update(req, res, next as unknown as NextFunction);

    // The wrapper forwards to the error middleware rather than re-throwing.
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });
});
