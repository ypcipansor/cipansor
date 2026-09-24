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

/**
 * Field teks bebas yang harus selamat cetak apa adanya.
 *
 * Dipakai untuk MENOLAK render ketika font Unicode absen dan ada aksara di
 * luar WinAnsi: menyensor diam-diam menjadi "?" berarti dokumen resmi
 * kehilangan karakter (nama, perihal, naskah) lalu tetap disegel e-seal —
 * arsip permanen yang isinya salah. Lebih baik gagal terang-terangan di
 * persiapan artefak (di luar kunci keputusan, sehingga suara tidak ter-rollback
 * dan keputusan tetap dapat difinalisasi ulang setelah font dipulihkan).
 */
function decisionPdfTextFieldTargets(data: DecisionPdfData): Array<[string, string]> {
  return [
    ['subject', data.subject],
    ['decisionType', data.decisionType],
    ['body', data.body],
    ['organType', data.organType],
    ['kind', data.kind],
    ['status', data.status],
    ...data.members.map((m, i): [string, string] => [`members[${i}].name`, m.name]),
    ...data.votes.map((v, i): [string, string] => [`votes[${i}].name`, v.name]),
    ...data.votes
      .filter((v) => !!v.note)
      .map((v, i): [string, string] => [`votes[${i}].note`, v.note as string]),
    ...(data.verificationUrl
      ? [['verificationUrl', data.verificationUrl] as [string, string]]
      : []),
    ...(data.verificationToken
      ? [['verificationToken', data.verificationToken] as [string, string]]
      : []),
  ];
}

/**
 * Karakter yang mengatur TATA LETAK dan tidak pernah dicetak sebagai glyph.
 *
 * `wrap()` memecah teks pada `\r\n|\r|\n` dan `drawText` hanya menerima
 * baris hasil pecahan itu; tab dirender sebagai spasi oleh penyusun kata.
 * Artinya U+000A/0D/09 tidak pernah sampai ke `drawText`, sehingga
 * ketidakhadiran glyph-nya BUKAN kehilangan karakter — memeriksanya justru
 * menolak setiap notulen bernada baris baru.
 */
function isLayoutOnlyChar(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return code === 0x0a || code === 0x0d || code === 0x09;
}

/** Field yang memuat aksara di luar WinAnsi — hanya relevan pada jalur fallback. */
export function unencodableDecisionPdfFields(
  data: DecisionPdfData
): Array<{ field: string; chars: string[] }> {
  const offenders: Array<{ field: string; chars: string[] }> = [];
  for (const [field, value] of decisionPdfTextFieldTargets(data)) {
    const chars = [
      ...new Set([...value].filter((ch) => !isLayoutOnlyChar(ch) && !isWinAnsiEncodable(ch))),
    ];
    if (chars.length > 0) offenders.push({ field, chars });
  }
  return offenders;
}

/**
 * Field yang memuat aksara TANPA glyph di font Unicode yang disematkan.
 *
 * Memuat font Unicode (Amiri) tidak berarti SEMUA aksara dapat dicetak: font
 * itu tidak punya glyph emoji, mis. 🎉. `pdf-lib` hanya melewati codepoint tanpa
 * glyph tanpa melempar, sehingga karakter itu HILANG dari risalah yang disegel
 * e-seal — padahal digest kanonis yang ditandatangani anggota tetap memuatnya.
 * Arsip permanen yang berbeda dari naskah yang disetujui adalah arsip yang
 * salah secara hukum, jadi jalur ini MENOLAK render, bukan menyensor.
 *
 * Pemanggil (`prepareApprovalArtifact`) berjalan DI LUAR kunci keputusan,
 * sehingga penolakan tidak me-rollback suara yang sah.
 */
export function unglyphableDecisionPdfFields(
  data: DecisionPdfData,
  hasGlyph: (ch: string) => boolean
): Array<{ field: string; chars: string[] }> {
  const offenders: Array<{ field: string; chars: string[] }> = [];
  for (const [field, value] of decisionPdfTextFieldTargets(data)) {
    // Karakter tata letak (`\n`/`\r`/`\t`) dilewati: ia tidak pernah digambar
    // sebagai glyph, jadi ketiadaan glyph-nya bukan karakter yang hilang.
    const chars = [...new Set([...value].filter((ch) => !isLayoutOnlyChar(ch) && !hasGlyph(ch)))];
    if (chars.length > 0) offenders.push({ field, chars });
  }
  return offenders;
}

/**
 * Field yang akan KEHILANGAN karakter saat dirender, dihitung dengan jalur
 * yang SAMA dengan `generateDecisionPdf`.
 *
 * Dipakai di `FoundationDecisionService.create` SEBELUM voting dibuka, dan di
 * `cancel` untuk mengenali keputusan yang artefaknya gagal permanen.
 * Pemeriksaan saat approval saja sudah terlambat: suara penentu sudah tercatat,
 * naskah tidak dapat diedit, dan satu emoji di perihal/naskah membuat keputusan
 * tergantung `VOTING` selamanya. Menolak di pintu masuk mengembalikan 400 yang
 * menyebut field + aksara.
 *
 * Jalur mana yang dipakai harus mencerminkan `generateDecisionPdf`: bila font
 * Unicode tidak termuat, batasnya WinAnsi (`unencodable…`); bila termuat,
 * cakupan glyph font itulah yang menentukan (`unglyphable…`).
 */
export function decisionPdfGlyphOffenders(
  data: DecisionPdfData
): Array<{ field: string; chars: string[] }> {
  return unicodeFontPath() !== null
    ? unglyphableDecisionPdfFields(data, unicodeFontHasGlyph)
    : unencodableDecisionPdfFields(data);
}

/**
 * Apakah berkas font Unicode tersedia di salah satu kandidat jalur.
 *
 * Dipisah agar gerbang boot dapat memeriksanya TANPA merender PDF, dan agar
 * tidak bergantung pada cache `unicodeFontBytes` (yang terisi setelah render
 * pertama).
 */
export function unicodeFontPath(): string | null {
  for (const candidate of FONT_CANDIDATE_PATHS) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Coba kandidat berikutnya.
    }
  }
  return null;
}

/**
 * Refuse to start a PRODUCTION boot without the Unicode font asset.
 *
 * Bila asetnya hilang di produksi, setiap render yang memuat aksara di luar
 * WinAnsi gagal (lihat `generateDecisionPdf`) — artinya keputusan ber-Arab/emoji
 * tidak pernah dapat disahkan. Kegagalan itu lebih baik muncul saat boot
 * daripada saat rapat yayasan menutup keputusan. Non-produksi dibiarkan jalan
 * supaya pengembangan & tes tidak terhalang aset yang belum disalin.
 */
export function assertDecisionPdfFontAvailable(
  env: string | undefined = process.env.NODE_ENV
): void {
  if (env !== 'production') return;
  if (unicodeFontPath()) return;
  throw new Error(
    'Font Unicode untuk risalah keputusan tidak ditemukan di salah satu jalur: ' +
      FONT_CANDIDATE_PATHS.join(', ') +
      '. Tanpa font ini, keputusan yang memuat aksara di luar WinAnsi (Arab, emoji) tidak dapat dirender ' +
      'dan e-seal tidak boleh dibubuhkan. Salin assets/fonts/Amiri-Regular.ttf ke image produksi.'
  );
}

/** Byte TTF font Unicode, dibaca sekali. Instance PDFFont terikat ke satu
 * dokumen, jadi hanya BYTE-nya yang di-cache (pola generate-raport-merdeka-pdf). */
let unicodeFontBytes: Buffer | null = null;

/**
 * Fontkit Font yang sama dengan byte di atas, untuk memeriksa cakupan glyph
 * (fontkit `glyphForCodePoint`) TANPA merender PDF.
 */
let unicodeFontkitFont: { hasGlyphForCodePoint(cp: number): boolean } | null = null;

const FONT_CANDIDATE_PATHS = [
  path.resolve(__dirname, '../assets/fonts/Amiri-Regular.ttf'),
  path.resolve(process.cwd(), 'src/assets/fonts/Amiri-Regular.ttf'),
  path.resolve(process.cwd(), 'apps/api/src/assets/fonts/Amiri-Regular.ttf'),
];

function loadUnicodeFontBytes(): Buffer | null {
  if (unicodeFontBytes) return unicodeFontBytes;
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
  return unicodeFontBytes;
}

/**
 * Apakah font Unicode yang disematkan punya glyph untuk sebuah karakter.
 *
 * `true` bila font tidak termuat: jalur itu ditangani terpisah oleh
 * `unencodableDecisionPdfFields` (fallback WinAnsi), jadi pemeriksaan glyph di
 * sini tidak boleh ikut menolak aksara yang sebenarnya dapat disanitasi.
 */
export function unicodeFontHasGlyph(ch: string): boolean {
  const bytes = loadUnicodeFontBytes();
  if (!bytes) return true;
  if (!unicodeFontkitFont) {
    try {
      unicodeFontkitFont = fontkit.create(bytes) as unknown as {
        hasGlyphForCodePoint(cp: number): boolean;
      };
    } catch {
      // Fontkit gagal mengurai: perlakukan sebagai tanpa-cakupan? Tidak —
      // kembalikan true agar jalur fallback yang menanganinya, bukan lemparan
      // tak terduga di sini.
      return true;
    }
  }
  const cp = ch.codePointAt(0);
  if (cp === undefined) return true;
  try {
    return unicodeFontkitFont.hasGlyphForCodePoint(cp);
  } catch {
    return true;
  }
}

async function embedUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont | null> {
  if (!(pdfDoc as unknown as { fontkit?: unknown }).fontkit) {
    pdfDoc.registerFontkit(fontkit);
  }
  const bytes = loadUnicodeFontBytes();
  if (!bytes) return null;
  // `subset: true` membuat byte PDF tetap deterministik dan kecil: hanya glyph
  // yang benar-benar dipakai yang disematkan, dalam urutan yang sama setiap
  // kali, sehingga digest arsip dapat direproduksi (uji determinisme).
  return pdfDoc.embedFont(new Uint8Array(bytes), { subset: true });
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
 * **Struktur naskah dipertahankan.** Naskah keputusan/notulen adalah teks
 * berparagraf: hard line break, baris kosong pemisah paragraf, dan penanda
 * daftar (`-`, `•`, `1.`) adalah bagian dari maknanya. Versi sebelumnya
 * memecah dengan `/\s+/` dan menyambung ulang dengan spasi, sehingga seluruh
 * paragraf dan daftar runtuh menjadi satu blok — arsip permanen yang di-e-seal
 * kehilangan struktur yang ditulis penandatangannya. Di sini setiap baris
 * logis dibungkus SENDIRI; baris kosong menjadi elemen `''` (pemisah paragraf),
 * dan penanda daftar tetap di awal barisnya.
 *
 * **Spasi adalah bagian dari naskah.** Indentasi awal baris dan spasi beruntun
 * dalam baris dipertahankan: tokenisasi menyimpan run spasi sebagai token
 * tersendiri, bukan menyusutkannya menjadi satu spasi. Tab diperluas ke
 * `TAB_WIDTH` spasi tetap dengan aturan yang sama saat mengukur lebar, sehingga
 * tata letak kolom tidak berubah antara penulisan dan pencetakan.
 *
 * Pembungkusan VISUAL per baris tetap dilakukan, jadi teks panjang tak meluber.
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
 * muat" DAN "struktur tidak berubah", dan sifat itu tidak dapat diperiksa dari
 * byte PDF (pdf-lib tidak menyediakan pembacaan teks).
 */
/**
 * Lebar tab, dalam spasi, saat naskah disusun.
 *
 * Tab adalah karakter TATA LETAK yang tidak dicetak sebagai glyph, tetapi ia
 * memisahkan kolom: `- Nama<TAB>Jabatan` adalah tabel dua kolom di mata
 * penulisnya. Menyusutkannya menjadi satu spasi (atau membuangnya) mengubah
 * tata letak yang disetujui penandatangan. Nilai tetap membuat lebar dapat
 * diprediksi dan PDF tetap deterministik.
 */
const TAB_WIDTH = 4;

/** Ganti setiap tab dengan sejumlah spasi tetap. */
function expandTabs(text: string): string {
  return text.replace(/\t/g, ' '.repeat(TAB_WIDTH));
}

export function wrap(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const logicalRaw of text.split(/\r\n|\r|\n/)) {
    const logical = expandTabs(logicalRaw);
    // Baris kosong: pemisah paragraf/daftar. Pertahankan sebagai elemen
    // kosong, bukan dibuang — membuangnya menyatukan dua paragraf. Baris
    // kosong beruntun runtuh jadi satu, dan yang di ujung dibuang nanti.
    if (logical.trim().length === 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    // TOKENISASI mempertahankan run spasi sebagai token tersendiri, bukan
    // menyusutkannya dengan `/\s+/` lalu menyambung ulang dengan satu spasi.
    // Versi lama membuang indentasi awal baris ("    - item" menjadi "- item")
    // dan spasi beruntun dalam baris ("a  b" menjadi "a b"), sehingga arsip
    // yang di-e-seal tidak sama dengan naskah yang ditandatangani. Spasi
    // adalah bagian dari naskah.
    const tokens = logical.match(/ +|[^ ]+/g) ?? [];
    let cur = '';
    // Spasi di ujung baris tidak digambar dan tidak dipindah ke baris
    // berikutnya (itu menambah indentasi yang tidak ditulis penandatangan);
    // ia dibuang HANYA di titik pembungkusan, bukan dari naskah itu sendiri.
    const flush = () => {
      const line = cur.replace(/ +$/, '');
      if (line) lines.push(line);
      cur = '';
    };
    for (const token of tokens) {
      const trial = cur + token;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        cur = trial;
        continue;
      }
      // Token spasi yang tidak muat: jadikan akhir baris, lalu lanjut.
      if (token[0] === ' ') {
        flush();
        continue;
      }
      if (cur) flush();
      if (font.widthOfTextAtSize(token, size) <= maxWidth) {
        cur = token;
        continue;
      }
      // Token itu sendiri lebih lebar dari satu baris: pecah per grapheme.
      let chunk = '';
      for (const cluster of graphemeClusters(token)) {
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
    flush();
  }
  // Baris kosong yang tersisa di ujung adalah sisa line break akhir naskah,
  // bukan pemisah paragraf — jangan menggambar jarak kosong di ujung halaman.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Grapheme cluster dari sebuah kata, dengan fallback code point. */
function graphemeClusters(word: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        opts?: object
      ) => { segment(s: string): Iterable<{ segment: string }> };
    }
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
  // Font Unicode absen + ada aksara di luar WinAnsi: JANGAN sensor jadi "?".
  // Dokumen resmi yang kehilangan karakter lalu disegel e-seal adalah arsip
  // permanen yang salah. Lempar di sini — persiapan artefak berjalan DI LUAR
  // kunci keputusan (`prepareApprovalArtifact`), jadi suara anggota tidak
  // ter-rollback dan keputusan tetap dapat difinalisasi ulang setelah font
  // dipulihkan.
  if (!keepUnicode) {
    const offenders = unencodableDecisionPdfFields(data);
    if (offenders.length > 0) {
      const detail = offenders.map((o) => `${o.field} (${o.chars.join(' ')})`).join(', ');
      throw new Error(
        `Font Unicode untuk risalah tidak tersedia, dan naskah memuat aksara yang tidak dapat dicetak ` +
          `tanpa kehilangan karakter: ${detail}. Pasang assets/fonts/Amiri-Regular.ttf lalu finalisasi ulang; ` +
          `dokumen tidak disegel agar tidak ada arsip resmi yang kehilangan karakter.`
      );
    }
  } else {
    // Font Unicode TERMUAT tidak berarti semua aksara dapat dicetak: Amiri tidak
    // punya glyph emoji, dan `pdf-lib` melewati codepoint tanpa glyph TANPA
    // melempar, sehingga karakter itu hilang dari risalah yang disegel —
    // sedangkan digest kanonis yang ditandatangani anggota tetap memuatnya.
    // Tolak terang-terangan, jangan sensor diam-diam.
    const offenders = unglyphableDecisionPdfFields(data, unicodeFontHasGlyph);
    if (offenders.length > 0) {
      const detail = offenders.map((o) => `${o.field} (${o.chars.join(' ')})`).join(', ');
      throw new Error(
        `Naskah memuat aksara yang tidak memiliki glyph pada font risalah (Amiri): ${detail}. ` +
          `Aksara itu akan hilang dari PDF yang disegel e-seal, sehingga arsip berbeda dari naskah yang ` +
          `ditandatangani. Hapus aksara tersebut lalu finalisasi ulang; dokumen tidak disegel agar tidak ` +
          `ada arsip resmi yang kehilangan karakter.`
      );
    }
  }
  const font = unicodeFont ?? (await pdfDoc.embedFont(StandardFonts.Helvetica));
  const bold = unicodeFont ?? (await pdfDoc.embedFont(StandardFonts.HelveticaBold));

  // Setiap teks yang akan digambar/disusun melewati ini. Ketika font Unicode
  // tidak dapat dimuat, aksara asing diganti supaya `drawText` tidak melempar;
  // ketika tersedia, teksnya dibiarkan apa adanya agar Arab/emoji ikut tercetak.
  const safe = (txt: string): string => (keepUnicode ? txt : sanitizeForFallbackFont(txt));

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
      // Baris kosong adalah pemisah paragraf: cukup majukan `y`, jangan gambar.
      if (line) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.05, 0.05, 0.05) });
      }
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
  const qrPayload = data.verificationUrl ? verificationQrPayload(data.verificationUrl) : null;
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
