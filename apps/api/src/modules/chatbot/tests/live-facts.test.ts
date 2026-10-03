import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicIntakeDTO } from '@cipansor/shared';
import { collectLiveFacts } from '../live-facts';
import { findPublicIntakes } from '../../admissions/admissions.service';

vi.mock('../../admissions/admissions.service', () => ({
  findPublicIntakes: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockFind = vi.mocked(findPublicIntakes);
const NOW = new Date('2026-10-03T00:00:00.000Z');

/** SMP IT's 2027/2028 intake, as the brochure prints it. */
function intake(
  period: Partial<PublicIntakeDTO['period']> = {},
  rest: Partial<Omit<PublicIntakeDTO, 'period'>> = {}
): PublicIntakeDTO {
  return {
    unit: { id: 'u1', name: 'SMP IT', officialName: 'SMP IT Pesantren Cipansor', type: 'SMP_IT' },
    period: {
      id: 'p1',
      name: 'SPMB 2027/2028 SMP IT',
      academicYear: '2027/2028',
      startDate: '2026-09-30T17:00:00.000Z',
      endDate: '2027-07-10T16:59:59.999Z',
      window: 'open',
      opensAt: null,
      closesAt: '2026-12-20T16:59:59.999Z',
      registrationFee: '200000',
      requirements: ['Tes seleksi', 'NISN'],
      minAgeMonths: null,
      ageReferenceDate: null,
      contactName: 'Panitia SPMB SMP IT',
      contactPhone: '0812-0000-0000',
      ...period,
    },
    waves: [
      {
        waveNumber: 1,
        name: 'Gelombang 1',
        startDate: '2026-09-30T17:00:00.000Z',
        endDate: '2026-12-20T16:59:59.999Z',
        testStartDate: '2026-12-20T00:00:00.000Z',
        testEndDate: '2026-12-25T00:00:00.000Z',
        resultsStartDate: null,
        resultsEndDate: null,
        reRegistrationStartDate: '2026-12-28T00:00:00.000Z',
        reRegistrationEndDate: '2027-01-03T00:00:00.000Z',
        fullPaymentDiscount: '1000000.00',
        window: 'open',
      },
    ],
    fees: [
      {
        label: 'Infaq Bangunan',
        maleAmount: '3000000.00',
        femaleAmount: '3000000.00',
        residency: 'ALL',
        isMonthly: false,
      },
      {
        label: 'Seragam',
        maleAmount: '1250000.00',
        femaleAmount: '1500000.00',
        residency: 'ALL',
        isMonthly: false,
      },
      {
        label: 'SPP Bulanan',
        maleAmount: '950000.00',
        femaleAmount: '950000.00',
        residency: 'BOARDING',
        isMonthly: true,
      },
    ],
    ...rest,
  };
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
    mockFind.mockResolvedValue([intake()]);
    await collectLiveFacts('bagaimana pendaftaran santri baru', NOW);
    expect(mockFind).toHaveBeenCalled();
  });

  it('triggers on a MISSPELLED cost question', async () => {
    // "brp biyaya pndaftaran nya" used to retrieve the right page and answer
    // without the fee — the one number the visitor actually asked for.
    mockFind.mockResolvedValue([intake()]);
    await collectLiveFacts('brp biyaya pndaftaran nya', NOW);
    expect(mockFind).toHaveBeenCalled();
  });

  it('triggers on a question about cost', async () => {
    mockFind.mockResolvedValue([intake()]);
    await collectLiveFacts('berapa biaya masuk', NOW);
    expect(mockFind).toHaveBeenCalled();
  });
});

describe('collectLiveFacts rendering', () => {
  it("reports a unit's open intake: its close, its waves, its fees, its contact", async () => {
    mockFind.mockResolvedValue([intake()]);
    const [fact] = await collectLiveFacts('biaya pendaftaran', NOW);

    expect(fact.id).toBe('spmb-smp_it');
    expect(fact.text).toContain('SMP IT Pesantren Cipansor: SPMB tahun ajaran 2027/2028.');
    // Open until the running wave closes; the period runs on after it.
    expect(fact.text).toContain(
      'Pendaftaran DIBUKA sekarang; gelombang yang berjalan ditutup pada 20 Desember 2026 (sekitar 79 hari lagi), dan periode pendaftaran berakhir 10 Juli 2027.'
    );
    // The wave's sessions, on the WIB calendar, and its discount.
    expect(fact.text).toContain('pendaftaran 1 Oktober 2026 – 20 Desember 2026 (SEDANG DIBUKA)');
    expect(fact.text).toContain('tes 20 Desember 2026 – 25 Desember 2026');
    expect(fact.text).toMatch(/potongan Rp\s?1\.000\.000 bila dibayar lunas/);
    // Totals the way the page computes them; the model never adds money up.
    expect(fact.text).toMatch(
      /Jumlah biaya masuk mukim: ikhwan Rp\s?5\.200\.000, akhwat Rp\s?5\.450\.000/
    );
    expect(fact.text).toMatch(/Seragam ikhwan Rp\s?1\.250\.000, akhwat Rp\s?1\.500\.000/);
    expect(fact.text).toContain('Persyaratan: Tes seleksi; NISN.');
    expect(fact.text).toContain('Narahubung: Panitia SPMB SMP IT, 0812-0000-0000.');
  });

  it('says a future intake is not open yet, and a past one has closed', async () => {
    const SD = { id: 'u2', name: 'SD IT', officialName: null, type: 'SD_IT' };
    mockFind.mockResolvedValue([
      intake({
        window: 'upcoming',
        startDate: '2026-10-31T17:00:00.000Z',
        opensAt: '2026-10-31T17:00:00.000Z',
        closesAt: null,
      }),
      intake(
        { window: 'closed', endDate: '2026-06-30T16:59:59.999Z', opensAt: null, closesAt: null },
        { unit: SD }
      ),
    ]);
    const [upcoming, closed] = await collectLiveFacts('kapan pendaftaran dibuka', NOW);
    expect(upcoming.text).toContain('Pendaftaran BELUM dibuka; dibuka pada 1 November 2026');
    expect(closed.text).toContain('SD IT: SPMB');
    expect(closed.text).toContain('Pendaftaran SUDAH DITUTUP pada 30 Juni 2026.');
  });

  it('says registration is shut between two waves, and when it opens again', async () => {
    // 25 December: wave 1 closed on the 20th, wave 2 opens on 1 January.
    mockFind.mockResolvedValue([
      intake({ window: 'upcoming', opensAt: '2026-12-31T17:00:00.000Z', closesAt: null }),
    ]);
    const [fact] = await collectLiveFacts('kapan dibuka', new Date('2026-12-25T05:00:00Z'));
    expect(fact.text).toContain(
      'Pendaftaran sedang DITUTUP di antara dua gelombang; dibuka lagi pada 1 Januari 2027.'
    );
  });

  it('says registration is shut when every wave is full, though the period runs on', async () => {
    mockFind.mockResolvedValue([intake({ window: 'closed', opensAt: null, closesAt: null })]);
    const [fact] = await collectLiveFacts('masih bisa daftar', NOW);
    expect(fact.text).toContain('semua gelombang sudah penuh atau ditutup');
    expect(fact.text).not.toContain('SUDAH DITUTUP pada');
  });

  it('gives the registration fee when the unit has no fee table yet', async () => {
    mockFind.mockResolvedValue([intake({}, { fees: [] })]);
    const [fact] = await collectLiveFacts('biaya', NOW);
    expect(fact.text).toMatch(/Biaya pendaftaran: Rp\s?200\.000/);
    expect(fact.text).not.toContain('Jumlah biaya masuk');
  });

  it('states the minimum age', async () => {
    mockFind.mockResolvedValue([
      intake({ minAgeMonths: 66, ageReferenceDate: '2027-07-01T00:00:00.000Z' }),
    ]);
    const [fact] = await collectLiveFacts('syarat masuk', NOW);
    expect(fact.text).toContain('Usia minimal 5 tahun 6 bulan pada 1 Juli 2027.');
  });

  it('reports honestly when no unit has an intake at all', async () => {
    mockFind.mockResolvedValue([]);
    const [fact] = await collectLiveFacts('pendaftaran', NOW);
    expect(fact.text).toContain('tidak ada gelombang pendaftaran');
  });

  it('says nothing about requirements when the unit has listed none', async () => {
    mockFind.mockResolvedValue([intake({ requirements: [] })]);
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
