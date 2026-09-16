import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateDecisionPdf, type DecisionPdfData } from './generate-decision-pdf';

const data: DecisionPdfData = {
  shortId: 'DEC-1A2B',
  subject: 'Pengesahan Rencana Kerja',
  decisionType: 'pengesahan-rencana-kerja',
  organType: 'PEMBINA',
  kind: 'CIRCULAR',
  status: 'APPROVED',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  decidedAt: new Date('2026-01-02T00:00:00Z'),
  body: 'Rencana kerja tahunan disetujui seluruh anggota Dewan Pembina dengan penuh tanggung jawab.',
  members: [
    { name: 'Anggota 0', roleCode: 'YAYASAN_PEMBINA' },
    { name: 'Anggota 1', roleCode: 'YAYASAN_PEMBINA' },
    { name: 'Anggota 2', roleCode: 'YAYASAN_PEMBINA' },
  ],
  votes: [
    {
      name: 'Anggota 0',
      roleCode: 'YAYASAN_PEMBINA',
      choice: 'APPROVE',
      signedAt: new Date(),
      signatureShort: 'AAAA1111…',
      note: null,
    },
    {
      name: 'Anggota 1',
      roleCode: 'YAYASAN_PEMBINA',
      choice: 'APPROVE',
      signedAt: new Date(),
      signatureShort: 'BBBB2222…',
      note: null,
    },
  ],
  voteSummary: { present: 2, active: 3, approve: 2, reject: 0, abstain: 0 },
  verificationToken: 'tok1234567890',
};

describe('generateDecisionPdf', () => {
  it('menghasilkan PDF valid yang dapat dibuka ulang', async () => {
    const buf = await generateDecisionPdf(data);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('memuat halaman A4 tunggal dan tetap dapat dibuka', async () => {
    const doc = await PDFDocument.load(await generateDecisionPdf(data));
    expect(doc.getPages()[0].getSize()).toEqual({ width: 595, height: 842 });
  });

  it('konsisten (deterministik) untuk data yang sama', async () => {
    const a = await generateDecisionPdf(data);
    const b = await generateDecisionPdf(data);
    expect(a.equals(b)).toBe(true);
  });

  /**
   * Regresi: teks Unicode (Arab/emoji) tidak boleh membuat `drawText` melempar.
   *
   * Font standar pdf-lib (Helvetica) hanya mendukung WinAnsi, dan `drawText`
   * MELEMPAR untuk karakter di luarnya. Karena render terjadi DI DALAM
   * transaksi suara yang mencapai kuorum, satu emoji di dalam naskah cukup
   * untuk me-rollback suara yang sah dan meninggalkan keputusan terbuka
   * selamanya. PDF harus tetap terbentuk, dengan isinya tetap tercetak.
   */
  it('menghasilkan PDF walau body memuat Arab dan emoji (font Unicode)', async () => {
    const buf = await generateDecisionPdf({
      ...data,
      body: 'Keputusan ini ditulis dengan kaligrafi Arab بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم dan emoji ✅🎉 agar tetap aman.',
    });
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    // PDF dapat dibuka ulang — bukti byte-nya utuh, bukan sekadar tak melempar.
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('menghasilkan PDF walau PERIHAL memuat emoji', async () => {
    const buf = await generateDecisionPdf({
      ...data,
      subject: 'Pengesahan 🎉 Rencana Kerja ✅',
    });
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
