import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { aggregateDashboardMetrics } from '../../src/jobs/dashboard-metrics.job';
import { getDashboardMetrics } from '../../src/modules/dashboard/dashboard.controller';
import { getCurrentDashboardMetrics } from '../../src/lib/dashboard-metrics';
import { Request, Response } from 'express';

// Mock dependencies
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    dashboardHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    student: {
      count: vi.fn(),
    },
    teacher: {
      count: vi.fn(),
    },
    attendance: {
      count: vi.fn(),
    },
    tahfidzRecord: {
      count: vi.fn(),
    },
    murojaahRecord: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    unit: {
      findMany: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/dashboard-metrics', () => ({
  getCurrentDashboardMetrics: vi.fn().mockResolvedValue({
    students: { total: 100, active: 90, change: 0 },
    teachers: { total: 10 },
    attendance: { rate: 95, present: 85, total: 90 },
    tahfidz: { totalHafidz: 5, avgQuality: 80 },
    timestamp: new Date().toISOString(),
  }),
}));

vi.mock('../../src/lib/logger');

describe('Dashboard Metrics History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scheduled Job: aggregateDashboardMetrics', () => {
    it('should create dashboard history records for global and units', async () => {
      // Mock data
      (prisma.unit.findMany as any).mockResolvedValue([
        { id: 'unit-1', name: 'Unit 1' },
        { id: 'unit-2', name: 'Unit 2' },
      ]);
      (prisma.student.count as any).mockResolvedValue(100);
      (prisma.teacher.count as any).mockResolvedValue(10);
      (prisma.attendance.count as any).mockResolvedValue(90);
      (prisma.tahfidzRecord.count as any).mockResolvedValue(5);
      (prisma.murojaahRecord.aggregate as any).mockResolvedValue({ _avg: { qualityScore: 80 } });
      (prisma.murojaahRecord.count as any).mockResolvedValue(0);
      (prisma.invoice.count as any).mockResolvedValue(0);

      // Run job
      await aggregateDashboardMetrics();

      // Expect global history creation
      expect(prisma.dashboardHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: null,
            metrics: expect.anything(),
          }),
        })
      );

      // Expect unit history creation
      expect(prisma.dashboardHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'unit-1',
            metrics: expect.anything(),
          }),
        })
      );
      expect(prisma.dashboardHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'unit-2',
            metrics: expect.anything(),
          }),
        })
      );

      // Total calls: 1 global + 2 units = 3
      expect(prisma.dashboardHistory.create).toHaveBeenCalledTimes(3);
    });

    it('records fresh figures, never the cached copy of the previous minute', async () => {
      (prisma.unit.findMany as any).mockResolvedValue([{ id: 'unit-1', name: 'Unit 1' }]);

      await aggregateDashboardMetrics();

      // The job runs every minute against a 60-second cache: reading the cache
      // would record the previous point again.
      expect(getCurrentDashboardMetrics).toHaveBeenCalledWith(undefined, { fresh: true });
      expect(getCurrentDashboardMetrics).toHaveBeenCalledWith('unit-1', { fresh: true });
      expect(getCurrentDashboardMetrics).toHaveBeenCalledTimes(2);
    });
  });

  describe('Controller: getDashboardMetrics', () => {
    it('should return recent history from database', async () => {
      // Mock history data
      const mockHistory = Array(12)
        .fill(null)
        .map((_, i) => ({
          metrics: {
            students: { total: 100 + i },
            teachers: { total: 10 },
            attendance: { rate: 90 + i },
            tahfidz: { totalHafidz: 5, avgQuality: 80 },
            timestamp: new Date().toISOString(),
          },
          createdAt: new Date(),
          unitId: null,
        }));

      (prisma.dashboardHistory.findMany as any).mockResolvedValue(mockHistory);

      const req = {
        query: {},
        user: { id: 'user-1', role: 'SUPER_ADMIN' },
      } as unknown as Request;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      await getDashboardMetrics(req, res, (() => {}) as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            recent: expect.arrayContaining([
              expect.objectContaining({
                students: expect.anything(),
              }),
            ]),
          }),
        })
      );

      // Verify prisma call
      expect(prisma.dashboardHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unitId: null },
          take: 12,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should fallback to current metrics if history is empty', async () => {
      (prisma.dashboardHistory.findMany as any).mockResolvedValue([]);

      const req = {
        query: {},
        user: { id: 'user-1', role: 'SUPER_ADMIN' },
      } as unknown as Request;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      await getDashboardMetrics(req, res, (() => {}) as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            recent: expect.arrayContaining([expect.anything()]), // Should contain 1 item
          }),
        })
      );
    });
  });
});
