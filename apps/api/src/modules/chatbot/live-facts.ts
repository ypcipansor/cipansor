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
 * SPMB page uses — `findPublicActivePeriod` — so the whitelist that keeps quota,
 * registrant counts and PII out of anonymous responses covers the bot too, with
 * no second copy to keep in step.
 *
 * This is also the shape Phase 2 generalises: private data reached through
 * calls to existing authorised code, never a vector index over the database.
 * See docs/planning/chatbot-design.md §2.
 */

import { findPublicActivePeriod } from '../admissions/admissions.service';
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

function describePeriod(
  period: Awaited<ReturnType<typeof findPublicActivePeriod>>,
  now: Date
): LiveFact {
  if (!period) {
    return {
      id: 'spmb-status',
      title: 'Status pendaftaran SPMB',
      text: 'Saat ini tidak ada gelombang pendaftaran SPMB yang aktif.',
    };
  }

  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  // `registrationFee` is a Prisma Decimal — it serialises as a string, and
  // Number() on it is exact at these magnitudes. Formatting it here rather than
  // handing the raw value to the model matters: the model must never have to
  // decide how to render money.
  const fee =
    period.registrationFee === null || period.registrationFee === undefined
      ? null
      : currencyFormatter.format(Number(period.registrationFee));

  let status: string;
  if (start <= now && end >= now) {
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
    status = `Pendaftaran DIBUKA sekarang dan ditutup pada ${dateFormatter.format(end)} (sekitar ${daysLeft} hari lagi).`;
  } else if (start > now) {
    status = `Pendaftaran BELUM dibuka. Gelombang ini dibuka pada ${dateFormatter.format(start)} dan ditutup ${dateFormatter.format(end)}.`;
  } else {
    status = `Pendaftaran gelombang ini SUDAH DITUTUP pada ${dateFormatter.format(end)}.`;
  }

  const parts = [
    `Gelombang: ${period.name}.`,
    period.academicYear?.name ? `Tahun ajaran: ${period.academicYear.name}.` : '',
    period.unit?.name ? `Unit: ${period.unit.name}.` : '',
    status,
    fee ? `Biaya pendaftaran: ${fee}.` : '',
  ].filter(Boolean);

  if (period.requirements.length > 0) {
    parts.push(`Persyaratan: ${period.requirements.join('; ')}.`);
  }

  return {
    id: 'spmb-gelombang-aktif',
    title: 'Informasi pendaftaran SPMB terkini',
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
    const period = await findPublicActivePeriod(now);
    return [describePeriod(period, now)];
  } catch (error) {
    // A database hiccup must not turn into a fabricated answer. Returning no
    // live fact means the model has no admission figures in context, and the
    // scaffold's rule 2 then forces it to say it does not know.
    logger.error('Failed to load live admission facts for chatbot', { error });
    return [];
  }
}
