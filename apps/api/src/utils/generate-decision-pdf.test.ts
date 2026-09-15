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
});
