import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * F8 (ANALYSIS) — jangan pernah menyegel dokumen yang kehilangan karakter.
 *
 * Ketika font Unicode tidak dapat dimuat, `sanitizeForFallbackFont` dulu
 * mengganti setiap aksara di luar WinAnsi menjadi "?", lalu PDF itu tetap
 * di-e-seal. Untuk keputusan resmi itu berarti nama anggota, perihal, atau
 * naskah beraksara Arab/emoji tersimpan permanen dalam bentuk yang salah —
 * arsip yang diklaim sah padahal isinya sudah rusak. Yang benar: gagalkan
 * persiapan artefak (di LUAR kunci keputusan, sehingga suara tidak
 * ter-rollback), dan biarkan keputusan tetap VOTING untuk difinalisasi ulang
 * setelah font dipulihkan.
 *
 * Berkas ini memuat ulang modul dengan `fs.existsSync` yang selalu false untuk
 * berkas font, sehingga `embedUnicodeFont` mengembalikan null — keadaan "font
 * hilang" yang tidak dapat dicapai dengan font yang benar-benar terpasang.
 */
describe('generateDecisionPdf tanpa font Unicode (F8)', () => {
  let generateDecisionPdf: typeof import('./generate-decision-pdf').generateDecisionPdf;
  let unencodableDecisionPdfFields: typeof import('./generate-decision-pdf').unencodableDecisionPdfFields;
  let assertDecisionPdfFontAvailable: typeof import('./generate-decision-pdf').assertDecisionPdfFontAvailable;

  const data = {
    shortId: 'DEC-1A2B',
    subject: 'Pengesahan Rencana Kerja',
    decisionType: 'pengesahan-rencana-kerja',
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    status: 'APPROVED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    decidedAt: new Date('2026-01-02T00:00:00Z'),
    body: 'Rencana kerja tahunan disetujui seluruh anggota.',
    members: [{ userId: 'u0', name: 'Anggota 0', roleCode: 'YAYASAN_PEMBINA' }],
    votes: [
      {
        userId: 'u0',
        name: 'Anggota 0',
        roleCode: 'YAYASAN_PEMBINA',
        choice: 'APPROVE',
        signedAt: new Date('2026-01-02T00:00:00Z'),
        signatureShort: 'AAAA1111…',
        note: null,
      },
    ],
    voteSummary: { present: 1, active: 1, approve: 1, reject: 0, abstain: 0 },
    verificationToken: 'tok1234567890',
  };

  beforeEach(async () => {
    vi.resetModules();
    // Tidak ada berkas font di mana pun.
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        default: { ...actual, existsSync: () => false },
        existsSync: () => false,
      };
    });
    const mod = await import('./generate-decision-pdf');
    generateDecisionPdf = mod.generateDecisionPdf;
    unencodableDecisionPdfFields = mod.unencodableDecisionPdfFields;
    assertDecisionPdfFontAvailable = mod.assertDecisionPdfFontAvailable;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.resetModules();
  });

  it('gagal (tidak menyegel) bila subject memuat aksara Arab dan font absen', async () => {
    await expect(
      generateDecisionPdf({ ...data, subject: 'بِسْمِ اللَّهِ Pengesahan' })
    ).rejects.toThrow(/Font Unicode|kehilangan karakter/i);
  });

  it('gagal bila nama anggota memuat aksara non-WinAnsi dan font absen', async () => {
    await expect(
      generateDecisionPdf({
        ...data,
        members: [{ userId: 'u0', name: 'Ahmad 漢字', roleCode: 'YAYASAN_PEMBINA' }],
      })
    ).rejects.toThrow(/Font Unicode|kehilangan karakter/i);
  });

  it('teks ASCII tetap menghasilkan PDF walau font Unicode absen', async () => {
    const buf = await generateDecisionPdf(data);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('unencodableDecisionPdfFields melaporkan field + aksara yang bermasalah', () => {
    const offenders = unencodableDecisionPdfFields({
      ...data,
      subject: 'Pengesahan 🎉',
      body: 'Naskah بِسْمِ اللَّهِ',
    });
    const fields = offenders.map((o) => o.field);
    expect(fields).toContain('subject');
    expect(fields).toContain('body');
    expect(offenders.find((o) => o.field === 'subject')?.chars).toContain('🎉');
  });

  it('unencodableDecisionPdfFields kosong untuk data ASCII', () => {
    expect(unencodableDecisionPdfFields(data)).toEqual([]);
  });

  it('assertDecisionPdfFontAvailable menolak boot produksi tanpa font', () => {
    expect(() => assertDecisionPdfFontAvailable('production')).toThrow(/font/i);
  });

  it('assertDecisionPdfFontAvailable diam di non-produksi', () => {
    expect(() => assertDecisionPdfFontAvailable('development')).not.toThrow();
    expect(() => assertDecisionPdfFontAvailable('test')).not.toThrow();
  });
});
