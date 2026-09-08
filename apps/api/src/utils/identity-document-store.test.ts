import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  IDENTITY_DOCUMENT_RETENTION_YEARS,
  IDENTITY_ORPHAN_GRACE_MS,
  IDENTITY_STORE_RELATIVE_DIR,
  identityDocumentRetainUntil,
  isAcceptedIdentityDocument,
  listIdentityDocuments,
  orphanedIdentityDocuments,
} from './identity-document-store';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COMPOSE = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8');
const DOCKERFILE = fs.readFileSync(
  path.join(REPO_ROOT, 'apps', 'api', 'Dockerfile'),
  'utf8'
);

/** `private/identity` di mesin mana pun, termasuk yang pemisah jalurnya `\`. */
const storePath = IDENTITY_STORE_RELATIVE_DIR.split(path.sep).join('/');

/**
 * Berkas ini menyimpan pindaian KTP, dan dua janji dibuat di atasnya: bahwa
 * hanya Super Admin yang membacanya, dan bahwa ia masih ada ketika ditanyakan
 * bertahun-tahun kemudian. Keduanya dipatahkan bukan oleh kode di dalam modul
 * ini, melainkan oleh berkas penerapan di luarnya — jadi di sinilah keduanya
 * diperiksa.
 */
describe('tempat penyimpanan bertahan melewati penerapan ulang', () => {
  /**
   * Kegagalan yang ditutup uji ini tidak menghasilkan galat apa pun: unggahan
   * berhasil, verifikasi berhasil, lalu `docker compose up -d` berikutnya
   * menghapus berkasnya sementara barisnya di basis data tetap menyebutkan
   * nama berkas, SHA-256, dan tenggat simpannya. Yang tersisa adalah sistem
   * yang mengaku memegang bukti yang tidak lagi dipegangnya.
   */
  it('dipasangi volume bernama di jalur yang benar-benar dipakai kode', () => {
    expect(COMPOSE).toContain(`:/app/apps/api/${storePath}`);
  });

  /**
   * Volume bernama yang dipasang pada jalur yang tidak ada di dalam image
   * dibuat Docker sebagai root, dan unggahan pertama dari proses `expressjs`
   * gagal dengan EACCES. Direktorinya harus sudah ada — dan dimiliki — sebelum
   * volumenya menempel.
   */
  it('direktorinya sudah dibuat dan dimiliki di dalam image', () => {
    expect(DOCKERFILE).toMatch(
      new RegExp(`mkdir[^\\n]*${storePath}`, 'm')
    );
    expect(DOCKERFILE).toMatch(
      new RegExp(`chown[\\s\\S]*?${storePath}`, 'm')
    );
  });

  /**
   * Di luar `public/` bukan soal kerapian: `app.ts` menyajikan
   * `public/uploads` lewat `express.static` di balik `uploadsAuth`, yang
   * memeriksa keberadaan token dan bukan peran pemiliknya. Satu direktori yang
   * salah letak akan membuat setiap pengguna yang sudah masuk — termasuk wali
   * santri — dapat mengunduh KTP setiap pejabat.
   */
  it('tidak berada di dalam direktori yang disajikan secara statis', () => {
    expect(storePath.startsWith('public/')).toBe(false);
  });
});

describe('masa simpan', () => {
  /**
   * Dihitung dari berakhirnya masa berlaku kunci, bukan dari penerbitannya —
   * itulah yang ditetapkan CA/Browser Forum, dan selisih keduanya adalah
   * seluruh umur sertifikat.
   */
  it('dihitung dari kedaluwarsa kunci, bukan dari hari ini', () => {
    const expiry = new Date('2030-01-15T00:00:00.000Z');
    const until = identityDocumentRetainUntil(expiry);
    expect(until.getUTCFullYear()).toBe(2030 + IDENTITY_DOCUMENT_RETENTION_YEARS);
    expect(until.getUTCMonth()).toBe(expiry.getUTCMonth());
    expect(until.getUTCDate()).toBe(expiry.getUTCDate());
  });

  it('tidak mengubah tanggal yang diberikan kepadanya', () => {
    const expiry = new Date('2030-01-15T00:00:00.000Z');
    identityDocumentRetainUntil(expiry);
    expect(expiry.toISOString()).toBe('2030-01-15T00:00:00.000Z');
  });
});

describe('jenis berkas', () => {
  it('menerima foto dan pindaian, menolak yang lain', () => {
    expect(isAcceptedIdentityDocument('image/jpeg')).toBe(true);
    expect(isAcceptedIdentityDocument('application/pdf')).toBe(true);
    expect(isAcceptedIdentityDocument('image/svg+xml')).toBe(false);
    expect(isAcceptedIdentityDocument('text/html')).toBe(false);
  });
});

/**
 * Berkas yatim: ada di disk, tidak disebut baris mana pun.
 *
 * Lubang yang ditutup di sini tidak menghasilkan galat, tidak muncul di log,
 * dan tidak terlihat dari basis data — justru karena barisnya sudah tidak ada.
 * Foto KTP yang tertinggal begitu adalah data pribadi tanpa pemilik, tanpa
 * alasan simpan, dan tanpa tenggat; ia hanya dapat ditemukan dari arah disk.
 */
describe('menemukan berkas yatim dari arah disk', () => {
  const HARI = 24 * 60 * 60 * 1000;
  const sekarang = new Date('2026-09-03T10:00:00Z');
  const lama = new Date(sekarang.getTime() - 30 * HARI);

  /**
   * Kasus yang benar-benar terjadi: `UserIdentity` ber-`onDelete: Cascade` ke
   * `User`, jadi menghapus penggunanya — atau `seed.ts` yang men-TRUNCATE —
   * melenyapkan satu-satunya catatan yang menyebutkan nama berkasnya.
   */
  it('menghapus berkas yang tidak dirujuk baris mana pun', () => {
    const yatim = orphanedIdentityDocuments(
      [
        { fileName: 'masih-dipakai.jpg', modifiedAt: lama },
        { fileName: 'ditinggalkan.jpg', modifiedAt: lama },
      ],
      ['masih-dipakai.jpg'],
      sekarang
    );

    expect(yatim.map((f) => f.fileName)).toEqual(['ditinggalkan.jpg']);
  });

  /**
   * Arah kesalahan yang lebih mahal. Unggahan menulis berkasnya sebelum
   * memperbarui barisnya, jadi selama beberapa milidetik sebuah berkas yang
   * sah tampak persis seperti yatim. Menyapunya di situ menghapus foto KTP
   * yang baru saja diunggah seseorang, dan ia tidak akan pernah tahu sebabnya.
   */
  it('membiarkan berkas yang baru ditulis meski belum ada barisnya', () => {
    const baruSaja = new Date(sekarang.getTime() - 5_000);

    const yatim = orphanedIdentityDocuments(
      [{ fileName: 'sedang-diunggah.jpg', modifiedAt: baruSaja }],
      [],
      sekarang
    );

    expect(yatim).toEqual([]);
  });

  /**
   * Ambangnya harus lebih panjang daripada permintaan HTTP mana pun yang masuk
   * akal. Satu jam masih terlalu dekat dengan transaksi yang menggantung;
   * sehari tidak.
   */
  it('menunggu sehari penuh sebelum menganggap sebuah berkas yatim', () => {
    expect(IDENTITY_ORPHAN_GRACE_MS).toBe(HARI);

    const sejamLalu = new Date(sekarang.getTime() - 60 * 60 * 1000);
    expect(
      orphanedIdentityDocuments(
        [{ fileName: 'sejam.jpg', modifiedAt: sejamLalu }],
        [],
        sekarang
      )
    ).toEqual([]);

    const seharisatuDetikLalu = new Date(sekarang.getTime() - HARI - 1000);
    expect(
      orphanedIdentityDocuments(
        [{ fileName: 'kemarin.jpg', modifiedAt: seharisatuDetikLalu }],
        [],
        sekarang
      ).map((f) => f.fileName)
    ).toEqual(['kemarin.jpg']);
  });

  /**
   * Penyapu tahap satu berangkat dari baris yang **kedaluwarsa**; tahap dua
   * harus membandingkan terhadap seluruh baris yang punya berkas, bukan hanya
   * yang itu. Kalau tidak, setiap berkas yang masa simpannya masih panjang —
   * yaitu semuanya — akan tampak yatim dan terhapus.
   */
  it('menganggap berkas yang dirujuk baris yang masih berlaku tetap terpakai', () => {
    const dirujuk = ['a.jpg', 'b.png', 'c.pdf'];
    const yatim = orphanedIdentityDocuments(
      dirujuk.map((fileName) => ({ fileName, modifiedAt: lama })),
      dirujuk,
      sekarang
    );

    expect(yatim).toEqual([]);
  });
});

/**
 * Direktori yang belum pernah dibuat berarti belum ada unggahan sama sekali.
 * Melempar galat di situ akan membuat perintah pemeliharaan gagal pada
 * pemasangan yang justru paling bersih — dan gagalnya perintah pembersih
 * adalah cara paling sunyi untuk berhenti membersihkan.
 */
describe('membaca direktori penyimpanan', () => {
  const STORE = path.join(process.cwd(), IDENTITY_STORE_RELATIVE_DIR);
  const ASIDE = `${STORE}.uji-disingkirkan`;
  let dipindahkan = false;

  // Direktorinya di-gitignore, jadi di CI ia memang tidak ada. Di mesin yang
  // pernah dipakai mengunggah, ia ada — dan uji yang hasilnya bergantung pada
  // riwayat mesin penjalannya tidak menguji apa pun.
  beforeAll(() => {
    if (fs.existsSync(STORE)) {
      fs.renameSync(STORE, ASIDE);
      dipindahkan = true;
    }
  });

  // Pohon direktorinya harus berakhir persis seperti saat uji ini mulai —
  // termasuk ketika ia mulai dengan tidak ada sama sekali.
  afterAll(() => {
    fs.rmSync(STORE, { recursive: true, force: true });
    if (dipindahkan) {
      fs.renameSync(ASIDE, STORE);
    } else {
      fs.rmSync(path.dirname(STORE), { recursive: true, force: true });
    }
  });

  it('mengembalikan daftar kosong, bukan galat, ketika direktorinya belum ada', async () => {
    expect(fs.existsSync(STORE)).toBe(false);
    await expect(listIdentityDocuments()).resolves.toEqual([]);
  });

  /**
   * Dan ketika ia ada, yang dilaporkan adalah berkas — bukan sub-direktori,
   * yang namanya kalau ikut terbawa akan diserahkan ke `unlink` dan gagal.
   */
  it('melaporkan berkas beserta waktu tulisnya, mengabaikan direktori', async () => {
    fs.mkdirSync(path.join(STORE, 'bukan-berkas'), { recursive: true });
    fs.writeFileSync(path.join(STORE, 'ada.jpg'), 'x');

    const isi = await listIdentityDocuments();

    expect(isi.map((f) => f.fileName)).toEqual(['ada.jpg']);
    expect(isi[0]!.modifiedAt).toBeInstanceOf(Date);

    fs.rmSync(STORE, { recursive: true, force: true });
  });
});
