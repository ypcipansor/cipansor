import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

/**
 * Pembuat PDF risalah/keputusan organ yayasan — fungsi MURNI tanpa Prisma.
 *
 * Menerima data keputusan + daftar suara + daftar anggota + token verifikasi,
 * mengembalikan Buffer PDF. Berkas final TIDAK dibubuhi tanda tangan oleh
 * generator ini — tanda tangan e-seal ditambahkan pada hash byte final di
 * service (lihat foundation-decisions.service.ts), karena menanam tanda tangan
 * CMS ke dalam PDF membuat byte-range signature (PAdES B-B) dan rawan rusak
 * bila PDF berubah setelahnya.
 *
 * **Aksara di luar WinAnsi wajib selamat.** Font standar pdf-lib (Helvetica)
 * hanya dapat mengkodekan WinAnsi, dan `drawText` MELEMPAR untuk Arab atau
 * emoji. Dulu itu bukan sekadar tampilan jelek: render terjadi di dalam
 * transaksi suara yang mencapai kuorum, sehingga lemparan itu me-rollback
 * suara yang sah dan meninggalkan keputusan terbuka selamanya — satu emoji di
 * dalam naskah cukup untuk membuat keputusan tak pernah dapat disahkan. Karena
 * itu font Unicode TTF (`assets/fonts/Amiri-Regular.ttf`, sama seperti raport)
 * disematkan lewat fontkit; bila asetnya tidak ada, teks disanitasi ke WinAnsi
 * sebagai ganti gagal — mencetak sebagian isi jauh lebih baik daripada tidak
 * mencetak keputusan sama sekali. Tanpa shaping/RTL (bukan tugas util ini),
 * Arab akan tampil dalam bentuk huruf terpisah.
 */

export interface DecisionPdfVoteRow {
  /** Identitas unik pemilih — dipakai untuk mencocokkan dengan daftar anggota. */
  userId: string;
  name: string;
  roleCode: string;
  choice: string;
  signedAt?: Date | null;
  signatureShort: string;
  note?: string | null;
}

export interface DecisionPdfMemberRow {
  /** Identitas unik anggota — dicocokkan dengan suara berdasarkan ini, BUKAN nama. */
  userId: string;
  name: string;
  roleCode: string;
}

export interface DecisionPdfData {
  shortId: string;
  subject: string;
  decisionType: string;
  organType: string;
  kind: string;
  status: string;
  createdAt: Date;
  decidedAt?: Date | null;
  body: string;
  members: DecisionPdfMemberRow[];
  votes: DecisionPdfVoteRow[];
  voteSummary: {
    present: number;
    active: number;
    approve: number;
    reject: number;
    abstain: number;
  };
  verificationToken?: string | null;
  /**
   * URL halaman verifikasi publik yang dimuat QR — WAJIB tanpa token.
   *
   * Yang disandikan di sini adalah tempat pembaca menyerahkan berkasnya,
   * bukan sebuah token: tautan bertoken hanya dapat menjawab "ada keputusan
   * yang pernah disahkan", tidak "berkas yang Anda pegang inilah berkas itu".
   */
  verificationUrl?: string | null;
}

const margin = 48;
const pageW = 595; // A4 point width
const contentW = pageW - margin * 2;

/** Batas aksara yang dapat dikodekan font standar (WinAnsi + tambahannya). */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ' + '‘’“”•–—˜™š›œžŸ');

function isWinAnsiEncodable(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  if (code === 0x0a || code === 0x0d || code === 0x09) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRA.has(ch);
}

/**
 * Ganti aksara yang tak dapat dikodekan font standar. HANYA dipakai ketika
 * font Unicode tidak dapat dimuat — selalu ada jaring pengaman, karena
 * `drawText` yang melempar di tengah transaksi kuorum membatalkan suara sah.
 */
function sanitizeForFallbackFont(text: string): string {
  return [...text].map((ch) => (isWinAnsiEncodable(ch) ? ch : '?')).join('');
}

/** Byte TTF font Unicode, dibaca sekali. Instance PDFFont terikat ke satu
 * dokumen, jadi hanya BYTE-nya yang di-cache (pola generate-raport-merdeka-pdf). */
let unicodeFontBytes: Buffer | null = null;

const FONT_CANDIDATE_PATHS = [
  path.resolve(__dirname, '../assets/fonts/Amiri-Regular.ttf'),
  path.resolve(process.cwd(), 'src/assets/fonts/Amiri-Regular.ttf'),
  path.resolve(process.cwd(), 'apps/api/src/assets/fonts/Amiri-Regular.ttf'),
];

async function embedUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont | null> {
  if (!(pdfDoc as unknown as { fontkit?: unknown }).fontkit) {
    pdfDoc.registerFontkit(fontkit);
  }
  if (!unicodeFontBytes) {
    for (const candidate of FONT_CANDIDATE_PATHS) {
      try {
        if (fs.existsSync(candidate)) {
          unicodeFontBytes = fs.readFileSync(candidate);
          break;
        }
      } catch {
        // Coba kandidat berikutnya.
      }
    }
  }
  if (!unicodeFontBytes) return null;
  // `subset: true` membuat byte PDF tetap deterministik dan kecil: hanya glyph
  // yang benar-benar dipakai yang disematkan, dalam urutan yang sama setiap
  // kali, sehingga digest arsip dapat direproduksi (uji determinisme).
  return pdfDoc.embedFont(new Uint8Array(unicodeFontBytes), { subset: true });
}

/**
 * Anggota yang belum memberi suara.
 *
 * Dibandingkan lewat IDENTITAS UNIK (userId), bukan nama. Dulu pemanggil
 * membangun himpunan "sudah memilih" dari `name`, sehingga dua anggota bernama
 * sama dianggap keduanya sudah bersuara begitu salah satu memilih — dan PDF
 * final yang disegel permanen menghilangkan anggota yang belum bersuara dari
 * daftar ini. Nama boleh sama; orangnya tidak.
 */
export function membersWithoutVote(
  members: DecisionPdfMemberRow[],
  votes: DecisionPdfVoteRow[]
): DecisionPdfMemberRow[] {
  const votedIds = new Set(votes.map((v) => v.userId));
  return members.filter((m) => !votedIds.has(m.userId));
}

/**
 * Pecah teks menjadi baris yang lebarnya tidak melebihi `maxWidth`.
 *
 * Satu kata yang lebih lebar dari `maxWidth` TIDAK boleh dibiarkan utuh:
 * `widthOfTextAtSize` untuk kata sepanjang itu melebihi lebar halaman, dan
 * pdf-lib menggambar baris apa adanya tanpa membungkusnya — teksnya meluber
 * keluar halaman dan terpotong saat dipindai/dicetak. Ini bukan kasus teoretis:
 * token verifikasi `base64url`, digest SHA-256 heksadesimal, dan URL pendek
 * ke `publicSiteUrl` semuanya berupa satu token tanpa spasi, dan risalah ini
 * yang di-e-seal.
 *
 * Pemecahan dilakukan per grapheme cluster (bukan per byte/UTF-16 code unit),
 * sehingga pasangan pengganti dan aksara beraksen tidak terbelah di tengah
 * karakter — pecahan yang salah dapat menghasilkan glif rusak. `Intl.Segmenter`
 * dipakai bila tersedia; bila tidak (mis. lingkungan lama), fallback ke iterasi
 * code point yang tetap aman untuk surrogate pair.
 *
 * Diekspor agar dapat diuji langsung: yang perlu dikunci adalah "setiap baris
 * muat", dan sifat itu tidak dapat diperiksa dari byte PDF (pdf-lib tidak
 * menyediakan pembacaan teks).
 */
export function wrap(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      cur = trial;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = '';
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      cur = word;
      continue;
    }
    // Kata itu sendiri lebih lebar dari satu baris: pecah per grapheme.
    let chunk = '';
    for (const cluster of graphemeClusters(word)) {
      const next = chunk + cluster;
      // `chunk` kosong berarti satu cluster pun sudah melebihi lebar baris;
      // tetap dimasukkan agar pemecahan tidak berputar tanpa henti.
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(chunk);
        chunk = cluster;
      } else {
        chunk = next;
      }
    }
    cur = chunk;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Grapheme cluster dari sebuah kata, dengan fallback code point. */
function graphemeClusters(word: string): string[] {
  const Segmenter = (
    Intl as unknown as { Segmenter?: new (locale?: string, opts?: object) => { segment(s: string): Iterable<{ segment: string }> } }
  ).Segmenter;
  if (Segmenter) {
    return [...new Segmenter('id', { granularity: 'grapheme' }).segment(word)].map(
      (s) => s.segment
    );
  }
  return Array.from(word);
}

/**
 * Baris footer "PEMERIKSAAN KEABSAHAN" apa adanya.
 *
 * Diekspor agar dapat diuji tanpa mengekstrak teks dari PDF (pdf-lib tidak
 * menyediakan pembacaan teks, dan font Unicode mengodekan glif, bukan aksara).
 * Yang penting untuk dikunci di sini adalah KE MANA pembaca diarahkan: jalur
 * UNGGAHAN berkas, bukan tautan bertoken yang hanya memeriksa arsip server —
 * pemalsu yang mempertahankan token asli akan lolos lewat jalur token.
 */
export function decisionVerificationFooter(data: {
  verificationUrl?: string | null;
  verificationToken?: string | null;
}): string[] {
  const lines: string[] = [];
  if (data.verificationUrl) {
    lines.push(`Unggah & periksa berkasnya di: ${data.verificationUrl}`);
    lines.push(
      `Halaman itu membandingkan hash berkas PDF yang Anda pegang dengan arsip ber-e-seal.`
    );
  } else {
    lines.push(`Periksa di: portal — unggah berkas PDF untuk verifikasi keputusan yayasan.`);
  }
  if (data.verificationToken) {
    lines.push(`Nomor rujukan (bukan tautan verifikasi): ${data.verificationToken}`);
  }
  return lines;
}

/**
 * Isi QR pada risalah: alamat halaman verifikasi TANPA token.
 *
 * Dua hal yang dijaga di sini. Pertama, token tidak pernah masuk ke dalam QR:
 * tautan bertoken hanya membuka jalur verifikasi token, yang memeriksa byte
 * arsip di server — bukan berkas yang dipegang pemindai — sehingga pemalsu yang
 * mempertahankan token asli tetap dijawab "sah". Yang boleh disandikan adalah
 * tempat pembaca menyerahkan berkasnya. Kedua, pembersihan ini TIDAK melempar:
 * render berjalan di dalam transaksi suara yang mencapai kuorum, dan lemparan
 * di sana me-rollback suara yang sah (lihat catatan font di atas).
 */
export function verificationQrPayload(url: string): string {
  return url.split('#')[0].split('?')[0];
}

export async function generateDecisionPdf(data: DecisionPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));
  let page = pdfDoc.addPage([pageW, 842]); // A4 portrait
  const unicodeFont = await embedUnicodeFont(pdfDoc);
  const keepUnicode = unicodeFont !== null;
  const font =
    unicodeFont ?? (await pdfDoc.embedFont(StandardFonts.Helvetica));
  const bold =
    unicodeFont ?? (await pdfDoc.embedFont(StandardFonts.HelveticaBold));

  // Setiap teks yang akan digambar/disusun melewati ini. Ketika font Unicode
  // tidak dapat dimuat, aksara asing diganti supaya `drawText` tidak melempar;
  // ketika tersedia, teksnya dibiarkan apa adanya agar Arab/emoji ikut tercetak.
  const safe = (txt: string): string =>
    keepUnicode ? txt : sanitizeForFallbackFont(txt);

  let y = 800;
  const lineHeight = 14;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageW, 842]);
      y = 800;
    }
  };
  const text = (
    txt: string,
    opts: { size?: number; bold?: boolean; gap?: number; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const { size = 11, bold: isBold = false, gap = 4, color = rgb(0, 0, 0) } = opts;
    ensureSpace(lineHeight);
    page.drawText(safe(txt), { x: margin, y, size, font: isBold ? bold : font, color });
    y -= size + gap;
  };
  const paragraph = (txt: string, size = 11, gap = 6) => {
    for (const line of wrap(font, size, safe(txt), contentW)) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: margin, y, size, font, color: rgb(0.05, 0.05, 0.05) });
      y -= size + 3;
    }
    y -= gap;
  };

  // Header
  text('YAYASAN PESANTREN CIPANSOR', { size: 15, bold: true, gap: 2 });
  text('Jalan Pesantren Cipansor — Garut, Jawa Barat', { size: 9, gap: 10 });
  page.drawLine({
    start: { x: margin, y: y + 4 },
    end: { x: pageW - margin, y: y + 4 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;

  const title =
    data.kind === 'CIRCULAR' ? 'KEPUTUSAN SIRKULER ORGAN YAYASAN' : 'RISALAH RAPAT ORGAN YAYASAN';
  text(title, { size: 13, bold: true, gap: 10 });

  paragraph(`Nomor: ${data.shortId}`, 11, 2);
  paragraph(`Perihal: ${data.subject}`, 11, 2);
  paragraph(`Jenis Keputusan: ${data.decisionType}`, 11, 2);
  paragraph(`Organ: ${data.organType}  •  Cara: ${data.kind}  •  Status: ${data.status}`, 11, 2);
  paragraph(
    `Dibuat: ${data.createdAt.toISOString()}${data.decidedAt ? `  •  Diputus: ${data.decidedAt.toISOString()}` : ''}`,
    11,
    10
  );

  text('ISI KEPUTUSAN / NOTULEN', { size: 12, bold: true, gap: 6 });
  paragraph(data.body, 11, 12);

  text('REKAPITULASI SUARA', { size: 12, bold: true, gap: 6 });
  const vs = data.voteSummary;
  paragraph(
    `Hadir memberi suara: ${vs.present} dari ${vs.active} anggota aktif  •  Setuju: ${vs.approve}  •  Tidak setuju: ${vs.reject}  •  Abstain: ${vs.abstain}`,
    11,
    12
  );

  text('RINCIAN TANDA TANGAN (SUARA)', { size: 12, bold: true, gap: 6 });
  for (const v of data.votes) {
    ensureSpace(lineHeight * 3);
    const sigLine = v.signatureShort ? `Tanda tangan: ${v.signatureShort}` : '';
    paragraph(
      `— ${v.name} (${v.roleCode}): ${v.choice}${v.signedAt ? `, ${v.signedAt.toISOString()}` : ''}${v.note ? `. Catatan: ${v.note}` : ''}${sigLine ? `. ${sigLine}` : ''}`,
      10,
      6
    );
  }

  // Belum memilih (anggota yang tidak hadir/diam pada rapat)
  const abstained = membersWithoutVote(data.members, data.votes);
  if (abstained.length > 0) {
    text('ANGGOTA YANG BELUM MEMBERI SUARA', { size: 12, bold: true, gap: 6 });
    paragraph(abstained.map((m) => `${m.name} (${m.roleCode})`).join('; '), 10, 10);
  }

  // Footer verifikasi
  ensureSpace(lineHeight * 4);
  page.drawLine({
    start: { x: margin, y: y + 2 },
    end: { x: pageW - margin, y: y + 2 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  text('PEMERIKSAAN KEABSAHAN', { size: 12, bold: true, gap: 4 });
  paragraph(`Dokumen Sah: e-seal Yayasan + tanda tangan digital anggota.`, 9, 2);
  paragraph(`Cetak copy tidak dikontrol; verifikasi daring bila ada token.`, 9, 10);
  /**
   * Footer mengarahkan pembaca ke jalur UNGGAHAN, bukan jalur token.
   *
   * Jalur token hanya memeriksa byte arsip di server, sehingga PDF karangan
   * yang mempertahankan token asli tetap dijawab "sah". Hanya dengan
   * mengunggah berkas yang benar-benar dipegang pemindai, hash byte-nya dapat
   * dibandingkan dengan `finalPdfDigest` yang ditandatangani e-seal. Karena itu
   * yang dicetak adalah halaman unggah, dan token disebut sebagai nomor
   * rujukan — bukan lagi sebagai tautan yang memberi jawaban instan.
   */
  const footerLines = decisionVerificationFooter(data);
  footerLines.forEach((line, i) => {
    paragraph(line, 9, i === footerLines.length - 1 ? 6 : 2);
  });

  /**
   * Halaman pengesahan dengan QR yang BENAR-BENAR dapat dipindai.
   *
   * Sebelum ini halaman itu hanya mencetak URL sebagai teks, sementara
   * deskripsi PR dan komentar menyebut "pemindaian QR" - klaim yang tidak
   * sesuai dengan artefaknya. Karena risalah memang benda cetak yang berpindah
   * tangan, QR-nya nyata: halaman terpisah supaya tetap lapang dan tidak
   * bergantung pada posisi teks yang sudah mengalir, dan isinya alamat halaman
   * UNGGAH tanpa token (lihat `verificationQrPayload`) - memindai lalu
   * mengunggah berkas adalah satu-satunya jalur yang membuktikan berkas yang
   * dipegang pembaca. Koreksi galat H dipakai agar lambang yayasan boleh
   * menutupi tengahnya tanpa membuat kode gagal dibaca.
   */
  const qrPayload = data.verificationUrl
    ? verificationQrPayload(data.verificationUrl)
    : null;
  if (qrPayload) {
    const qrPage = pdfDoc.addPage([pageW, 842]);
    const qrSize = 150;
    const qrX = margin + 8;
    const qrY = 842 - margin - 60 - qrSize;

    qrPage.drawText(safe('PENGESAHAN & VERIFIKASI BERKAS'), {
      x: margin,
      y: 842 - margin - 18,
      size: 13,
      font: bold,
      color: rgb(0, 0, 0),
    });
    qrPage.drawLine({
      start: { x: margin, y: 842 - margin - 30 },
      end: { x: pageW - margin, y: 842 - margin - 30 },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.2),
    });
    qrPage.drawText(safe('Pindai untuk memeriksa keabsahan berkas ini'), {
      x: qrX,
      y: qrY + qrSize + 14,
      size: 10,
      font: bold,
      color: rgb(0, 0, 0),
    });
    const qrImage = await pdfDoc.embedPng(
      await QRCode.toBuffer(qrPayload, {
        type: 'png',
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'H',
      })
    );
    qrPage.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    const infoX = qrX + qrSize + 24;
    const infoW = pageW - margin - infoX;
    let infoY = qrY + qrSize;
    for (const line of wrap(font, 9, safe(qrPayload), infoW)) {
      qrPage.drawText(line, { x: infoX, y: infoY, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
      infoY -= 12;
    }
    infoY -= 6;
    const hint =
      'Halaman itu membandingkan hash berkas PDF yang Anda pegang dengan arsip ber-e-seal. Pindai lalu unggah berkasnya.';
    for (const line of wrap(font, 9, safe(hint), infoW)) {
      qrPage.drawText(line, { x: infoX, y: infoY, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      infoY -= 12;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
