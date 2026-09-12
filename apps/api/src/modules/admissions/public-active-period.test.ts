import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    admissionPeriod: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { getPublicActiveAdmissionPeriod } from './admissions.controller';

const mocked = prisma as unknown as {
  admissionPeriod: { findFirst: ReturnType<typeof vi.fn> };
};

function invoke() {
  const res = { json: vi.fn() } as unknown as Parameters<
    typeof getPublicActiveAdmissionPeriod
  >[1];
  const next = vi.fn();
  return {
    res,
    next,
    run: async () => {
      getPublicActiveAdmissionPeriod({} as never, res, next);
      await new Promise((r) => setTimeout(r, 0));
    },
    payload: () => (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
  };
}

/** The shape of the `findFirst` argument this controller builds. */
interface PeriodQuery {
  where: {
    isActive?: boolean;
    startDate?: { lte?: Date; gt?: Date };
    endDate?: { gte?: Date; lt?: Date };
  };
  orderBy?: Record<string, string>;
  select: Record<string, unknown>;
}

const queryOf = (call: unknown[]): PeriodQuery => call[0] as PeriodQuery;

/** Which of the three fallbacks a given call is, judged by its `where`. */
function windowOf(where: PeriodQuery['where']): 'open' | 'upcoming' | 'closed' {
  if (where.startDate?.lte && where.endDate?.gte) return 'open';
  if (where.startDate?.gt) return 'upcoming';
  return 'closed';
}

describe('getPublicActiveAdmissionPeriod', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for a currently-open period before anything else', async () => {
    mocked.admissionPeriod.findFirst.mockResolvedValue({ id: 'open-wave' });

    const call = invoke();
    await call.run();

    expect(mocked.admissionPeriod.findFirst).toHaveBeenCalledTimes(1);
    const args = queryOf(mocked.admissionPeriod.findFirst.mock.calls[0]);
    expect(windowOf(args.where)).toBe('open');
    expect(args.where.isActive).toBe(true);
    expect(call.payload()).toEqual({ success: true, data: { id: 'open-wave' } });
  });

  // The regression that made this ordering necessary: with wave 1 open and
  // wave 2 scheduled after it, the previous `orderBy: { startDate: 'desc' }`
  // returned wave 2 — so the site announced a future opening and withheld the
  // form while registration was actually open.
  it('does not let a later-starting future wave hide the open one', async () => {
    mocked.admissionPeriod.findFirst.mockImplementation(async (args: PeriodQuery) =>
      windowOf(args.where) === 'open' ? { id: 'wave-1-open' } : { id: 'wave-2-future' },
    );

    const call = invoke();
    await call.run();

    expect(call.payload().data).toEqual({ id: 'wave-1-open' });
  });

  it('falls back to the next upcoming period when none is open', async () => {
    mocked.admissionPeriod.findFirst.mockImplementation(async (args: PeriodQuery) =>
      windowOf(args.where) === 'upcoming' ? { id: 'next-wave' } : null,
    );

    const call = invoke();
    await call.run();

    const asked = mocked.admissionPeriod.findFirst.mock.calls.map((c: unknown[]) =>
      windowOf(queryOf(c).where),
    );
    expect(asked).toEqual(['open', 'upcoming']);
    expect(call.payload().data).toEqual({ id: 'next-wave' });
    // Ascending, so it is the *next* one to open rather than the furthest away.
    expect(queryOf(mocked.admissionPeriod.findFirst.mock.calls[1]).orderBy).toEqual({
      startDate: 'asc',
    });
  });

  it('falls back to the most recently closed period so the page can say when it ended', async () => {
    mocked.admissionPeriod.findFirst.mockImplementation(async (args: PeriodQuery) =>
      windowOf(args.where) === 'closed' ? { id: 'last-closed' } : null,
    );

    const call = invoke();
    await call.run();

    const asked = mocked.admissionPeriod.findFirst.mock.calls.map((c: unknown[]) =>
      windowOf(queryOf(c).where),
    );
    expect(asked).toEqual(['open', 'upcoming', 'closed']);
    expect(queryOf(mocked.admissionPeriod.findFirst.mock.calls[2]).orderBy).toEqual({
      endDate: 'desc',
    });
    expect(call.payload().data).toEqual({ id: 'last-closed' });
  });

  it('returns null rather than throwing when there is no period at all', async () => {
    mocked.admissionPeriod.findFirst.mockResolvedValue(null);

    const call = invoke();
    await call.run();

    expect(call.next).not.toHaveBeenCalled();
    expect(call.payload()).toEqual({ success: true, data: null });
  });

  it('never widens the public projection beyond the documented whitelist', async () => {
    mocked.admissionPeriod.findFirst.mockResolvedValue(null);

    await invoke().run();

    // Anything added here is exposed to anonymous callers — no quota, no
    // registrant counts, no PII.
    for (const call of mocked.admissionPeriod.findFirst.mock.calls) {
      expect(Object.keys(queryOf(call).select).sort()).toEqual([
        'academicYear',
        'endDate',
        'id',
        'name',
        'registrationFee',
        'requirements',
        'startDate',
        'unit',
      ]);
    }
  });
});
