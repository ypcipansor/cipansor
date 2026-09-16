import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
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
  name: string;
  roleCode: string;
  choice: string;
  signedAt?: Date | null;
  signatureShort: string;
  note?: string | null;
}

export interface DecisionPdfMemberRow {
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
  /** URL halaman verifikasi publik yang dimuat QR; null = token saja. */
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

function wrap(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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
  const votedIds = new Set(data.votes.map((v) => v.name));
  const abstained = data.members.filter((m) => !votedIds.has(m.name));
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
  if (data.verificationToken) {
    paragraph(`Token verifikasi: ${data.verificationToken}`, 9, 2);
    if (data.verificationUrl) {
      paragraph(`Periksa di: ${data.verificationUrl}`, 9, 2);
    } else {
      paragraph(`Periksa di: portal — verifikasi keputusan yayasan.`, 9, 2);
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
