/**
 * SPMB 2027/2028 as the yayasan's brochure prints it
 * (*BROSUR CIPANSOR 2027-2028 (REVISI)*; decisions/spmb-2027-2028.md).
 *
 * Data only, so the loader (`spmb-2027-2028.ts`) and the test that checks the
 * fee totals against the brochure's own "Jumlah" rows read the same figures.
 *
 * Copied from the brochure, with three changes stated here:
 * - the registration steps ("mengisi formulir", "membayar biaya administrasi")
 *   are not requirements, and the minimum age is `minAgeMonths`;
 * - "Mengikuti tes seleksi PPDB" reads "Mengikuti tes seleksi" — PPDB is the
 *   old name, one of the brochure's misprints;
 * - spellings follow KBBI ("fotokopi", "pas foto").
 *
 * Not here, on purpose: each unit's contact person and number (entered by the
 * unit's admin, never kept in the repository) and wave quotas (the brochure
 * says only "kuota terbatas").
 */
import type { AdmissionFeeItemInput } from '@cipansor/shared';

export type BrochureUnit = 'TK_QURAN' | 'SD_IT' | 'SMP_IT' | 'SMA_QURAN';

/** The academic year the brochure recruits for: 2027/2028. */
export const BROCHURE_START_YEAR = 2027;

/** Registration runs from wave 1's first day to wave 4's last. */
export const BROCHURE_REGISTRATION = { startDate: '2026-10-01', endDate: '2027-07-10' };

/** What is billed on registering — the "Pendaftaran" line of every fee table. */
export const BROCHURE_REGISTRATION_FEE = 200_000;

export interface BrochureWave {
  waveNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  testStartDate: string | null;
  testEndDate: string | null;
  resultsStartDate: string | null;
  resultsEndDate: string | null;
  reRegistrationStartDate: string | null;
  reRegistrationEndDate: string | null;
  /** For paying the entry fees in full during the wave; never for TK Qur'an. */
  fullPaymentDiscount: number | null;
}

const wave = (
  waveNumber: number,
  [startDate, endDate]: [string, string],
  test: [string, string | null] | null,
  results: [string, string | null] | null,
  reRegistration: [string, string | null] | null,
  fullPaymentDiscount: number | null
): BrochureWave => ({
  waveNumber,
  name: `Gelombang ${waveNumber}`,
  startDate,
  endDate,
  testStartDate: test?.[0] ?? null,
  testEndDate: test?.[1] ?? null,
  resultsStartDate: results?.[0] ?? null,
  resultsEndDate: results?.[1] ?? null,
  reRegistrationStartDate: reRegistration?.[0] ?? null,
  reRegistrationEndDate: reRegistration?.[1] ?? null,
  fullPaymentDiscount,
});

/**
 * The four waves. Wave 3's test and results fall before its registration
 * closes, and wave 4 has no sessions at all — both as printed (misprints to
 * pass back to the yayasan, not to correct here).
 */
export const BROCHURE_WAVES: BrochureWave[] = [
  wave(
    1,
    ['2026-10-01', '2026-12-20'],
    ['2026-12-20', '2026-12-25'],
    ['2026-12-26', '2026-12-27'],
    ['2026-12-28', '2027-01-03'],
    1_000_000
  ),
  wave(
    2,
    ['2027-01-01', '2027-02-28'],
    ['2027-02-28', null],
    ['2027-03-01', null],
    ['2027-03-02', '2027-03-07'],
    750_000
  ),
  wave(
    3,
    ['2027-03-08', '2027-05-31'],
    ['2027-05-30', null],
    ['2027-05-31', null],
    ['2027-06-01', '2027-06-06'],
    500_000
  ),
  wave(4, ['2027-06-01', '2027-07-10'], null, null, null, null),
];

const k = 1000;
const line = (
  label: string,
  male: number,
  female = male,
  residency: AdmissionFeeItemInput['residency'] = 'ALL',
  isMonthly = false
): AdmissionFeeItemInput => ({
  label,
  maleAmount: male,
  femaleAmount: female,
  residency,
  isMonthly,
});

const PHOTO = 'Pas foto berwarna 3×4, 2 lembar';
const PARENTS_ID = 'Fotokopi KTP kedua orang tua 1 lembar';
const BIRTH = 'Fotokopi akta kelahiran 1 lembar';
const FAMILY = 'Fotokopi kartu keluarga 1 lembar';
const SECONDARY = [
  'Mengikuti tes seleksi',
  BIRTH,
  'Fotokopi kartu NISN',
  'Surat keterangan lulus',
  FAMILY,
  'Sumbangan buku bacaan islami 1 buah',
  PARENTS_ID,
  PHOTO,
  'SKKB dari sekolah asal',
];

export interface BrochureIntake {
  /** The unit's short name, as the period's name carries it. */
  label: string;
  /** Whether the waves' pay-in-full discounts apply. */
  discounts: boolean;
  requirements: string[];
  minAgeMonths: number | null;
  /** The "Rincian Biaya" table, line by line, in rupiah. */
  fees: AdmissionFeeItemInput[];
}

export const BROCHURE_INTAKES: Record<BrochureUnit, BrochureIntake> = {
  TK_QURAN: {
    label: "TK Qur'an",
    discounts: false,
    requirements: [BIRTH, FAMILY, PARENTS_ID, PHOTO],
    minAgeMonths: 5 * 12,
    fees: [
      line('Infaq Bangunan', 500 * k),
      line('Seragam', 500 * k),
      line('Buku Pelajaran Umum dan Kepesantrenan', 200 * k),
      line('Pendaftaran', 200 * k),
      line('SPP Bulanan (Non Boarding)', 200 * k, 200 * k, 'NON_BOARDING', true),
    ],
  },
  SD_IT: {
    label: 'SD IT',
    discounts: true,
    requirements: [
      'Mengikuti tes seleksi',
      BIRTH,
      FAMILY,
      PARENTS_ID,
      PHOTO,
      'Fotokopi ijazah TK/sederajat',
    ],
    minAgeMonths: 7 * 12,
    fees: [
      line('Infaq Bangunan', 1500 * k),
      line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k, 1750 * k, 'BOARDING'),
      line('Seragam', 500 * k),
      line('Buku Pelajaran Umum dan Kepesantrenan', 600 * k),
      line('Infaq Pendidikan 1 Tahun', 500 * k),
      line('Pendaftaran', 200 * k),
      line('SPP Bulanan (Boarding)', 800 * k, 800 * k, 'BOARDING', true),
      line('SPP Bulanan (Non Boarding)', 350 * k, 350 * k, 'NON_BOARDING', true),
    ],
  },
  SMP_IT: {
    label: 'SMP IT',
    discounts: true,
    requirements: SECONDARY,
    minAgeMonths: null,
    fees: [
      line('Infaq Bangunan', 3000 * k),
      line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k),
      line('Seragam', 1250 * k, 1500 * k),
      line('Buku Pelajaran Umum dan Kepesantrenan', 800 * k),
      line('Infaq Pendidikan 1 Tahun', 600 * k),
      line('Pendaftaran', 200 * k),
      line('SPP Bulanan (Boarding)', 950 * k, 950 * k, 'BOARDING', true),
    ],
  },
  SMA_QURAN: {
    label: "SMA Qur'an",
    discounts: true,
    requirements: SECONDARY,
    minAgeMonths: null,
    fees: [
      line('Infaq Bangunan', 3000 * k),
      line('Penyediaan Ranjang, Kasur, Lemari', 1750 * k),
      line('Seragam', 1250 * k, 1500 * k),
      line('Buku Pelajaran Umum dan Kepesantrenan', 1000 * k),
      line('Infaq Pendidikan 1 Tahun', 850 * k),
      line('Pendaftaran', 200 * k),
      line('SPP Bulanan (Boarding)', 950 * k, 950 * k, 'BOARDING', true),
    ],
  },
};
