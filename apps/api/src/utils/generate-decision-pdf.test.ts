import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  generateDecisionPdf,
  membersWithoutVote,
  decisionVerificationFooter,
  wrap,
  type DecisionPdfData,
} from './generate-decision-pdf';

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
    { userId: "u0", name: 'Anggota 0', roleCode: 'YAYASAN_PEMBINA' },
    { userId: "u1", name: 'Anggota 1', roleCode: 'YAYASAN_PEMBINA' },
    { userId: "u2", name: 'Anggota 2', roleCode: 'YAYASAN_PEMBINA' },
  ],
  votes: [
    {
      userId: "u0",
      name: 'Anggota 0',
      roleCode: 'YAYASAN_PEMBINA',
      choice: 'APPROVE',
      signedAt: new Date(),
      signatureShort: 'AAAA1111…',
      note: null,
    },
    {
      userId: "u1",
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

/**
 * Regresi: dua anggota bernama sama tidak boleh saling menyembunyikan.
 *
 * `votedIds` dulu dibangun dari NAMA, sehingga begitu satu "Budi Santoso"
 * memberi suara, "Budi Santoso" yang lain dianggap sudah bersuara juga. PDF
 * final yang kemudian disegel permanen menghilangkan anggota yang sebenarnya
 * belum bersuara dari daftar "ANGGOTA YANG BELUM MEMBERI SUARA" — dan arsip
 * mengunci kelalaian itu selamanya. Pencocokan harus lewat userId.
 */
describe('membersWithoutVote', () => {
  const members = [
    { userId: 'u1', name: 'Budi Santoso', roleCode: 'YAYASAN_PEMBINA' },
    { userId: 'u2', name: 'Budi Santoso', roleCode: 'YAYASAN_PEMBINA' },
    { userId: 'u3', name: 'Siti Aminah', roleCode: 'YAYASAN_PEMBINA' },
  ];
  const voteBy = (userId: string) => ({
    userId,
    name: 'Budi Santoso',
    roleCode: 'YAYASAN_PEMBINA',
    choice: 'APPROVE',
    signatureShort: 'AAAA…',
    signedAt: new Date(),
    note: null,
  });

  it('menyisakan anggota bernama sama yang belum bersuara', () => {
    const abstained = membersWithoutVote(members, [voteBy('u1')]);
    expect(abstained.map((m) => m.userId)).toEqual(['u2', 'u3']);
  });

  it('hanya anggota yang benar-benar bersuara yang dikeluarkan', () => {
    const abstained = membersWithoutVote(members, [voteBy('u1'), voteBy('u2')]);
    expect(abstained.map((m) => m.userId)).toEqual(['u3']);
  });

  it('pdf final tetap terbentuk saat ada nama duplikat', async () => {
    const buf = await generateDecisionPdf({ ...data, members, votes: [voteBy('u1')] });
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Regresi item review #5 — QR/footer mengarah ke jalur UNGGAHAN, bukan token.
 *
 * Jalur token hanya memeriksa byte arsip di server; PDF karangan yang
 * mempertahankan token asli akan dijawab "sah". Hanya jalur unggah yang
 * membandingkan hash berkas yang benar-benar dipegang pemindai dengan
 * `finalPdfDigest` yang ditandatangani e-seal.
 */
describe('decisionVerificationFooter', () => {
  it('mencetak URL unggah, bukan tautan bertoken', () => {
    const lines = decisionVerificationFooter({
      verificationUrl: 'https://cipansor.or.id/public/verify-decision',
      verificationToken: 'tok-123',
    });
    const joined = lines.join('\n');
    expect(joined).toContain('/public/verify-decision');
    expect(joined).not.toContain('token=');
    // Token hanya boleh muncul sebagai nomor rujukan, bukan sebagai URL.
    expect(lines[lines.length - 1]).toContain('Nomor rujukan');
  });

  it('tetap menghasilkan baris walau URL tidak tersedia', () => {
    const lines = decisionVerificationFooter({ verificationUrl: null });
    expect(lines.join(' ')).toContain('unggah');
  });
});


/**
 * Regresi audit #6 — token tanpa spasi harus DIPECAH, bukan dibiarkan meluber.
 *
 * `widthOfTextAtSize` untuk token verifikasi `base64url`, digest SHA-256, atau
 * URL tanpa spasi melebihi lebar kolom; `drawText` menggambar baris apa adanya
 * tanpa membungkus, sehingga teksnya keluar halaman dan terpotong pada cetakan
 * atau pindaian. Sifat yang dikunci di sini — "setiap baris muat" — tidak dapat
 * diperiksa dari byte PDF (pdf-lib tidak menyediakan pembacaan teks), jadi
 * `wrap` diuji langsung dengan font NYATA dari pdf-lib, bukan stub.
 */
describe('wrap — pemecahan token panjang', () => {
  async function realFont() {
    const doc = await PDFDocument.create();
    return doc.embedFont(StandardFonts.Helvetica);
  }

  const maxWidth = 300;
  const size = 10;

  function expectAllLinesFit(font: Awaited<ReturnType<typeof realFont>>, text: string) {
    const lines = wrap(font, size, text, maxWidth);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(maxWidth);
    }
    return lines;
  }

  it('memecah URL panjang tanpa spasi', async () => {
    const font = await realFont();
    expectAllLinesFit(
      font,
      'https://cipansor.or.id/public/verify-decision?document=risalah-keputusan-organ-yayasan-2026'
    );
  });

  it('memecah verification token base64url', async () => {
    const font = await realFont();
    const token = 'tok_' + 'aB3x'.repeat(40);
    const lines = expectAllLinesFit(font, token);
    expect(lines.length).toBeGreaterThan(1);
    // Tidak ada karakter yang hilang oleh pemecahan.
    expect(lines.join('')).toBe(token);
  });

  it('memecah digest SHA-256 heksadesimal', async () => {
    const font = await realFont();
    const digest = 'ab12'.repeat(16);
    expectAllLinesFit(font, digest);
  });

  it('kata tanpa spasi yang sangat panjang tetap muat', async () => {
    const font = await realFont();
    expectAllLinesFit(font, 'A'.repeat(400));
  });

  it('teks biasa tetap dibungkus per kata', async () => {
    const font = await realFont();
    const lines = wrap(font, size, 'Rencana kerja tahunan disetujui seluruh anggota', 120);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line).not.toMatch(/^\s|\s$/);
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it('tidak membelah pasangan pengganti (surrogate pair) di tengah karakter', async () => {
    // Font dengan pengukuran deterministik berbasis panjang teks. `wrap` tidak
    // sedang diuji melalui font ini — yang diuji adalah PEMECAHAN-nya tetap
    // utuh di batas grapheme. Font standar pdf-lib tidak dapat mengukur emoji
    // (WinAnsi), sedangkan font Unicode tidak menjamin memiliki glif emoji.
    const font = {
      widthOfTextAtSize: (t: string, s: number) => t.length * s,
    } as unknown as Parameters<typeof wrap>[0];
    const lines = wrap(font, size, '😀'.repeat(40), maxWidth);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      // Tidak ada lone surrogate di ujung mana pun.
      expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(line).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
  });
});
