import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { stampRevoked } from '@/utils/generate-letter-pdf';

/**
 * Mengenali berkas PDF yang merupakan **salinan bercap DICABUT** dari sistem.
 *
 * Salinan yang diunduh setelah pencabutan membawa cap "DICABUT" pada setiap
 * halamannya (`stampRevoked`), dan cap itu mengubah byte-nya. Akibatnya hash
 * berkas yang diunggah pemverifikasi tidak pernah sama dengan `pdfHash` yang
 * ditandatangani — sehingga tanpa pengenalan ini, berkas resmi keluaran sistem
 * sendiri dijawab "tidak terdaftar atau telah diubah". Naskah yang justru
 * paling perlu dijelaskan statusnya dituduh palsu, dan itu kelas jawaban keliru
 * yang dihindari di seluruh halaman verifikasi.
 *
 * **Yang dipercaya bukan teksnya, melainkan hashnya.** Capnya dibuat ulang dari
 * byte arsip yang tersimpan, lalu hasilnya dibandingkan sebagai hash. Menempelkan
 * tulisan "DICABUT" ke PDF karangan karena itu tidak menolong pemalsu: sistem
 * tetap menghitung, cap karangan itu tidak akan sama dengan cap yang dihasilkan
 * dari arsip, dan jawabannya tetap "tidak terdaftar".
 *
 * **Cap dibuat ulang, bukan disimpan.** Justru karena cap dan unduhan sama-sama
 * memanggil `stampRevoked` dengan masukan yang sama persis (arsip, sebab, waktu,
 * nama pencabut — semuanya tetap setelah dicatat), byte yang dibandingkan di
 * sini identik dengan byte yang diunduh penerimanya. Menyimpan hash salinan
 * bercap akan membuat keduanya dapat menyimpang diam-diam bila `stampRevoked`
 * berubah; dengan menghitung di kedua sisi, keduanya menyimpang bersama dan
 * verifikasi tetap benar. Ini kebalikan dari byte yang *ditandatangani*, yang
 * memang harus diarsipkan — sebab byte itu tidak boleh berubah selamanya.
 *
 * **Batasnya.** Hanya tanda tangan yang arsipnya ada (`letterSignedDocument`)
 * yang dapat dikenali; surat lama yang dicabut sebelum arsip ada tidak ikut
 * dikenali di sini. Jumlahnya kecil dan `db:archive-letters` menutupnya.
 */

/** Berapa tanda tangan tercabut yang diperiksa dalam satu permintaan. */
const MAX_CANDIDATES = 200;

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

export interface RevokedCopyMatch {
  verificationToken: string;
}

type RevokedCopyClient = {
  letterSignature: {
    findMany: (args: unknown) => Promise<
      Array<{
        verificationToken: string;
        revokedAt: Date | null;
        revokedReason: string | null;
        revokedBy: { name: string | null } | null;
        document: { bytes: Uint8Array; sha256: string } | null;
      }>
    >;
  };
};

/**
 * Cari tanda tangan tercabut yang salinan bercapnya sama persis dengan berkas
 * yang diunggah. `null` bila tidak ada yang cocok.
 */
export async function matchRevokedCopy(
  pdfBuffer: Buffer,
  uploadedHash: string,
  client: RevokedCopyClient = prisma as unknown as RevokedCopyClient
): Promise<RevokedCopyMatch | null> {
  const candidates = await client.letterSignature.findMany({
    where: { revokedAt: { not: null }, document: { isNot: null } },
    orderBy: { revokedAt: 'desc' },
    take: MAX_CANDIDATES,
    select: {
      verificationToken: true,
      revokedAt: true,
      revokedReason: true,
      revokedBy: { select: { name: true } },
      document: { select: { bytes: true, sha256: true } },
    },
  });

  for (const candidate of candidates) {
    if (!candidate.revokedAt || !candidate.document) continue;

    const archived = Buffer.from(candidate.document.bytes);
    // Cap selalu menambah byte (satu font, satu alur isi berisi perintah
    // tambahan), jadi salinan bercap tidak mungkin lebih kecil dari arsipnya.
    // Saringan ini gratis dan pasti: kandidat yang arsipnya sebesar atau lebih
    // besar dari berkas yang diunggah tidak mungkin menjadi asalnya.
    if (archived.length >= pdfBuffer.length) continue;
    // Arsip yang tidak lagi utuh tidak boleh menjadi dasar pencocokan: cap yang
    // dibuat dari byte rusak bukan cap yang diunduh penerimanya.
    if (sha256(archived) !== candidate.document.sha256) continue;

    const stamped = await stampRevoked(archived, {
      reason: candidate.revokedReason ?? 'Dicabut oleh pejabat yang berwenang.',
      revokedAt: candidate.revokedAt,
      revokedByName: candidate.revokedBy?.name ?? null,
    });

    if (sha256(stamped) === uploadedHash) {
      return { verificationToken: candidate.verificationToken };
    }
  }

  return null;
}
