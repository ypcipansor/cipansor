import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import zlib from 'zlib';
import { generateLetterPdfBuffer, stampRevoked, LetterPdfInput } from './generate-letter-pdf';

describe('generateLetterPdfBuffer determinism', () => {
  it('generates 100% byte-identical PDFs when called twice with the same letter data', async () => {
    const mockLetter: LetterPdfInput = {
      id: 'letter-123',
      letterNumber: '001/YPC/X/2025',
      agendaNumber: 'AG-001',
      date: new Date('2025-05-15T00:00:00.000Z'),
      type: 'SURAT_DINAS',
      nature: 'PUBLIC',
      subject: 'Undangan Rapat Kerja Yayasan',
      content: 'Dengan hormat,\n\nSehubungan dengan agenda tahunan Yayasan Pesantren Cipansor...',
      senderName: 'Ustadz Ahmad',
      senderTitle: 'Sekretaris Yayasan',
      recipientName: 'Bapak Kepala Sekolah',
      unit: {
        name: 'SMP IT CIPANSOR',
        address: 'Jl. Pesantren No. 12',
        phone: '081234567890',
        email: 'smpit@cipansor.or.id',
      },
      signatures: [
        {
          verificationToken: 'test-token-abcdef123456',
          signedAt: new Date('2025-05-15T10:00:00.000Z'),
          signer: { name: 'Ustadz Ahmad' },
        },
      ],
    };

    const pdf1 = await generateLetterPdfBuffer(mockLetter);
    const pdf2 = await generateLetterPdfBuffer(mockLetter);

    const hash1 = crypto.createHash('sha256').update(pdf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(pdf2).digest('hex');

    expect(hash1).toEqual(hash2);
    expect(pdf1.equals(pdf2)).toBe(true);
  });
});

/**
 * Apa yang benar-benar tercetak, dibaca dari lapisan teksnya.
 *
 * Kedua cacat di bawah lolos dari setiap uji yang ada karena semuanya
 * memeriksa byte, bukan bacaan. Keduanya baru terlihat ketika naskahnya
 * benar-benar dirender menjadi gambar dan dibaca.
 */
function letterWith(over: Partial<LetterPdfInput>): LetterPdfInput {
  return {
    id: 'letter-1',
    letterNumber: '434/Sket/Y-CPS/IX/2026',
    date: new Date('2026-09-01T00:00:00.000Z'),
    type: 'SURAT_KETERANGAN',
    nature: 'PUBLIC',
    subject: 'Keterangan Aktif Santri',
    content: 'Isi.',
    unit: { name: 'Yayasan Pesantren Cipansor', address: 'Tasikmalaya' },
    signatures: [],
    ...over,
  } as LetterPdfInput;
}

/**
 * Teks yang benar-benar tercetak, termasuk yang ada di dalam aliran terkompresi.
 *
 * Dua hal membuat pembacaan mentah keliru. Aliran isinya dipadatkan dengan
 * Flate, dan berkas yang dimuat ulang lalu disimpan lagi — seperti salinan
 * bercap — menulis teksnya sebagai untai heksadesimal `<…> Tj`, bukan literal
 * `(…) Tj`. Membaca berkasnya sebagai latin1 belaka akan mengira capnya tidak
 * ada padahal ia tercetak.
 */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  let out = raw;
  // `indexOf('stream')` juga mengenai 'endstream'; awalan baris memisahkannya.
  const re = /[\r\n]stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    try {
      out += zlib
        .inflateSync(Buffer.from(raw.slice(start, end), 'latin1'))
        .toString('latin1');
    } catch {
      // Bukan aliran Flate, atau terpotong — abaikan.
    }
  }
  // Untai heksadesimal dibaca kembali menjadi teksnya.
  out += out.replace(/<([0-9A-Fa-f]{4,})>/g, (_all, hex: string) =>
    Buffer.from(hex, 'hex').toString('latin1')
  );
  return out;
}

function countInPdf(pdf: Buffer, needle: string): number {
  return pdfText(pdf).split(needle).length - 1;
}

describe('kop surat', () => {
  /**
   * Untuk naskah yang terbit dari yayasan sendiri, nama unit dan nama yayasan
   * adalah kalimat yang sama — dan kop suratnya mencetaknya dua kali bertumpuk.
   */
  it('tidak mencetak nama yayasan dua kali pada naskah yayasan', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({ unit: { name: 'Yayasan Pesantren Cipansor', address: 'Tasikmalaya' } })
    );
    expect(countInPdf(pdf, 'YAYASAN PESANTREN CIPANSOR')).toBe(1);
  });

  it('tetap dua baris untuk naskah yang terbit dari unit', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({ unit: { name: 'MTs Cipansor', address: 'Tasikmalaya' } })
    );
    expect(countInPdf(pdf, 'YAYASAN PESANTREN CIPANSOR')).toBe(1);
    expect(countInPdf(pdf, 'MTS CIPANSOR')).toBe(1);
  });
});

describe('isi naskah', () => {
  /**
   * Blok data yang ditulis penyusunnya baris per baris — bentuk yang ada di
   * hampir setiap surat keterangan — sebelumnya tercetak berdempet menjadi satu
   * paragraf panjang, karena hanya baris kosong ganda yang memisahkan alinea.
   */
  it('menghormati pergantian baris tunggal di dalam alinea', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        content:
          'Menerangkan bahwa:\n\nNama : Ahmad Fauzan\nNomor Induk : 2024.07.0091\nKelas : IX MTs',
      })
    );
    const text = pdfText(pdf);
    // Tiga baris data berdiri sendiri, bukan tergabung menjadi satu.
    expect(text).toContain('Nama : Ahmad Fauzan');
    expect(text).toContain('Nomor Induk : 2024.07.0091');
    expect(text).toContain('Kelas : IX MTs');
    expect(text).not.toContain('Ahmad Fauzan Nomor Induk');
  });
});

describe('blok tanda tangan', () => {
  /**
   * Pedoman visualisasi tanda tangan elektronik menyatakan visualisasinya tidak
   * memuat data pribadi seperti pindaian tanda tangan, NIP, atau NIK — dan bagi
   * yayasan ini nomor induk pegawai memang keterangan internal. Setiap lembar
   * yang beredar dengan NIP tercetak adalah satu salinan lagi dari nomor
   * kepegawaian seseorang, dan naskahnya tidak menjadi lebih sah karenanya.
   */
  /**
   * Bukti bahwa QR tidak lagi menyandikan token.
   *
   * Membongkar isi QR dari dalam PDF mahal; yang murah dan justru lebih tepat
   * adalah membuktikan **tokennya tidak lagi berpengaruh apa pun** terhadap
   * keluaran. Dua naskah yang hanya berbeda tokennya menghasilkan byte yang
   * sama persis — dan itu hanya mungkin bila yang masuk ke dalam kodenya bukan
   * token.
   */
  it('token tidak lagi menentukan isi QR', async () => {
    const withToken = (verificationToken: string) =>
      letterWith({
        signatures: [
          {
            verificationToken,
            signedAt: new Date('2026-09-01T03:00:00.000Z'),
            signer: { name: 'H. Endang Suryana' },
          },
        ],
      });

    const a = await generateLetterPdfBuffer(withToken('token-pertama-abcdef'));
    const b = await generateLetterPdfBuffer(withToken('token-kedua-zyxwvu'));
    expect(crypto.createHash('sha256').update(a).digest('hex')).toBe(
      crypto.createHash('sha256').update(b).digest('hex')
    );
  });

  it('mencetak alamat halaman verifikasi pada kaki naskah', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        signatures: [
          {
            verificationToken: 'tok-abc',
            signedAt: new Date('2026-09-01T03:00:00.000Z'),
            signer: { name: 'H. Endang Suryana' },
          },
        ],
      })
    );
    expect(pdfText(pdf)).toContain('/public/verify-letter');
  });

  it('tidak mencetak NIP penanda tangan', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        signatures: [
          {
            verificationToken: 'tok-abc',
            signedAt: new Date('2026-09-01T03:00:00.000Z'),
            signer: { name: 'H. Endang Suryana' },
          },
        ],
      })
    );
    const text = pdfText(pdf);
    expect(text).toContain('H. Endang Suryana');
    expect(text).not.toContain('NIP');
  });
});

describe('lampiran dan tembusan', () => {
  /**
   * Baris "Lampiran" pada kepala surat selalu tercetak "-", apa pun keadaannya,
   * karena memang tidak ada tempat untuk mencatat lampiran. Baris itu ada
   * justru supaya penerima tahu apa yang seharusnya ia terima.
   */
  it('mengumumkan jumlah lampiran dengan angka dan huruf', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        type: 'SURAT_DINAS',
        attachments: [{ name: 'Daftar hadir' }, { name: 'Notulen' }],
      })
    );
    expect(pdfText(pdf)).toContain('Lampiran : 2 (dua) berkas');
  });

  it('tetap menulis "-" ketika tidak ada lampiran', async () => {
    const pdf = await generateLetterPdfBuffer(letterWith({ type: 'SURAT_DINAS' }));
    expect(pdfText(pdf)).toContain('Lampiran : -');
  });

  it('mencetak daftar tembusan bernomor di kaki naskah', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        recipients: [
          { isCC: false, user: { name: 'Kepala MTs Cipansor' } },
          { isCC: true, order: 1, user: { name: 'Ketua Yayasan' } },
          { isCC: true, order: 2, externalName: 'Arsip Tata Usaha' },
        ],
      })
    );
    const text = pdfText(pdf);
    expect(text).toContain('Tembusan:');
    expect(text).toContain('1. Ketua Yayasan');
    expect(text).toContain('2. Arsip Tata Usaha');
    // Penerima utama bukan tembusan; namanya tidak boleh ikut di daftar itu.
    expect(text).not.toContain('3. Kepala MTs Cipansor');
  });

  /**
   * Tembusan naskah dinas sering ditujukan ke pihak yang tidak punya akun di
   * sistem ini, dan urutannya adalah urutan yang disusun penulisnya — biasanya
   * menurun menurut kedudukan, dengan pihak dalam dan luar berselang-seling.
   */
  it('mencetak tembusan pihak luar, dalam urutan yang disusun penulisnya', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        recipients: [
          { isCC: true, order: 3, externalName: 'Arsip Tata Usaha' },
          { isCC: true, order: 1, externalName: 'Kepala KUA Kecamatan Cipansor' },
          { isCC: true, order: 2, user: { name: 'Ketua Yayasan' } },
        ],
      })
    );
    const text = pdfText(pdf);
    expect(text).toContain('1. Kepala KUA Kecamatan Cipansor');
    expect(text).toContain('2. Ketua Yayasan');
    expect(text).toContain('3. Arsip Tata Usaha');
  });

  it('tidak mencetak blok tembusan ketika tidak ada satu pun', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({ recipients: [{ isCC: false, user: { name: 'Kepala MTs' } }] })
    );
    expect(pdfText(pdf)).not.toContain('Tembusan:');
  });

  /**
   * `LetterRecipient.unitId` menyimpan unit **penerbit** surat — satu-satunya
   * penulisnya mengisinya dengan unit asal naskah — jadi baris tembusan tanpa
   * nama tidak boleh jatuh ke sana. Kalau jatuh, naskahnya mencetak nama
   * yayasan sendiri sebagai penerima tembusannya sendiri.
   */
  it('tidak pernah mencetak unit penerbit sebagai penerima tembusan', async () => {
    const pdf = await generateLetterPdfBuffer(
      letterWith({
        recipients: [
          { isCC: true, order: 1, externalName: 'Kepala KUA' },
          // Baris tanpa nama sama sekali — dilewati, bukan diisi dari unit.
          { isCC: true, order: 2 },
        ],
      })
    );
    const text = pdfText(pdf);
    expect(text).toContain('1. Kepala KUA');
    expect(text).not.toContain('2. ');
    expect(text).not.toContain('Yayasan Pesantren Cipansor\n2.');
  });

  /**
   * Penjaga byte, bukan penjaga tampilan.
   *
   * `LetterSignature.pdfHash` adalah SHA-256 dari byte naskah, dan verifikasi
   * publik bekerja dengan menghitung ulang hash berkas yang diunggah. Naskah
   * yang tidak punya lampiran dan tidak punya tembusan — yaitu setiap surat
   * yang pernah ditandatangani sebelum perubahan ini — harus menghasilkan byte
   * yang sama persis seperti sebelumnya, kalau tidak seluruh surat lama akan
   * dilaporkan kepada publik sebagai berubah.
   *
   * Kalau uji ini merah, tata letaknya berubah untuk *semua* naskah: itu bukan
   * galat uji, itu migrasi — lihat komentar modul di generate-letter-pdf.ts.
   * Memperbarui angkanya sah **hanya** setelah perubahannya disengaja dan
   * akibatnya diterima; mengubahnya supaya uji hijau kembali menghapus
   * satu-satunya penjaga yang ada.
   *
   * Riwayat pin ini:
   *
   * - `d4e73b4d…` — sebelum lampiran dan tembusan. Tetap sama saat keduanya
   *   ditambahkan, karena keduanya hanya tercetak bila datanya ada.
   * - `cde0a068…` — 2026-09-03. Kop surat berhenti mencetak nomor badan hukum
   *   karangan (`AHU-0012345…Tahun 2020`) dan memakai dasar hukum dari kop
   *   surat yang sungguh dikeluarkan yayasan, beserta alamat dan telepon yang
   *   sebenarnya. Perubahan disengaja dan menyentuh setiap naskah; naskah yang
   *   sudah ditandatangani tetap aman karena byte-nya diarsipkan (PR-3), tetapi
   *   `db:archive-letters` harus dijalankan **sebelum** ini diterapkan ke
   *   produksi agar naskah lama yang belum berarsip masih dapat dibuat ulang.
   */
  it('naskah tanpa lampiran dan tanpa tembusan tetap menghasilkan byte yang sama', async () => {
    const pdf = await generateLetterPdfBuffer({
      id: 'letter-1',
      letterNumber: '434/Sket/Y-CPS/IX/2026',
      date: new Date('2026-09-01T00:00:00.000Z'),
      type: 'SURAT_DINAS',
      nature: 'PUBLIC',
      subject: 'Undangan Rapat Kerja',
      content: 'Dengan hormat,\n\nKami mengundang Bapak/Ibu untuk hadir.',
      senderTitle: 'Sekretaris Yayasan',
      recipientName: 'Kepala MTs Cipansor',
      unit: { name: 'Yayasan Pesantren Cipansor', address: 'Tasikmalaya' },
      signatures: [],
    });

    expect(crypto.createHash('sha256').update(pdf).digest('hex')).toBe(
      'cde0a06869aeb3964915f9f052ee38767ef08d3f47161cb7bb986d89ca7f61d8'
    );
  });
});

describe('cap DICABUT', () => {
  it('membubuhkan cap dan keterangan pencabutannya pada setiap halaman', async () => {
    const clean = await generateLetterPdfBuffer(letterWith({}));
    const stamped = await stampRevoked(clean, {
      reason: 'Nomor surat ganda dengan 433/Sket/Y-CPS/IX/2026.',
      revokedAt: new Date('2026-09-02T07:30:00.000Z'),
      revokedByName: 'H. Endang Suryana',
    });

    const text = pdfText(stamped);
    expect(text).toContain('DICABUT');
    expect(text).toContain('H. Endang Suryana');
    expect(text).toContain('2026-09-02');
    expect(countInPdf(clean, 'DICABUT')).toBe(0);
  });

  /**
   * Yang dicap adalah SALINAN. Berkas yang ditandatangani tidak boleh berubah,
   * sebab hash byte-nyalah yang dipakai verifikasi publik.
   */
  it('tidak mengubah berkas yang ditandatangani', async () => {
    const clean = await generateLetterPdfBuffer(letterWith({}));
    const before = crypto.createHash('sha256').update(clean).digest('hex');
    await stampRevoked(clean, {
      reason: 'Alasan yang cukup panjang.',
      revokedAt: new Date('2026-09-02T07:30:00.000Z'),
    });
    expect(crypto.createHash('sha256').update(clean).digest('hex')).toBe(before);
  });

  /**
   * Menolak mencetak cap karena alasannya memuat satu aksara di luar WinAnsi
   * akan meninggalkan naskah yang sudah dicabut beredar tanpa tanda apa pun.
   */
  it('tetap mencetak walau alasannya memuat aksara di luar WinAnsi', async () => {
    const clean = await generateLetterPdfBuffer(letterWith({}));
    await expect(
      stampRevoked(clean, {
        reason: 'Dicabut sesuai keputusan rapat — بسم الله',
        revokedAt: new Date('2026-09-02T07:30:00.000Z'),
      })
    ).resolves.toBeInstanceOf(Buffer);
  });
});
