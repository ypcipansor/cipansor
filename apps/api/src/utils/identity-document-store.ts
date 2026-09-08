import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tempat foto KTP disimpan selama masa hidupnya yang pendek.
 *
 * **Bukan `public/uploads`, dan itu bukan soal kerapian.** Direktori itu
 * disajikan `express.static` di balik `uploadsAuth`, yang menurut komentarnya
 * sendiri adalah *autentikasi, bukan otorisasi*: setiap token akses yang sah —
 * termasuk milik santri atau orang tua — membuka setiap berkas di dalamnya.
 * Menaruh foto KTP di sana berarti menjanjikan "hanya Super Admin yang boleh
 * melihatnya" sambil membiarkan seluruh pengguna yang sudah masuk membacanya.
 *
 * Direktori ini tidak dipasang pada rute statis mana pun. Satu-satunya jalan
 * membacanya adalah endpoint yang memeriksa peran pemanggil dan mencatat
 * pembacaannya.
 *
 * Umur berkasnya diukur dalam hari, bukan tahun: ia dihapus begitu pengajuan
 * yang membutuhkannya diputuskan — disetujui maupun ditolak. Yang tersisa
 * adalah SHA-256-nya, yang tidak dapat memunculkan gambarnya kembali tetapi
 * dapat memutuskan apakah salinan yang kelak ditunjukkan seseorang adalah
 * berkas yang sama.
 */

/**
 * Letak penyimpanan, relatif terhadap direktori kerja API.
 *
 * Diekspor karena nilainya adalah sebuah kontrak dengan berkas penerapan, bukan
 * rincian dalam: `docker-compose.yml` harus memasang volume bernama tepat di
 * jalur ini. Tanpa itu berkasnya tinggal di lapisan tulis kontainer dan lenyap
 * pada setiap penerapan ulang — sementara basis data masih menyimpan
 * `ktpRetainUntil` tujuh tahun ke depan dan catatan verifikasi yang menyatakan
 * dokumennya pernah dilihat. Uji di sebelahnya membandingkan keduanya, supaya
 * memindahkan direktori ini tanpa memindahkan volumenya menjadi gagal, bukan
 * diam.
 */
export const IDENTITY_STORE_RELATIVE_DIR = path.join('private', 'identity');

const STORE_DIR = path.join(process.cwd(), IDENTITY_STORE_RELATIVE_DIR);

/** Jenis berkas yang diterima, beserta akhiran yang dipakai menyimpannya. */
const ACCEPTED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const MAX_IDENTITY_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * Berapa lama foto KTP disimpan setelah kunci yang dijustifikasinya berakhir.
 *
 * Tujuh tahun adalah angka yang dipakai praktik baku: CA/Browser Forum
 * mewajibkan seluruh dokumentasi permohonan sertifikat **dan pemeriksaannya**
 * disimpan sekurang-kurangnya tujuh tahun *setelah sertifikat berhenti
 * berlaku* — dihitung dari berakhirnya masa berlaku, bukan dari penerbitannya.
 * eIDAS Ps. 24.2(h) menyebut tujuannya: pembuktian dalam proses hukum.
 *
 * Nilainya dapat diturunkan yayasan lewat `IDENTITY_DOCUMENT_RETENTION_YEARS`,
 * dan ada alasan sah untuk melakukannya: UU PDP menuntut penyimpanan
 * seperlunya, dan tujuh tahun arsip foto KTP seluruh pejabat adalah sasaran
 * yang jauh lebih bernilai daripada surat-suratnya sendiri. Yang tidak boleh
 * adalah memilih angkanya tanpa menuliskannya — karena itulah nilainya ada di
 * sini, bukan tersebar di tempat pemakaiannya.
 */
export const IDENTITY_DOCUMENT_RETENTION_YEARS = Number(
  process.env.IDENTITY_DOCUMENT_RETENTION_YEARS ?? 7
);

/** Sampai kapan sebuah berkas identitas disimpan, dihitung dari akhir masa kunci. */
export function identityDocumentRetainUntil(keyExpiresAt: Date): Date {
  const until = new Date(keyExpiresAt);
  until.setFullYear(until.getFullYear() + IDENTITY_DOCUMENT_RETENTION_YEARS);
  return until;
}

export function isAcceptedIdentityDocument(mimeType: string): boolean {
  return mimeType in ACCEPTED;
}

export interface StoredIdentityDocument {
  fileName: string;
  sha256: string;
}

/**
 * Simpan berkasnya, kembalikan nama dan hash-nya.
 *
 * Namanya acak-kriptografis dan tidak memuat apa pun tentang pemiliknya —
 * bukan sebagai pengganti otorisasi, melainkan supaya nama berkas yang bocor
 * ke dalam log tidak dengan sendirinya menyebutkan NIK atau nama siapa pun.
 */
export async function storeIdentityDocument(
  buffer: Buffer,
  mimeType: string
): Promise<StoredIdentityDocument> {
  const extension = ACCEPTED[mimeType];
  if (!extension) {
    throw new Error(`Jenis berkas tidak diterima: ${mimeType}`);
  }

  await fs.mkdir(STORE_DIR, { recursive: true, mode: 0o700 });

  const fileName = `${crypto.randomUUID()}${extension}`;
  // 0600: hanya proses yang menulisnya yang boleh membacanya kembali. Berkas
  // ini tidak pernah dilayani oleh peladen statis, jadi tidak ada yang lain
  // yang perlu membukanya.
  await fs.writeFile(path.join(STORE_DIR, fileName), buffer, { mode: 0o600 });

  return {
    fileName,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

/**
 * Baca berkasnya kembali.
 *
 * Nama berkas berasal dari basis data, tidak pernah dari permintaan pengguna;
 * pemeriksaan di bawah tetap ada karena kolom basis data pun bukan jaminan —
 * satu nama berisi `../` sudah cukup membuat endpoint ini membaca berkas mana
 * pun yang dapat dijangkau prosesnya.
 */
export async function readIdentityDocument(fileName: string): Promise<Buffer> {
  const resolved = path.resolve(STORE_DIR, fileName);
  if (path.dirname(resolved) !== path.resolve(STORE_DIR)) {
    throw new Error('Nama berkas identitas tidak sah');
  }
  return fs.readFile(resolved);
}

/**
 * Hapus berkasnya. Berkas yang sudah tidak ada bukan kegagalan.
 *
 * Penghapusan dipanggil pada setiap jalur yang mengakhiri kegunaannya —
 * disetujui, ditolak, atau datanya diubah — dan sebagian jalur itu dapat
 * berjalan dua kali. Melempar galat karena berkasnya sudah lenyap akan
 * menggagalkan sebuah keputusan yang sebenarnya berhasil.
 */
export async function deleteIdentityDocument(fileName: string): Promise<void> {
  try {
    const resolved = path.resolve(STORE_DIR, fileName);
    if (path.dirname(resolved) !== path.resolve(STORE_DIR)) return;
    await fs.unlink(resolved);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/**
 * Berapa lama sebuah berkas yang tak dirujuk dibiarkan sebelum dianggap yatim.
 *
 * Berkasnya ditulis lebih dulu, barisnya menyusul: `uploadIdentityDocument`
 * memanggil `storeIdentityDocument` sebelum `prisma.userIdentity.update`.
 * Selama jeda itu — dan selama sebuah transaksi yang belum dikukuhkan — sebuah
 * berkas yang sah tampak persis seperti berkas yatim. Jeda itu berukuran
 * milidetik; sehari adalah margin yang begitu jauh melampauinya sehingga
 * penyapu ini tidak perlu tahu apa pun tentang waktu tempuh permintaan.
 *
 * Ongkos salahnya asimetris, dan ambang ini condong ke arah yang benar:
 * menunggu sehari lebih lama menyisakan satu berkas yatim sehari lebih lama,
 * sedangkan menyapu terlalu cepat menghapus foto KTP yang baru saja diunggah
 * seseorang dan membuatnya harus mengunggah ulang tanpa tahu sebabnya.
 */
export const IDENTITY_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface IdentityDocumentOnDisk {
  fileName: string;
  modifiedAt: Date;
}

/**
 * Daftar berkas yang benar-benar ada di disk.
 *
 * Ini satu-satunya arah pandang yang dapat menemukan berkas yatim. Penyapu
 * `db:purge-identity-documents` berangkat dari basis data — ia membaca baris
 * yang masa simpannya lewat, lalu menghapus berkas yang disebut baris itu.
 * Dengan sendirinya ia tidak akan pernah menyentuh berkas yang barisnya sudah
 * tidak ada: tidak ada baris, tidak ada yang menyebutkan namanya, tidak ada
 * yang menghapusnya. Direktori inilah yang tahu.
 *
 * Direktori yang belum pernah dibuat bukan kegagalan — ia berarti belum ada
 * berkas sama sekali, yang jawabannya sama: daftar kosong.
 */
export async function listIdentityDocuments(): Promise<IdentityDocumentOnDisk[]> {
  let entries;
  try {
    entries = await fs.readdir(STORE_DIR, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }

  const found: IdentityDocumentOnDisk[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const stat = await fs.stat(path.join(STORE_DIR, entry.name));
    found.push({ fileName: entry.name, modifiedAt: stat.mtime });
  }
  return found;
}

/**
 * Pilih berkas mana yang yatim: ada di disk, tidak dirujuk baris mana pun, dan
 * sudah cukup tua untuk memastikan penulisnya bukan permintaan yang sedang
 * berjalan.
 *
 * Dipisahkan dari I/O-nya supaya keputusannya dapat diuji tanpa disk maupun
 * basis data — dan supaya yang diuji adalah aturannya, bukan kemampuan Node
 * menghapus berkas.
 */
export function orphanedIdentityDocuments(
  onDisk: IdentityDocumentOnDisk[],
  referenced: Iterable<string>,
  now: Date = new Date()
): IdentityDocumentOnDisk[] {
  const keep = new Set(referenced);
  return onDisk.filter(
    (f) =>
      !keep.has(f.fileName) &&
      now.getTime() - f.modifiedAt.getTime() >= IDENTITY_ORPHAN_GRACE_MS
  );
}
