import type { PrismaClient } from '@prisma/client';
import type { AppPrismaClient } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Menghitung naskah dinas yang masa retensinya habis.
 *
 * **Kenapa hanya menghitung, dan bukan memusnahkan.** Jadwal Retensi Arsip
 * (JRA) adalah instrumen yang *disahkan*, bukan angka yang dikarang di kode
 * (Peraturan ANRI 5/2021 tentang Pengelolaan Arsip Dinamis, Pasal 6;
 * Perka ANRI 7/2016 tentang Sistem Klasifikasi Keamanan dan Akses Arsip
 * Dinamis). Nilai `FilingClassification.retention` yang ada di basis data pun
 * disalin dari JRA induk sektor; ia memberi *usul*, sedangkan keputusan
 * memusnahkan arsip harus melalui penilaian dan berita acara. Karena itu
 * pekerjaan ini menghasilkan daftar usul dan mencatatnya, dan tidak pernah
 * menghapus naskah yang sudah ditandatangani — berkas yang buktinya justru
 * dipertahankan.
 *
 * **Kenapa di sini, bukan di crontab host.** Sama dengan penyapuan dokumen
 * identitas: datanya hanya terjangkau dari jaringan Compose dan jejaknya harus
 * ikut berpindah bersama image-nya. Alasan lengkapnya ada di
 * `identity-purge.job.ts`.
 *
 * Hasilnya, bukan kalimat — pemanggilnya yang memutuskan cara melaporkannya,
 * supaya perintah CLI dapat mencetaknya dalam bahasa Indonesia sementara
 * penjadwal mencatatnya lewat `logger`.
 */

/** Status naskah yang retensinya bermakna dihitung. */
const RETENTION_STATUSES = ['SIGNED', 'SENT', 'ARCHIVED'] as const;

/** Satu naskah yang masa retensinya sudah lewat. */
export interface RetentionDueLetter {
  id: string;
  letterNumber: string | null;
  agendaNumber: string | null;
  subject: string;
  unitId: string;
  nature: string;
  classificationCode: string | null;
  classificationName: string | null;
  /** Tahun retensi dari klasifikasinya. */
  retentionYears: number;
  /** Tanggal surat, dasar perhitungan. */
  letterDate: Date;
  /** Kapan retensinya berakhir: tanggal surat + tahun retensi. */
  dueAt: Date;
}

export interface LetterRetentionSummary {
  dryRun: boolean;
  /** Naskah yang retensinya sudah lewat, terurut dari yang paling lama. */
  due: RetentionDueLetter[];
  /** Semua surat berklasifikasi yang diperiksa, sebagai penyebut. */
  consideredCount: number;
  /** Surat terarsip yang klasifikasinya belum punya nilai retensi. */
  missingRetention: number;
}

export const LETTER_RETENTION_AUDIT_ACTION = 'REVIEW_LETTER_RETENTION';

/**
 * Menambahkan sejumlah tahun ke sebuah tanggal, secara kalender.
 *
 * Bukan `+ n * 365 * 24 * 3600 * 1000`: tahun kabisat membuat selisihnya satu
 * hari, dan sebuah tanggal "berakhir" yang meleset sehari pada arsip yang
 * dipertahankan sepuluh tahun adalah perhitungan yang tidak dapat
 * dipertanggungjawabkan. `setFullYear` menjaga tanggal kalendernya.
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Mengumpulkan naskah yang masa retensinya berakhir.
 *
 * Difilter di sisi aplikasi, bukan di SQL: penambahan tahun kalender di SQL
 * berbeda antar mesin basis data dan tidak dapat diuji tanpa basis data.
 * Kandidatnya sendiri sempit — hanya surat berklasifikasi dengan status
 * terbit — sehingga jumlah barisnya kecil dan aman.
 */
export async function reviewLetterRetention(
  prisma: AppPrismaClient | PrismaClient,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {}
): Promise<LetterRetentionSummary> {
  const letters = await prisma.letter.findMany({
    where: {
      classificationId: { not: null },
      status: { in: [...RETENTION_STATUSES] },
    },
    select: {
      id: true,
      letterNumber: true,
      agendaNumber: true,
      subject: true,
      unitId: true,
      nature: true,
      date: true,
      classification: { select: { code: true, name: true, retention: true } },
    },
    orderBy: { date: 'asc' },
  });

  const due: RetentionDueLetter[] = [];
  let missingRetention = 0;

  for (const letter of letters) {
    const years = letter.classification?.retention ?? null;
    if (years === null || years === undefined) {
      // Sebuah surat terarsip yang klasifikasinya belum punya masa retensi
      // adalah kekosongan JRA, bukan surat yang boleh dimusnahkan.
      missingRetention += 1;
      continue;
    }
    const dueAt = addYears(letter.date, years);
    if (dueAt.getTime() > now.getTime()) continue;
    due.push({
      id: letter.id,
      letterNumber: letter.letterNumber,
      agendaNumber: letter.agendaNumber,
      subject: letter.subject,
      unitId: letter.unitId,
      nature: letter.nature,
      classificationCode: letter.classification?.code ?? null,
      classificationName: letter.classification?.name ?? null,
      retentionYears: years,
      letterDate: letter.date,
      dueAt,
    });
  }

  const summary: LetterRetentionSummary = {
    dryRun,
    due,
    consideredCount: letters.length,
    missingRetention,
  };

  if (!dryRun) await recordRun(prisma, summary);
  return summary;
}

/**
 * Satu baris audit setiap kali peninjauan benar-benar berjalan.
 *
 * Baris ini yang mengubah "apakah retensi itu benar-benar ditinjau" menjadi
 * satu kueri, sama seperti penyapuan dokumen identitas. Nomor dan perihal
 * surat **tidak** dicatat: tabel audit dibaca lebih banyak orang daripada
 * daftar surat, dan sebuah perihal naskah Rahasia di sana akan membocorkannya
 * kembali. Yang dicatat hanya jumlah.
 *
 * Gagal mencatat tidak boleh menggagalkan peninjauan yang sudah selesai.
 */
async function recordRun(prisma: AppPrismaClient | PrismaClient, summary: LetterRetentionSummary) {
  try {
    await prisma.auditLog.create({
      data: {
        action: LETTER_RETENTION_AUDIT_ACTION,
        entity: 'Letter',
        newValues: {
          due: summary.due.length,
          considered: summary.consideredCount,
          missingRetention: summary.missingRetention,
        },
      },
    });
  } catch (error) {
    logger.error('[Retention] Gagal mencatat peninjauan retensi:', error);
  }
}
