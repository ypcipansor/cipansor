import { PDFDocument, StandardFonts, degrees, reduceRotation, rgb } from 'pdf-lib';
import { TEST_COPY_NOTE, TEST_COPY_STAMP } from '@cipansor/shared';
import { config } from '@/config';

const ANGLE = 45;
const STAMP_SIZE = 34;
const NOTE_SIZE = 7.5;
const RED = rgb(0.75, 0.1, 0.1);

/**
 * Maps a point given in the page's *displayed* coordinates back to the page's
 * own coordinate system, undoing the `/Rotate` a viewer applies and offsetting
 * by the CropBox origin.
 *
 * A viewer rotates the page clockwise by `/Rotate` before showing it. A mark
 * drawn at unrotated coordinates therefore lands somewhere else — on a 90° page
 * the note meant for the top edge appears down a side, and can fall outside the
 * visible area entirely. `(u, v)` are the displayed coordinates (origin at the
 * lower-left of what the reader sees); the result is the point to hand to
 * `page.drawText`, plus the angle the mark itself must be turned so it stays
 * upright to the reader.
 */
function displayedPointToPage(
  u: number,
  v: number,
  crop: { x: number; y: number; width: number; height: number },
  rotation: number
): { x: number; y: number; angle: number } {
  const r = reduceRotation(rotation);
  const { x: cx, y: cy, width: w, height: h } = crop;
  if (r === 90) {
    return { x: cx + (w - v), y: cy + u, angle: 90 };
  }
  if (r === 180) {
    return { x: cx + (w - u), y: cy + (h - v), angle: 180 };
  }
  if (r === 270) {
    return { x: cx + v, y: cy + (h - u), angle: 270 };
  }
  return { x: cx + u, y: cy + v, angle: 0 };
}

/** The displayed width and height of a page once `/Rotate` is applied. */
function displayedSize(
  crop: { width: number; height: number },
  rotation: number
): { width: number; height: number } {
  const r = reduceRotation(rotation);
  return r === 90 || r === 270
    ? { width: crop.height, height: crop.width }
    : { width: crop.width, height: crop.height };
}

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
    // The viewer shows the CropBox, not the MediaBox, and rotates the page by
    // /Rotate. `page.getSize()` measures the MediaBox, so a mark placed with it
    // can sit outside what a reader actually sees — present in the signed bytes
    // but invisible on screen. Place every mark inside the CropBox, expressed in
    // the page's own coordinates.
    const crop = page.getCropBox();
    const rotation = page.getRotation().angle;
    // Place marks using what the reader actually sees: the CropBox size, turned
    // by the page's own rotation.
    const { width, height } = displayedSize(crop, rotation);

    // The text is drawn from its baseline's left end; place that end so the
    // middle of the rotated text sits on the middle of the visible area.
    const stampX = width / 2 - (stampWidth / 2) * Math.cos(rad) + (STAMP_SIZE / 3) * Math.sin(rad);
    const stampY = height / 2 - (stampWidth / 2) * Math.sin(rad) - (STAMP_SIZE / 3) * Math.cos(rad);
    const stampAt = displayedPointToPage(stampX, stampY, crop, rotation);
    page.drawText(TEST_COPY_STAMP, {
      x: stampAt.x,
      y: stampAt.y,
      size: STAMP_SIZE,
      font: bold,
      color: RED,
      opacity: 0.22,
      // `ANGLE` is the diagonal; `stampAt.angle` undoes the page's own /Rotate
      // so the diagonal still reads the same way to the viewer.
      rotate: degrees(ANGLE + stampAt.angle),
    });

    const noteAt = displayedPointToPage((width - noteWidth) / 2, height - 16, crop, rotation);
    page.drawText(TEST_COPY_NOTE, {
      x: noteAt.x,
      y: noteAt.y,
      size: NOTE_SIZE,
      font: regular,
      color: RED,
      rotate: degrees(noteAt.angle),
    });
  }
}
