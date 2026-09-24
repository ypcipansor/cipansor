import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import jsQR from 'jsqr';
import { PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { createHash } from 'crypto';

import {
  generateDecisionPdf,
  membersWithoutVote,
  decisionVerificationFooter,
  verificationQrPayload,
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
    { userId: 'u0', name: 'Anggota 0', roleCode: 'YAYASAN_PEMBINA' },
    { userId: 'u1', name: 'Anggota 1', roleCode: 'YAYASAN_PEMBINA' },
    { userId: 'u2', name: 'Anggota 2', roleCode: 'YAYASAN_PEMBINA' },
  ],
  votes: [
    {
      userId: 'u0',
      name: 'Anggota 0',
      roleCode: 'YAYASAN_PEMBINA',
      choice: 'APPROVE',
      signedAt: new Date(),
      signatureShort: 'AAAA1111…',
      note: null,
    },
    {
      userId: 'u1',
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
   * Determinisme HARUS mencakup halaman QR: `finalPdfDigest` dihitung dari byte
   * PDF final dan ditandatangani e-seal, jadi byte yang sama harus dihasilkan
   * dari data yang sama — termasuk saat QR ikut dirender. QR tanpa
   * `setCreationDate` bersama akan membuat dua render berbeda dan verifikasi
   * unggahan gagal untuk dokumen yang sah.
   */
  it('konsisten (deterministik) juga saat halaman QR dirender', async () => {
    const withQr = { ...data, verificationUrl: 'https://cipansor.or.id/public/verify-decision' };
    const a = await generateDecisionPdf(withQr);
    const b = await generateDecisionPdf(withQr);
    expect(a.equals(b)).toBe(true);
  });

  /**
   * Regresi finding #2 — memuat font Unicode TIDAK cukup: aksara tanpa glyph
   * (emoji) hilang DIAM-DIAM dari PDF yang disegel, padahal digest kanonis yang
   * ditandatangani anggota tetap memuatnya. Jalur ini harus MELEMPAR, bukan
   * menghasilkan arsip yang berbeda dari naskah yang disetujui.
   *
   * Sebelum perbaikan, `generateDecisionPdf` TIDAK melempar untuk input ini
   * (pdf-lib melewati codepoint tanpa glyph tanpa galat) sehingga tes gagal;
   * sesudah perbaikan ia melempar. Teks Arab/Latin yang DIDUKUNG Amiri tetap
   * lulus — perbaikan tidak boleh menolak aksara yang benar-benar dapat dicetak.
   */
  it('MELEMPAR ketika PERIHAL memuat emoji tanpa glyph di font risalah (regresi #2)', async () => {
    await expect(generateDecisionPdf({ ...data, subject: 'Rapat 🎉 Pembina' })).rejects.toThrow(
      /tidak memiliki glyph|glyph/i
    );
  });

  it('MELEMPAR ketika body memuat emoji tanpa glyph di font risalah (regresi #2)', async () => {
    await expect(
      generateDecisionPdf({
        ...data,
        body: 'Keputusan ini ditulis dengan emoji ✅ sebagai penanda.',
      })
    ).rejects.toThrow(/tidak memiliki glyph|glyph/i);
  });

  it('MELEMPAR ketika nama anggota memuat emoji (regresi #2)', async () => {
    await expect(
      generateDecisionPdf({
        ...data,
        members: [{ userId: 'u0', name: 'Anggota 🎉', roleCode: 'YAYASAN_PEMBINA' }],
      })
    ).rejects.toThrow(/tidak memiliki glyph|glyph/i);
  });

  /** Naskah Arab yang DIDUKUNG Amiri tetap tercetak tanpa kehilangan karakter. */
  it('tetap menghasilkan PDF untuk teks Arab yang didukung Amiri (font Unicode)', async () => {
    const buf = await generateDecisionPdf({
      ...data,
      body: 'Keputusan ini ditulis dengan kaligrafi Arab بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم agar tetap aman.',
    });
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('tetap menghasilkan PDF untuk teks Latin beraksen yang didukung Amiri', async () => {
    const buf = await generateDecisionPdf({
      ...data,
      subject: 'Pengesahan Rencana Kerja — café résumé',
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

  /**
   * Regresi BUG — line break naskah hilang di PDF tersegel.
   *
   * `wrap` lama memecah dengan `/\s+/` lalu menyambung ulang dengan spasi,
   * sehingga newline dan baris kosong pemisah paragraf hilang di arsip PDF
   * final — struktur yang ditulis penandatangan tidak sampai ke dokumen yang
   * di-e-seal. Fungsi murni ini yang diuji: `/n` tidak dapat dibaca kembali
   * dari byte PDF (pdf-lib tidak menyediakan pembacaan teks), jadi sifat
   * "struktur dipertahankan" harus dikunci di sini.
   */
  it('mempertahankan hard line break sebagai baris terpisah', async () => {
    const font = await realFont();
    const lines = wrap(font, size, 'Baris pertama\nBaris kedua\nBaris ketiga', maxWidth);
    expect(lines).toEqual(['Baris pertama', 'Baris kedua', 'Baris ketiga']);
  });

  it('mempertahankan baris kosong sebagai pemisah paragraf', async () => {
    const font = await realFont();
    const lines = wrap(font, size, 'Paragraf satu.\n\nParagraf dua.', maxWidth);
    expect(lines).toContain('');
    // Dua paragraf tetap terpisah oleh elemen kosong, bukan disatukan.
    const gap = lines.indexOf('');
    expect(gap).toBeGreaterThan(0);
    expect(lines[gap - 1]).toBe('Paragraf satu.');
    expect(lines[gap + 1]).toBe('Paragraf dua.');
  });

  it('mempertahankan penanda daftar di awal barisnya', async () => {
    const font = await realFont();
    const lines = wrap(font, size, '- Butir pertama\n- Butir kedua\n1. Butir ketiga', maxWidth);
    expect(lines[0]).toBe('- Butir pertama');
    expect(lines[1]).toBe('- Butir kedua');
    expect(lines[2]).toBe('1. Butir ketiga');
  });

  it('CRLF dianggap satu line break', async () => {
    const font = await realFont();
    const lines = wrap(font, size, 'Satu\r\nDua', maxWidth);
    expect(lines).toEqual(['Satu', 'Dua']);
  });

  it('hard break yang barisnya panjang tetap dibungkus visual per baris', async () => {
    const font = await realFont();
    const long =
      'ini baris pertama yang sengaja dibuat panjang sekali agar terbelah beberapa baris visual\npendek';
    const lines = wrap(font, size, long, 120);
    // Baris logis pertama terbelah, tetapi baris logis kedua tetap terpisah.
    expect(lines[lines.length - 1]).toBe('pendek');
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(120);
    }
  });

  it('tidak menyisipkan baris kosong di awal atau akhir naskah', async () => {
    const font = await realFont();
    expect(wrap(font, size, '\n\nA\n\n', maxWidth)).toEqual(['A']);
  });
});

describe('QR verifikasi di dalam PDF', () => {
  /** Resolusi XObject /Image pada sebuah halaman, sebagai raster RGBA. */
  async function pageQrRaster(pdf: Buffer, pageIndex: number) {
    const doc = await PDFDocument.load(pdf);
    const resources = doc.getPages()[pageIndex].node.Resources();
    if (!resources) return null;
    const xobj = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobj) return null;
    for (const key of xobj.keys()) {
      const resolved = doc.context.lookup(xobj.get(key));
      if (!(resolved instanceof PDFRawStream)) continue;
      if (resolved.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
      const dict = resolved.dict;
      const width = Number(dict.lookup(PDFName.of('Width'))?.toString());
      const height = Number(dict.lookup(PDFName.of('Height'))?.toString());
      const space = dict.lookup(PDFName.of('ColorSpace'))?.toString();
      const bpc = Number(dict.lookup(PDFName.of('BitsPerComponent'))?.toString());
      const data = decodePDFRawStream(resolved).decode();
      if (space !== '/DeviceRGB' || bpc !== 8 || !width || !height) continue;
      const rgba = Buffer.alloc(width * height * 4, 255);
      for (let i = 0, p = 0; i < width * height; i += 1, p += 3) {
        rgba[i * 4] = data[p];
        rgba[i * 4 + 1] = data[p + 1];
        rgba[i * 4 + 2] = data[p + 2];
      }
      return { rgba, width, height };
    }
    return null;
  }

  it('meng-embed QR yang dapat dipindai dan mengarah ke halaman unggah tanpa token', async () => {
    const buf = await generateDecisionPdf({
      ...data,
      verificationUrl: 'https://cipansor.or.id/public/verify-decision',
    });
    // Halaman QR adalah halaman terakhir.
    const doc = await PDFDocument.load(buf);
    const raster = await pageQrRaster(buf, doc.getPageCount() - 1);
    if (!raster) throw new Error('PDF tidak memuat raster QR pada halaman terakhir');
    const decoded = jsQR(
      new Uint8ClampedArray(raster.rgba.buffer, raster.rgba.byteOffset, raster.rgba.byteLength),
      raster.width,
      raster.height
    );
    if (!decoded) throw new Error('QR pada PDF tidak dapat didekode');
    expect(decoded.data).toBe('https://cipansor.or.id/public/verify-decision');
    expect(decoded.data).toContain('/public/verify-decision');
    expect(decoded.data).not.toContain('token=');
  });

  it('QR tidak pernah membawa token walau URL diberi query/hash', () => {
    expect(
      verificationQrPayload('https://cipansor.or.id/public/verify-decision?token=rahasia#x')
    ).toBe('https://cipansor.or.id/public/verify-decision');
  });

  it('tanpa verificationUrl tidak ada halaman QR (satu halaman, tanpa image)', async () => {
    const buf = await generateDecisionPdf({ ...data, verificationUrl: null });
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(await pageQrRaster(buf, 0)).toBeNull();
  });

  it('QR TIDAK membawa token: hanya token berbeda, byte QR identik', async () => {
    // Bila token ikut tersandikan, dua PDF dengan token berbeda akan menghasilkan
    // raster QR yang berbeda. Yang dibandingkan di sini adalah raster QR-nya
    // sendiri, bukan seluruh PDF (footer tetap mencetak nomor rujukan).
    const qrBytesFor = async (verificationToken: string) => {
      const buf = await generateDecisionPdf({
        ...data,
        verificationToken,
        verificationUrl: 'https://cipansor.or.id/public/verify-decision',
      });
      const doc = await PDFDocument.load(buf);
      const raster = await pageQrRaster(buf, doc.getPageCount() - 1);
      if (!raster) throw new Error('PDF tidak memuat raster QR pada halaman terakhir');
      return createHash('sha256').update(raster.rgba).digest('hex');
    };
    expect(await qrBytesFor('token-pertama')).toBe(await qrBytesFor('token-kedua'));
  });
});
