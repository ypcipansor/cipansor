import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import {
  generateLetterPdfBuffer,
  stampRevoked,
  LetterPdfError,
  type LetterPdfInput,
} from '@/utils/generate-letter-pdf';

/**
 * Dari mana byte yang disajikan berasal.
 *
 * `archive` adalah keadaan yang benar untuk setiap naskah yang ditandatangani
 * sejak arsip ada. `regenerated` hanya tersisa untuk dua hal: konsep yang belum
 * ditandatangani, dan surat lama yang ditandatangani sebelum arsip ada.
 */
export type LetterPdfSource = 'archive' | 'regenerated';

export interface LetterPdfResult {
  buffer: Buffer;
  source: LetterPdfSource;
}

/**
 * Kolom tanda tangan yang dibaca di sini, di luar yang dibutuhkan penghasil PDF.
 *
 * `getLetterById` memang memilihnya; tipe ini yang membuat pilihan itu terbaca
 * sebagai syarat, bukan sebagai kebetulan.
 */
interface SignatureRow {
  id?: string | null;
  pdfHash?: string | null;
  revokedReason?: string | null;
  revokedBy?: { name?: string | null } | null;
}

type PdfSignature = NonNullable<LetterPdfInput['signatures']>[number];

type LetterWithSignatures = Omit<LetterPdfInput, 'signatures'> & {
  signatures?: Array<PdfSignature & SignatureRow> | null;
};

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/**
 * Berkas PDF sebuah surat, diambil dari arsip bila ada.
 *
 * **Naskah yang sudah ditandatangani tidak dirender ulang.** Sampai PR-3 setiap
 * unduhan membuat ulang naskahnya dari data, sehingga verifikasi publik —
 * yang bekerja dengan menghitung ulang hash berkas yang diunggah — bertumpu
 * pada janji bahwa penghasil PDF akan mengeluarkan byte identik selamanya.
 * Janji itu tidak dapat ditepati: satu kenaikan versi `pdf-lib` membatalkan
 * seluruh surat yang pernah ditandatangani sekaligus, dan yang dibaca publik
 * bukan "sistem berubah" melainkan tuduhan bahwa naskahnya telah diubah.
 *
 * Jalur lama tetap ada, tetapi hanya sebagai cadangan untuk surat yang
 * ditandatangani sebelum arsip ada — dan di situ penjagaannya tetap berlaku:
 * salinan bercap DICABUT hanya dicetak bila hasil render ulang terbukti masih
 * sama persis dengan yang di-hash saat penandatanganan.
 */
export async function resolveLetterPdf(letter: LetterWithSignatures): Promise<LetterPdfResult> {
  const latest = letter.signatures?.at(-1) ?? null;
  const revoked = latest?.revokedAt ? latest : null;

  let buffer: Buffer | null = null;
  let source: LetterPdfSource = 'regenerated';

  if (latest?.id) {
    const archived = await prisma.letterSignedDocument.findUnique({
      where: { signatureId: latest.id },
      select: { bytes: true, sha256: true },
    });
    if (archived) {
      const bytes = Buffer.from(archived.bytes);
      const hash = sha256(bytes);
      /**
       * Arsip memeriksa dirinya sendiri sebelum disajikan.
       *
       * Berkas yang rusak di penyimpanan tidak boleh keluar diam-diam sebagai
       * naskah resmi: yang menerimanya akan mengunggahnya ke halaman verifikasi
       * dan dijawab bahwa dokumennya palsu. Lebih baik gagal di sini, dengan
       * kalimat yang menyebut sebabnya.
       */
      if (hash !== archived.sha256 || (latest.pdfHash && hash !== latest.pdfHash)) {
        throw Errors.internal(
          'Arsip naskah ini tidak lagi utuh: berkas yang tersimpan tidak cocok dengan hash yang ' +
            'ditandatangani. Laporkan kepada administrator; jangan edarkan salinan apa pun dari surat ini.'
        );
      }
      buffer = bytes;
      source = 'archive';
    }
  }

  if (!buffer) {
    try {
      buffer = await generateLetterPdfBuffer(
        revoked
          ? {
              ...letter,
              signatures: (letter.signatures ?? []).map((s) => ({ ...s, revokedAt: null })),
            }
          : letter
      );
    } catch (e) {
      if (e instanceof LetterPdfError) throw Errors.badRequest(e.message);
      throw e;
    }

    if (revoked) {
      const hash = sha256(buffer);
      if (!latest?.pdfHash || hash !== latest.pdfHash) {
        throw Errors.badRequest(
          'Naskah ini tidak dapat dicetak ulang: berkas yang dihasilkan tidak lagi sama persis ' +
            'dengan yang ditandatangani, sehingga salinan bercap pun tidak dapat dipertanggungjawabkan.'
        );
      }
    }
  }

  if (revoked) {
    buffer = await stampRevoked(buffer, {
      reason: revoked.revokedReason ?? 'Dicabut oleh pejabat yang berwenang.',
      revokedAt: new Date(revoked.revokedAt as unknown as string),
      revokedByName: revoked.revokedBy?.name ?? null,
    });
  }

  return { buffer, source };
}
