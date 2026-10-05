import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { TEST_COPY_NOTE, TEST_COPY_STAMP } from '@cipansor/shared';
import { config } from '@/config';

const ANGLE = 45;
const STAMP_SIZE = 34;
const NOTE_SIZE = 7.5;
const RED = rgb(0.75, 0.1, 0.1);

/**
 * Stamps every page of a document from a test copy of the system
 * (`config.documents.testCopy`, staging): "SALINAN UJI — BUKAN DOKUMEN SAH"
 * across the page and a line at its top saying where it came from.
 *
 * Called just before a document is saved. For a naskah dinas that is before it
 * is signed, so the signed bytes carry the stamp and no copy of the file exists
 * without it. Off — and the bytes exactly as before — everywhere else.
 */
export async function stampIfTestCopy(pdfDoc: PDFDocument): Promise<void> {
  if (!config.documents.testCopy) return;

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const stampWidth = bold.widthOfTextAtSize(TEST_COPY_STAMP, STAMP_SIZE);
  const noteWidth = regular.widthOfTextAtSize(TEST_COPY_NOTE, NOTE_SIZE);
  const rad = (ANGLE * Math.PI) / 180;

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    // The text is drawn from its baseline's left end; place that end so the
    // middle of the rotated text sits on the middle of the page.
    const x = width / 2 - (stampWidth / 2) * Math.cos(rad) + (STAMP_SIZE / 3) * Math.sin(rad);
    const y = height / 2 - (stampWidth / 2) * Math.sin(rad) - (STAMP_SIZE / 3) * Math.cos(rad);
    page.drawText(TEST_COPY_STAMP, {
      x,
      y,
      size: STAMP_SIZE,
      font: bold,
      color: RED,
      opacity: 0.22,
      rotate: degrees(ANGLE),
    });
    page.drawText(TEST_COPY_NOTE, {
      x: (width - noteWidth) / 2,
      y: height - 16,
      size: NOTE_SIZE,
      font: regular,
      color: RED,
    });
  }
}
