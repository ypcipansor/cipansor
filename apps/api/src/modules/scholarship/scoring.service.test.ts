import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scholarshipRecipient: { findUnique: vi.fn(), update: vi.fn() },
    scholarshipAssessment: { upsert: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

import { prisma } from '@/lib/prisma';
import { scholarshipScoringService } from './scoring.service';

const mocked = prisma as unknown as {
  scholarshipRecipient: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  scholarshipAssessment: { upsert: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function recipientFixture(overrides: {
  criteria: Array<{
    id: string;
    name: string;
    weight: number;
    targetValue?: string | null;
  }>;
  student?: Partial<{
    tahfidzRecords: Array<{ juz: number }>;
    grades: Array<{ score: number }>;
    fatherIncome: string | null;
  }>;
}) {
  return {
    id: 'rec-1',
    scholarship: { criteria: overrides.criteria },
    student: {
      user: { id: 'u1' },
      tahfidzRecords: overrides.student?.tahfidzRecords ?? [],
      grades: overrides.student?.grades ?? [],
      fatherIncome: overrides.student?.fatherIncome ?? null,
    },
  };
}

describe('scholarshipScoringService.assessRecipient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when the recipient does not exist', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(null);
    await expect(scholarshipScoringService.assessRecipient('missing')).rejects.toThrow(
      'Recipient not found'
    );
  });

  it('scores tahfidz criteria from the latest record against targetValue', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Hafalan Al-Quran', weight: 1, targetValue: '10' }],
        student: { tahfidzRecords: [{ juz: 5 }] },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');

    // 5 juz of a 10-juz target = 50
    expect(result.totalScore).toBe(50);
    expect(result.assessments[0]).toMatchObject({
      criterionId: 'c1',
      value: '5',
      score: 50,
    });
  });

  it('caps criterion scores at 100', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Tahfidz', weight: 1, targetValue: '5' }],
        student: { tahfidzRecords: [{ juz: 30 }] },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');
    expect(result.totalScore).toBe(100);
  });

  it('averages recent grades for academic criteria', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Nilai Akademik', weight: 1, targetValue: '100' }],
        student: { grades: [{ score: 80 }, { score: 90 }] },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');
    expect(result.totalScore).toBe(85);
  });

  it('maps real IncomeRange enum values for need-based criteria', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Penghasilan Orang Tua', weight: 1 }],
        student: { fatherIncome: 'KURANG_500K' },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');
    expect(result.totalScore).toBe(100);
  });

  it('scores unknown income values as 0 rather than inventing data', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Penghasilan', weight: 1 }],
        student: { fatherIncome: null },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');
    expect(result.totalScore).toBe(0);
    expect(result.assessments[0].value).toBe('UNKNOWN');
  });

  it('marks unrecognized criteria as MANUAL_REQUIRED with score 0', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [{ id: 'c1', name: 'Wawancara', weight: 1 }],
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');
    expect(result.assessments[0].value).toBe('MANUAL_REQUIRED');
    expect(result.totalScore).toBe(0);
  });

  it('weights criteria and persists the normalized total in a transaction', async () => {
    mocked.scholarshipRecipient.findUnique.mockResolvedValue(
      recipientFixture({
        criteria: [
          { id: 'c1', name: 'Tahfidz', weight: 3, targetValue: '10' },
          { id: 'c2', name: 'Penghasilan', weight: 1 },
        ],
        student: {
          tahfidzRecords: [{ juz: 10 }],
          fatherIncome: 'RANGE_1JT_2JT',
        },
      })
    );

    const result = await scholarshipScoringService.assessRecipient('rec-1');

    // (100 * 3 + 80 * 1) / 4 = 95
    expect(result.totalScore).toBe(95);
    expect(mocked.$transaction).toHaveBeenCalledTimes(1);
    expect(mocked.scholarshipRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { totalScore: 95 },
    });
  });
});
