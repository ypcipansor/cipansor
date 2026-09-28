import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aggregateDashboardMetrics } from '../../src/jobs/dashboard-metrics.job';
import { prisma } from '../../src/lib/prisma';
import * as dashboardMetrics from '../../src/lib/dashboard-metrics';

// Mock logger to keep output clean
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    unit: {
      findMany: vi.fn(),
    },
    dashboardHistory: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/dashboard-metrics', () => ({
  getCurrentDashboardMetrics: vi.fn(),
}));

describe('Dashboard Metrics Job Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures aggregateDashboardMetrics performance', async () => {
    const unitCount = 50;
    const units = Array.from({ length: unitCount }).map((_, i) => ({
      id: `unit-${i}`,
      name: `Unit ${i}`,
    }));

    // Mock units
    vi.mocked(prisma.unit.findMany).mockResolvedValue(units as any);

    // Mock getCurrentDashboardMetrics with delay
    vi.mocked(dashboardMetrics.getCurrentDashboardMetrics).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms delay
      return {} as any;
    });

    // Mock history create with delay
    (vi.mocked(prisma.dashboardHistory.create) as any).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms delay
      return {} as any;
    });

    console.log(`Starting benchmark with ${unitCount} units...`);
    const start = performance.now();
    await aggregateDashboardMetrics();
    const end = performance.now();
    const duration = end - start;

    console.log(`\n[Benchmark] aggregateDashboardMetrics took ${duration.toFixed(2)}ms`);

    // Verify calls
    expect(prisma.unit.findMany).toHaveBeenCalled();
    // getCurrentDashboardMetrics is called once globally + once per unit = 51 times
    expect(dashboardMetrics.getCurrentDashboardMetrics).toHaveBeenCalledTimes(unitCount + 1);
  }, 30000); // Increase timeout for the slow sequential version
});
