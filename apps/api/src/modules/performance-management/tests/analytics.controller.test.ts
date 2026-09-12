import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../analytics.service', () => ({
  pkAnalyticsService: {
    getUnitPerformanceDashboard: vi.fn(),
    getUnitDrilldown: vi.fn(),
    getConsolidatedReport: vi.fn(),
  },
}));

import * as analyticsController from '../analytics.controller';
import { pkAnalyticsService } from '../analytics.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) { (this as any).statusCode = code; return this; },
    json(payload: unknown) { (this as any).jsonPayload = payload; return this; },
  } as unknown as Response & { statusCode: number; jsonPayload: any };

  return { req, res };
}

async function run(handler: any, req: Request, res: Response) {
  let nextCalled = false;
  let nextError: any = null;
  await handler(req, res, (err?: any) => {
    nextCalled = true;
    nextError = err;
  });
  if (nextError) throw nextError;
}

describe('analytics controller unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should reject non-leadership roles with 403', async () => {
      const { req, res } = mockReqRes({ user: { sub: 'u1', roleCode: 'SDIT_GURU' } as any });
      await expect(run(analyticsController.getDashboard, req, res)).rejects.toThrow(
        'Only leadership roles may access analytics'
      );
    });

    it('should scope unit-level leadership to req.user.unitId', async () => {
      vi.mocked(pkAnalyticsService.getUnitPerformanceDashboard).mockResolvedValue({ totalAgreements: 5 } as any);
      const { req, res } = mockReqRes({ user: { sub: 'u1', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' } as any });
      await run(analyticsController.getDashboard, req, res);
      expect(pkAnalyticsService.getUnitPerformanceDashboard).toHaveBeenCalledWith('unit-sd');
    });

    it('should allow foundation global leadership to query any or all units', async () => {
      vi.mocked(pkAnalyticsService.getUnitPerformanceDashboard).mockResolvedValue({ totalAgreements: 20 } as any);
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        query: { unitId: 'unit-smp' } as any,
      });
      await run(analyticsController.getDashboard, req, res);
      expect(pkAnalyticsService.getUnitPerformanceDashboard).toHaveBeenCalledWith('unit-smp');
    });

    it('should reject unit-level leadership without unitId', async () => {
      const { req, res } = mockReqRes({ user: { sub: 'u1', roleCode: 'SDIT_KEPALA_SEKOLAH' } as any });
      await expect(run(analyticsController.getDashboard, req, res)).rejects.toThrow(
        'User does not belong to a specific unit and lacks global analytics access'
      );
    });
  });

  describe('getDrilldown', () => {
    it('should forbid unit-level leadership from viewing drilldown of another unit', async () => {
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' } as any,
        params: { unitId: 'unit-smp' } as any,
      });
      await expect(run(analyticsController.getDrilldown, req, res)).rejects.toThrow(
        'Cannot view drilldown scores of another unit'
      );
    });

    it('should allow foundation global leadership to view drilldown of any unit', async () => {
      vi.mocked(pkAnalyticsService.getUnitDrilldown).mockResolvedValue({ unit: { id: 'unit-smp', name: 'SMP IT' } } as any);
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        params: { unitId: 'unit-smp' } as any,
      });
      await run(analyticsController.getDrilldown, req, res);
      expect(pkAnalyticsService.getUnitDrilldown).toHaveBeenCalledWith('unit-smp');
    });
  });

  describe('getConsolidatedReport', () => {
    it('should validate and reject non-digit month parameter', async () => {
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        query: { month: '1junk' } as any,
      });
      await expect(run(analyticsController.getConsolidatedReport, req, res)).rejects.toThrow(
        'Invalid month parameter. Must be an integer between 1 and 12'
      );
    });

    it('should validate and reject out-of-range month parameter', async () => {
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        query: { month: '15' } as any,
      });
      await expect(run(analyticsController.getConsolidatedReport, req, res)).rejects.toThrow(
        'Invalid month parameter. Must be between 1 and 12'
      );
    });

    it('should validate and reject invalid year parameter', async () => {
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        query: { year: '1999' } as any,
      });
      await expect(run(analyticsController.getConsolidatedReport, req, res)).rejects.toThrow(
        'Invalid year parameter'
      );
    });

    it('should accept valid month and year parameters and return report', async () => {
      vi.mocked(pkAnalyticsService.getConsolidatedReport).mockResolvedValue({ units: [] } as any);
      const { req, res } = mockReqRes({
        user: { sub: 'u1', roleCode: 'YAYASAN_KETUA' } as any,
        query: { month: '8', year: '2026' } as any,
      });
      await run(analyticsController.getConsolidatedReport, req, res);
      expect(pkAnalyticsService.getConsolidatedReport).toHaveBeenCalledWith({
        month: 8,
        year: 2026,
        unitId: undefined,
      });
    });
  });
});
