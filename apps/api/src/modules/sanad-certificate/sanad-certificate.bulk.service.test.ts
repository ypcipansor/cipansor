import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sanadRecord: { findUnique: vi.fn(), create: vi.fn() },
    takhosusEnrollment: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/middleware/error';
import { MAX_BULK_CREATE_RECORDS } from './sanad-certificate.schema';
import { bulkCreateSanadRecords, createSanadRecord } from './sanad-certificate.service';

const db = prisma as unknown as {
  sanadRecord: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  takhosusEnrollment: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const context = { userId: 'u-admin' };

function input(n: number) {
  return {
    records: Array.from({ length: n }, (_v, i) => ({
      enrollmentId: `enroll-${i}`,
      teacherId: `teacher-${i}`,
      juz: (i % 30) + 1,
      grade: 'JAYYID' as const,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // A valid enrollment/teacher and no duplicate, so createSanadRecord reaches
  // prisma.sanadRecord.create.
  db.takhosusEnrollment.findUnique.mockResolvedValue({ id: 'enroll-0', studentId: 's-1' });
  db.user.findUnique.mockResolvedValue({ id: 'teacher-0', role: 'TEACHER' });
  db.sanadRecord.findUnique.mockResolvedValue(null);
  db.sanadRecord.create.mockResolvedValue({ id: 'rec-1' });
});

describe('bulkCreateSanadRecords', () => {
  it('accepts exactly the maximum number of records', async () => {
    const result = await bulkCreateSanadRecords(input(MAX_BULK_CREATE_RECORDS), context);

    expect(result.success).toBe(MAX_BULK_CREATE_RECORDS);
    expect(result.failed).toBe(0);
  });

  it('rejects one record over the maximum with a 400, not a generic error', async () => {
    const promise = bulkCreateSanadRecords(input(MAX_BULK_CREATE_RECORDS + 1), context);

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a non-array payload', async () => {
    // Only reachable by bypassing Zod (internal callers), which is exactly why
    // the service re-checks.
    const bad = { records: 'not-an-array' } as unknown as Parameters<
      typeof bulkCreateSanadRecords
    >[0];

    await expect(bulkCreateSanadRecords(bad, context)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('processes valid input', async () => {
    const result = await bulkCreateSanadRecords(input(2), context);

    expect(result.success).toBe(2);
    expect(db.sanadRecord.create).toHaveBeenCalledTimes(2);
  });

  it('reports per-record failures without aborting the batch', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: 'teacher-0', role: 'TEACHER' })
      .mockResolvedValueOnce(null); // second record's teacher is missing

    const result = await bulkCreateSanadRecords(input(2), context);

    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ index: 1, error: 'Teacher not found' }]);
  });
});

describe('schema/service limit alignment', () => {
  it('is the same constant on both sides', async () => {
    // Guards the drift that made the service cap (1000) unreachable behind the
    // endpoint cap (50): the service must reject at the schema's cap.
    const promise = bulkCreateSanadRecords(input(MAX_BULK_CREATE_RECORDS + 1), context);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining(String(MAX_BULK_CREATE_RECORDS)),
    });
  });

  it('createSanadRecord still enforces its own domain errors', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(createSanadRecord(input(1).records[0], context)).rejects.toThrow(
      'Teacher not found'
    );
  });
});
