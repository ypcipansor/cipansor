/**
 * A test copy of the system (staging, `DOCUMENT_TEST_COPY=true`) stamps every
 * page of every document it renders — a naskah dinas we lay out, a Rapor
 * Merdeka, and a naskah a drafter uploaded and had signed. Its demo accounts
 * carry the names of the yayasan's real office holders and their passwords are
 * public, so an unstamped naskah from staging would be a naskah "signed" by the
 * real Ketua on the real letterhead. Production, where the switch is off,
 * renders exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { TEST_COPY_NOTE, TEST_COPY_STAMP } from '@cipansor/shared';

const { documents } = vi.hoisted(() => ({ documents: { testCopy: false } }));
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
  return { ...actual, config: { ...actual.config, documents } };
});

import {
  generateLetterPdfBuffer,
  stampSignatureVisualisation,
  type LetterPdfInput,
} from './generate-letter-pdf';
import {
  generateRaportMerdekaPdfBuffer,
  type RaportMerdekaPdfData,
} from './generate-raport-merdeka-pdf';

const letter = {
  id: 'letter-1',
  letterNumber: '434/Sket/Y-CPS/IX/2026',
  date: new Date('2026-09-01T00:00:00.000Z'),
  type: 'SURAT_KETERANGAN',
  nature: 'PUBLIC',
  subject: 'Keterangan Aktif Santri',
  // Long enough for a second page.
  content: Array.from({ length: 90 }, (_, i) => `Baris isi naskah nomor ${i + 1}.`).join('\n'),
  unit: { name: 'SMP IT Cipansor', address: 'Tasikmalaya' },
  signatures: [],
} as LetterPdfInput;

const raport: RaportMerdekaPdfData = {
  siswa: { nama: 'Ahmad', nis: '9021', kelas: '7A', unit: 'SMP IT Pesantren Cipansor' },
  tahunAjaran: { tahun: '2026/2027', semester: 1, semesterLabel: 'Ganjil' },
  waliKelas: { nama: 'Ustadzah Wali' },
  intrakurikuler: { kelompokUmum: [], kelompokPesantren: [] },
};

let drawn: Array<{ text: string; page: PDFPage }>;

beforeEach(() => {
  documents.testCopy = false;
  drawn = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, o) {
    drawn.push({ text, page: this });
    return original.call(this, text, o);
  });
});
afterEach(() => vi.restoreAllMocks());

const pagesWith = (text: string) =>
  new Set(drawn.filter((d) => d.text === text).map((d) => d.page));
const allPages = () => new Set(drawn.map((d) => d.page));

describe('a test copy stamps its documents', () => {
  it('stamps every page of a naskah dinas, with the note at the top', async () => {
    documents.testCopy = true;

    await generateLetterPdfBuffer(letter);

    expect(allPages().size).toBeGreaterThan(1);
    expect(pagesWith(TEST_COPY_STAMP)).toEqual(allPages());
    expect(pagesWith(TEST_COPY_NOTE)).toEqual(allPages());
  });

  it('stamps every page of a Rapor Merdeka', async () => {
    documents.testCopy = true;

    await generateRaportMerdekaPdfBuffer(raport);

    expect(pagesWith(TEST_COPY_STAMP)).toEqual(allPages());
  });

  /**
   * A naskah dinas a drafter uploaded and had signed goes through
   * `stampSignatureVisualisation`, not `generateLetterPdfBuffer` — so it needs
   * its own stamp, or a staging archive holds an officially signed upload with
   * no test-copy marking. The stamp lands on the drafter's pages *and* the
   * appended visualisation sheet, since it is applied to the whole document.
   */
  it('stamps every page of a signed uploaded naskah, drafter pages included', async () => {
    documents.testCopy = true;

    const uploaded = await PDFDocument.create();
    uploaded.addPage([595.28, 841.89]);
    uploaded.addPage([595.28, 841.89]);
    const uploadedBytes = Buffer.from(await uploaded.save());

    const signed = await stampSignatureVisualisation(uploadedBytes, {
      signedAt: new Date('2026-09-01T03:00:00.000Z'),
      signerName: 'H. Dadan Hamdani',
      signerTitle: 'Ketua Yayasan',
    });

    expect(signed).toBeInstanceOf(Buffer);
    // Two drafter pages plus the appended visualisation sheet, all stamped.
    expect(allPages().size).toBe(3);
    expect(pagesWith(TEST_COPY_STAMP)).toEqual(allPages());
    expect(pagesWith(TEST_COPY_NOTE)).toEqual(allPages());
  });

  it('stamps nothing where the switch is off — production', async () => {
    await generateLetterPdfBuffer(letter);
    await generateRaportMerdekaPdfBuffer(raport);
    await stampSignatureVisualisation(await generateLetterPdfBuffer(letter), {
      signedAt: new Date('2026-09-01T03:00:00.000Z'),
      signerName: 'X',
    });

    expect(pagesWith(TEST_COPY_STAMP).size).toBe(0);
    expect(pagesWith(TEST_COPY_NOTE).size).toBe(0);
  });
});
