/**
 * Facts the assistant must read at answer time rather than from its corpus.
 *
 * The knowledge base is derived from constants and is therefore always as
 * current as the site. Admission data is different in kind: it lives in a row
 * that opens and closes on a schedule nobody redeploys for. A fee or a closing
 * date baked into a static corpus is correct until the day it silently is not,
 * and the failure lands on a family deciding where to send their child.
 *
 * These are read-only lookups against the same authorised projection the public
 * SPMB page uses — `findPublicIntakes` — so the whitelist that keeps quota,
 * registrant counts and PII out of anonymous responses covers the bot too, with
 * no second copy to keep in step. One fact per unit: the brochure's waves,
 * fees, requirements and contact, as the unit's admin entered them.
 *
 * This is also the shape Phase 2 generalises: private data reached through
 * calls to existing authorised code, never a vector index over the database.
 * See docs/planning/chatbot-design.md §2.
 */

import { admissionFeeTotals, type PublicIntakeDTO } from '@cipansor/shared';
import { findPublicIntakes } from '../admissions/admissions.service';
import { logger } from '@/lib/logger';
import { closestTerm, tokenize } from './retrieval';

export interface LiveFact {
  id: string;
  title: string;
  text: string;
}

/**
 * Terms that mean the question is about admissions. Stemmed through the same
 * pipeline as the corpus so "pendaftaran" matches "daftar".
 */
const ADMISSION_TRIGGERS = new Set(
  [
    'spmb',
    'ppdb',
    'psb',
    'daftar',
    'pendaftaran',
    'mendaftar',
    'masuk',
    'biaya',
    'bayar',
    'pembayaran',
    'tarif',
    'harga',
    'gelombang',
    'kuota',
    'syarat',
    'persyaratan',
    'berkas',
    'dokumen',
    'seleksi',
    'tes',
    'santri baru',
    'murid baru',
    'siswa baru',
    'penerimaan',
    'buka',
    'dibuka',
    'tutup',
    'ditutup',
    'kapan',
    'jadwal',
  ].flatMap((term) => tokenize(term))
);

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const money = (value: string | number | null | undefined) =>
  value === null || value === undefined ? null : currencyFormatter.format(Number(value));

/** One day, or "first – last". Both are moments or calendar days; WIB decides the day. */
function days(start: string | null, end?: string | null): string {
  if (!start) return '';
  const a = dateFormatter.format(new Date(start));
  const b = end ? dateFormatter.format(new Date(end)) : a;
  return a === b ? a : `${a} – ${b}`;
}

const WAVE_STATE = {
  upcoming: 'belum dibuka',
  open: 'SEDANG DIBUKA',
  closed: 'sudah ditutup',
  full: 'ditutup karena kuota penuh',
} as const;

const RESIDENCY = { ALL: '', BOARDING: 'mukim', NON_BOARDING: 'tidak mukim' } as const;

function describeIntake(intake: PublicIntakeDTO, now: Date): LiveFact {
  const { unit, period } = intake;
  const unitName = unit.officialName ?? unit.name;
  const end = new Date(period.endDate);
  const on = (iso: string) => dateFormatter.format(new Date(iso));
  const daysUntil = (iso: string) =>
    Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);

  // The window the page shows: by the waves where there are any, because the
  // API refuses a registration between two waves or once every wave is full.
  let status: string;
  if (period.window === 'open') {
    const closesAt = period.closesAt ?? period.endDate;
    status =
      closesAt === period.endDate
        ? `Pendaftaran DIBUKA sekarang dan ditutup pada ${on(closesAt)} (sekitar ${daysUntil(closesAt)} hari lagi).`
        : `Pendaftaran DIBUKA sekarang; gelombang yang berjalan ditutup pada ${on(closesAt)} (sekitar ${daysUntil(closesAt)} hari lagi), dan periode pendaftaran berakhir ${dateFormatter.format(end)}.`;
  } else if (period.window === 'upcoming') {
    const opensAt = period.opensAt ?? period.startDate;
    status =
      now >= new Date(period.startDate)
        ? `Pendaftaran sedang DITUTUP di antara dua gelombang; dibuka lagi pada ${on(opensAt)}.`
        : `Pendaftaran BELUM dibuka; dibuka pada ${on(opensAt)} dan periode pendaftaran berakhir ${dateFormatter.format(end)}.`;
  } else if (now <= end) {
    status = 'Pendaftaran sedang DITUTUP: semua gelombang sudah penuh atau ditutup.';
  } else {
    status = `Pendaftaran SUDAH DITUTUP pada ${dateFormatter.format(end)}.`;
  }

  const parts = [
    `${unitName}: SPMB ${period.academicYear ? `tahun ajaran ${period.academicYear}` : period.name}.`,
    status,
  ];

  for (const wave of intake.waves) {
    const sessions = [
      `pendaftaran ${days(wave.startDate, wave.endDate)} (${WAVE_STATE[wave.window]})`,
      wave.testStartDate ? `tes ${days(wave.testStartDate, wave.testEndDate)}` : '',
      wave.resultsStartDate ? `pengumuman ${days(wave.resultsStartDate, wave.resultsEndDate)}` : '',
      wave.reRegistrationStartDate
        ? `daftar ulang ${days(wave.reRegistrationStartDate, wave.reRegistrationEndDate)}`
        : '',
      Number(wave.fullPaymentDiscount) > 0
        ? `potongan ${money(wave.fullPaymentDiscount)} bila dibayar lunas`
        : '',
    ].filter(Boolean);
    parts.push(`${wave.name}: ${sessions.join('; ')}.`);
  }

  if (intake.fees.length) {
    // Totals computed the way the page computes them, so the bot and the page
    // can never quote different sums.
    for (const total of admissionFeeTotals(intake.fees)) {
      const who = RESIDENCY[total.residency];
      const monthly =
        total.monthlyMale || total.monthlyFemale
          ? ` (termasuk biaya bulanan pertama; biaya bulanan ikhwan ${money(total.monthlyMale)}, akhwat ${money(total.monthlyFemale)})`
          : '';
      parts.push(
        `Jumlah biaya masuk${who ? ` ${who}` : ''}: ikhwan ${money(total.male)}, akhwat ${money(total.female)}${monthly}.`
      );
    }
    parts.push(
      `Rinciannya: ${intake.fees
        .map((f) => {
          const tags = [RESIDENCY[f.residency], f.isMonthly ? 'per bulan' : ''].filter(Boolean);
          const amount =
            Number(f.maleAmount) === Number(f.femaleAmount)
              ? money(f.maleAmount)
              : `ikhwan ${money(f.maleAmount)}, akhwat ${money(f.femaleAmount)}`;
          return `${f.label}${tags.length ? ` (${tags.join(', ')})` : ''} ${amount}`;
        })
        .join('; ')}.`
    );
  } else if (Number(period.registrationFee) > 0) {
    parts.push(`Biaya pendaftaran: ${money(period.registrationFee)}.`);
  }

  if (period.requirements.length > 0) {
    parts.push(`Persyaratan: ${period.requirements.join('; ')}.`);
  }
  if (period.minAgeMonths !== null) {
    const years = Math.floor(period.minAgeMonths / 12);
    const months = period.minAgeMonths % 12;
    parts.push(
      `Usia minimal ${years} tahun${months ? ` ${months} bulan` : ''}${
        period.ageReferenceDate ? ` pada ${days(period.ageReferenceDate)}` : ''
      }.`
    );
  }
  if (period.contactName || period.contactPhone) {
    parts.push(
      `Narahubung: ${[period.contactName, period.contactPhone].filter(Boolean).join(', ')}.`
    );
  }

  return {
    id: `spmb-${unit.type.toLowerCase()}`,
    title: `Informasi pendaftaran SPMB ${unitName}`,
    text: parts.join(' '),
  };
}

/**
 * Returns live facts relevant to the question, or an empty list.
 *
 * Gated on the question rather than fetched unconditionally: most questions are
 * about programmes or location, and there is no reason to put a database read
 * on that path.
 */
export async function collectLiveFacts(
  question: string,
  now: Date = new Date()
): Promise<LiveFact[]> {
  // Corrected against the trigger list before matching, so a misspelled fee
  // question still fetches the fee. Without this, "brp biyaya pndaftaran nya"
  // retrieved the right page and answered without the one number it asked for.
  const asked = tokenize(question).map((token) => closestTerm(token, ADMISSION_TRIGGERS));
  const aboutAdmissions = asked.some((token) => ADMISSION_TRIGGERS.has(token));
  if (!aboutAdmissions) return [];

  try {
    const intakes = await findPublicIntakes(now);
    if (!intakes.length) {
      return [
        {
          id: 'spmb-status',
          title: 'Status pendaftaran SPMB',
          text: 'Saat ini tidak ada gelombang pendaftaran SPMB yang aktif.',
        },
      ];
    }
    return intakes.map((intake) => describeIntake(intake, now));
  } catch (error) {
    // A database hiccup must not turn into a fabricated answer. Returning no
    // live fact means the model has no admission figures in context, and the
    // scaffold's rule 2 then forces it to say it does not know.
    logger.error('Failed to load live admission facts for chatbot', { error });
    return [];
  }
}
