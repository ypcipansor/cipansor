import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { getDashboardMetrics } from '@/modules/dashboard/dashboard.controller';
import { getCurrentDashboardMetrics } from '@/lib/dashboard-metrics';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      count: vi.fn(),
    },
    attendance: {
      count: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
    },
    murojaahRecord: {
      aggregate: vi.fn(),
    },
    dashboardHistory: {
      findMany: vi.fn(),
    },
    unit: {
      count: vi.fn(),
    },
    class: {
      count: vi.fn(),
    },
    teacher: {
      count: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/dashboard-metrics', () => ({
  getCurrentDashboardMetrics: vi.fn(),
}));

describe('Dashboard Controller - Metrics History', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock,
      json: jsonMock,
    };
    req = {
      query: {},
      user: { id: 'user-1', role: 'SUPER_ADMIN' },
    } as any;
    vi.clearAllMocks();
  });

  it('should return metrics history when available', async () => {
    // Mock current metrics
    const mockCurrent = {
      totalStudents: 100,
      activeStudents: 90,
      totalTeachers: 10,
      todayAttendance: 85,
      attendanceRate: 94,
    };
    (getCurrentDashboardMetrics as any).mockResolvedValue(mockCurrent);

    // Mock history data
    const mockHistory = [
      {
        metrics: { ...mockCurrent, attendanceRate: 90 },
        createdAt: new Date('2023-01-01T10:00:00Z'),
      },
      {
        metrics: { ...mockCurrent, attendanceRate: 92 },
        createdAt: new Date('2023-01-01T10:01:00Z'),
      },
    ];
    (prisma.dashboardHistory.findMany as any).mockResolvedValue(mockHistory);

    // Mock other Prisma calls for alerts
    (prisma.student.count as any).mockResolvedValue(100);
    (prisma.attendance.count as any).mockResolvedValue(90);
    (prisma.invoice.count as any).mockResolvedValue(0);
    (prisma.murojaahRecord.aggregate as any).mockResolvedValue({ _avg: { qualityScore: 80 } });
    (prisma.unit.count as any).mockResolvedValue(1);
    (prisma.class.count as any).mockResolvedValue(5);
    (prisma.teacher.count as any).mockResolvedValue(10);
    (prisma.academicYear.findFirst as any).mockResolvedValue({ id: 'ay-1', name: '2024/2025' });

    await getDashboardMetrics(req as Request, res as Response, (() => {}) as any);

    expect(statusMock).not.toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          current: mockCurrent,
          recent: expect.arrayContaining([
            expect.objectContaining({ attendanceRate: 92 }),
            expect.objectContaining({ attendanceRate: 90 }),
          ]),
        }),
      })
    );

    // Verify history query params
    expect(prisma.dashboardHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: null },
        orderBy: { createdAt: 'desc' },
        take: 12,
      })
    );
  });

  it('should fallback to current metrics if history is empty', async () => {
    const mockCurrent = {
      totalStudents: 100,
      activeStudents: 90,
      totalTeachers: 10,
      todayAttendance: 85,
      attendanceRate: 94,
    };
    (getCurrentDashboardMetrics as any).mockResolvedValue(mockCurrent);
    (prisma.dashboardHistory.findMany as any).mockResolvedValue([]);

    // Mock alert queries
    (prisma.student.count as any).mockResolvedValue(100);
    (prisma.attendance.count as any).mockResolvedValue(90);
    (prisma.invoice.count as any).mockResolvedValue(0);
    (prisma.murojaahRecord.aggregate as any).mockResolvedValue({ _avg: { qualityScore: 80 } });
    (prisma.unit.count as any).mockResolvedValue(1);
    (prisma.class.count as any).mockResolvedValue(5);
    (prisma.teacher.count as any).mockResolvedValue(10);
    (prisma.academicYear.findFirst as any).mockResolvedValue({ id: 'ay-1', name: '2024/2025' });

    await getDashboardMetrics(req as Request, res as Response, (() => {}) as any);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          current: mockCurrent,
          recent: [mockCurrent],
        }),
      })
    );
  });
});
