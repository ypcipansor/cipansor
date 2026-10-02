import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectLiveFacts } from '../live-facts';
import { findPublicActivePeriod } from '../../admissions/admissions.service';

vi.mock('../../admissions/admissions.service', () => ({
  findPublicActivePeriod: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockFind = vi.mocked(findPublicActivePeriod);
const NOW = new Date('2026-07-24T00:00:00.000Z');

function period(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'SPMB 2027/2028 Gelombang 1',
    startDate: new Date('2026-06-09T00:00:00.000Z'),
    endDate: new Date('2026-09-07T00:00:00.000Z'),
    registrationFee: '350000',
    requirements: ['Fotokopi Akta Kelahiran', 'Pas Foto 3x4'],
    unit: { id: 'u1', name: 'SMP IT Cipansor', type: 'SMP_IT' },
    academicYear: { id: 'a1', name: '2027/2028' },
    ...overrides,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('collectLiveFacts gating', () => {
  it('does not touch the database for an unrelated question', async () => {
    // Most questions are about programmes or location; there is no reason to
    // put a query on that path.
    await expect(collectLiveFacts('di mana alamat pesantren', NOW)).resolves.toEqual([]);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('triggers on affixed admission vocabulary', async () => {
    mockFind.mockResolvedValue(period());
    await collectLiveFacts('bagaimana pendaftaran santri baru', NOW);
    expect(mockFind).toHaveBeenCalled();
  });

  it('triggers on a MISSPELLED cost question', async () => {
    // "brp biyaya pndaftaran nya" used to retrieve the right page and answer
    // without the fee — the one number the visitor actually asked for.
    mockFind.mockResolvedValue(period());
    await collectLiveFacts('brp biyaya pndaftaran nya', NOW);
    expect(mockFind).toHaveBeenCalled();
  });

  it('triggers on a question about cost', async () => {
    mockFind.mockResolvedValue(period());
    await collectLiveFacts('berapa biaya masuk', NOW);
    expect(mockFind).toHaveBeenCalled();
  });
});

describe('collectLiveFacts rendering', () => {
  it('reports an open period with the closing date and formatted fee', async () => {
    mockFind.mockResolvedValue(period());
    const [fact] = await collectLiveFacts('biaya pendaftaran', NOW);

    expect(fact.text).toContain('DIBUKA');
    expect(fact.text).toContain('7 September 2026');
    // The model must never be handed a raw Decimal and asked to render money.
    expect(fact.text).toMatch(/Rp\s?350\.000/);
    expect(fact.text).toContain('SMP IT Cipansor');
    expect(fact.text).toContain('Fotokopi Akta Kelahiran');
  });

  it('says a future period is not open yet', async () => {
    mockFind.mockResolvedValue(
      period({
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-09-07T00:00:00.000Z'),
      })
    );
    const [fact] = await collectLiveFacts('kapan pendaftaran dibuka', NOW);
    expect(fact.text).toContain('BELUM dibuka');
  });

  it('says a past period has closed', async () => {
    mockFind.mockResolvedValue(
      period({
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-03-01T00:00:00.000Z'),
      })
    );
    const [fact] = await collectLiveFacts('kapan pendaftaran ditutup', NOW);
    expect(fact.text).toContain('SUDAH DITUTUP');
  });

  it('reports honestly when no period exists at all', async () => {
    mockFind.mockResolvedValue(null);
    const [fact] = await collectLiveFacts('pendaftaran', NOW);
    expect(fact.text).toContain('tidak ada gelombang pendaftaran');
  });

  it('says nothing about requirements when the unit has listed none', async () => {
    mockFind.mockResolvedValue(period({ requirements: [] }));
    const [fact] = await collectLiveFacts('syarat pendaftaran', NOW);
    expect(fact.text).toContain('DIBUKA');
    expect(fact.text).not.toContain('Persyaratan:');
  });

  it('returns no fact when the database call fails, rather than guessing', async () => {
    // The scaffold's "answer only from context" rule then forces a refusal.
    // Silence is the correct failure mode; an invented fee is not.
    mockFind.mockRejectedValue(new Error('db down'));
    expect(await collectLiveFacts('biaya pendaftaran', NOW)).toEqual([]);
  });
});
