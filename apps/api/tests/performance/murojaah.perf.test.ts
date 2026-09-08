import { describe, it, expect, vi, beforeEach } from 'vitest';
import { murojaahService } from '../../src/modules/murojaah/murojaah.service';
import { prisma } from '../../src/lib/prisma';

// Mock prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    murojaahRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    murojaahMistake: {
      groupBy: vi.fn(),
    },
  },
}));

describe('Murojaah Service Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures getStudentSummary performance with optimized queries', async () => {
    const studentId = 'student-123';
    const recordCount = 10000;

    // Mock student
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: studentId,
      nisn: '12345',
      user: { name: 'Test Student' },
    } as any);

    // Mock aggregate
    vi.mocked(prisma.murojaahRecord.aggregate).mockResolvedValue({
      _count: { _all: recordCount },
      _sum: {
        pagesReviewed: recordCount * 2,
        durationMinutes: recordCount * 30,
        mistakeCount: recordCount,
        qualityScore: recordCount * 80,
        fluencyLevel: recordCount * 4,
      },
    } as any);

    // Mock mistake groupBy
    vi.mocked(prisma.murojaahMistake.groupBy).mockResolvedValue([
      { mistakeType: 'TAJWID', _count: { _all: recordCount } },
    ] as any);

    // Mock findMany calls
    (vi.mocked(prisma.murojaahRecord.findMany) as any).mockImplementation(async (args: any) => {
      // Check for coverage query (only select juzStart, juzEnd)
      if (args?.select?.juzStart && !args?.take) {
        return Array.from({ length: recordCount }).map(() => ({ juzStart: 1, juzEnd: 1 })) as any;
      }
      // Check for recent records query (take: 10)
      if (args?.take === 10) {
        return Array.from({ length: 10 }).map((_, i) => ({
          id: `record-${i}`,
          murojaahDate: new Date(),
          murojaahType: 'YAUMIYAH',
          juzStart: 1,
          juzEnd: 1,
          pagesReviewed: 2,
          qualityScore: 80,
          mistakeCount: 1,
        })) as any;
      }

      console.error('Unexpected findMany call args:', JSON.stringify(args, null, 2));
      throw new Error('Unexpected findMany call - likely fetching too much data');
    });

    const start = performance.now();
    const summary = await murojaahService.getStudentSummary({ studentId });
    const end = performance.now();
    const duration = end - start;

    process.stdout.write(
      `\n[Optimized] getStudentSummary with ${recordCount} records (simulated) took ${duration.toFixed(2)}ms\n`
    );

    expect(summary.summary.totalSessions).toBe(recordCount);
    expect(prisma.murojaahRecord.aggregate).toHaveBeenCalled();
    expect(prisma.murojaahMistake.groupBy).toHaveBeenCalled();

    // Verify we didn't fetch everything with include
    expect(prisma.murojaahRecord.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        include: { mistakes: true },
      })
    );
  });
});
