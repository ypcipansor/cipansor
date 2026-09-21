import { Router } from 'express';
import multer from 'multer';
import { RoleCode } from '@prisma/client';
import { FoundationDecisionController as c } from './foundation-decisions.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { asyncHandler, validate, validateQuery } from '@/middleware/error';
import { requireTurnstile } from '@/middleware/turnstile';
import { passphraseLimiter, publicVerifyLimiter } from '@/middleware/rate-limit';
import {
  castFoundationVoteSchema,
  createFoundationDecisionSchema,
  finalizeFoundationDecisionSchema,
  setFoundationDecisionPublicationSchema,
  listFoundationDecisionsQuerySchema,
  upsertFoundationRuleSchema,
} from './foundation-decisions.schema';

const router = Router();

/**
 * Unggah PDF di memori: berkas verifikasi hanya dibaca untuk hash-nya dan
 * dibuang, tidak pernah menyentuh disk.
 */
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('File yang diunggah harus berformat PDF.'));
    }
  },
});

/**
 * Verifikasi publik via token cetak — sengaja TIDAK lewat authenticate, karena
 * pembaca risalah yang mengetik nomor rujukannya belumlah tentu masuk sistem.
 * Hanya menampilkan hasil verifikasi (bukan menulis).
 *
 * Token ini BUKAN isi QR. QR pada risalah membawa alamat halaman unggah tanpa
 * token; hanya jalur unggahan yang membuktikan berkas di tangan pembaca. Token
 * cetak tetap dilayani karena ia sudah tercetak pada arsip lama.
 *
 * Rate limit tetap dipasang walau jalurnya "hanya membaca": satu permintaan
 * men-token menempuh beberapa operasi mahal — pencarian baris keputusan,
 * pembacaan arsip PDF (`bytea`), hashing byte arsip, lalu pencarian + verifikasi
 * kunci e-seal. Tanpa pembatas, endpoint anonim ini dapat dipakai menghabiskan
 * CPU/IO. Dulu hanya `POST /verify-pdf` yang dibatasi, sehingga justru jalur
 * termurah bagi penyerang (GET, tanpa Turnstile, tanpa unggahan) yang terbuka.
 */
router.get('/verify', publicVerifyLimiter, asyncHandler(c.verify));

/**
 * Verifikasi publik lewat unggahan PDF.
 *
 * Jalur ini yang mengikat keabsahan pada byte berkas yang dipegang pemindai —
 * jalur token hanya memeriksa arsip server. Turnstile dipasang SESUDAH
 * `uploadPdf.single` karena permintaannya multipart: sebelum multer berjalan,
 * `req.body` masih kosong dan tokennya belum dapat dibaca (pola esign).
 */
router.post(
  '/verify-pdf',
  publicVerifyLimiter,
  uploadPdf.single('file'),
  requireTurnstile('verify-decision'),
  asyncHandler(c.verifyPdf)
);

router.use(authenticate);

/**
 * Modul dilepas pada `/foundation/decisions` dkk (lihat app.ts — dipasang
 * SEBELUM router foundation yang punya wildcard `/:id`, agar literal
 * `/decisions` tidak tertelan jadi id).
 *
 * Semua peran yayasan bisa membaca.
 *
 * **Hak MEMBUAT dan hak MEM-FINALISASI dipisah, dan itu disengaja.**
 * Sebelumnya keduanya memakai satu array `WRITE`, sehingga menambahkan
 * Pengawas agar dapat membuka keputusan yang memang kewenangannya juga diam-
 * diam memberinya hak finalisasi atas keputusan organ LAIN — hak yang tidak
 * dimaksudkan. Dua array bernama membuat masing-masing hak dapat ditinjau
 * sendiri.
 *
 *  - `CREATE` memuat Pengawas: matriks kewenangan menetapkan
 *    `pemberhentian-sementara-pengurus` kepada PENGAWAS (ps. 40–41 UU
 *    16/2001), dan organ yang berwenang tetapi tak dapat membuka rapatnya
 *    sendiri adalah kontradiksi. Kewenangan organ×jenis tetap diperiksa di
 *    service (`organMayDecide`), sehingga Pengawas hanya dapat membuat
 *    keputusan organ PENGAWAS dengan jenis yang memang miliknya — keputusan
 *    organ lain ditolak.
 *  - `FINALIZE` memuat Pengawas juga, tetapi service memperketatnya: finalizer
 *    yang bukan Super Admin/pimpinan yayasan hanya boleh menutup keputusan
 *    organ yang memuatnya sebagai anggota snapshot. Ini yang mencegah Pengawas
 *    menutup rapat Pembina/Pengurus.
 *
 * Hanya Super Admin yang menyunting aturan kuorum.
 */
const READ = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.YAYASAN_PENGAWAS,
];
const CREATE = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_PENGAWAS,
];
const FINALIZE = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_PENGAWAS,
];

/**
 * Daftar keputusan HANYA `authenticate`, tanpa `authorize(...READ)`.
 *
 * Aksesnya diperiksa di service lewat `foundationDecisionListWhere`, dan itu
 * disengaja: daftar harus konsisten dengan detail. Detail mengizinkan anggota
 * snapshot yang rolenya sudah berubah (lihat komentar di bawah), sehingga
 * daftar yang memakai `authorize(...READ)` membuat orang itu dapat membuka
 * keputusan tetapi tidak dapat menemukannya — kontradiksi yang sama, hanya
 * berpindah tempat. Filter query membatasi peran non-READ pada keputusan yang
 * memuat dirinya sebagai anggota snapshot; peran READ tetap melihat seluruh
 * daftar.
 */
router.get('/decisions', validateQuery(listFoundationDecisionsQuerySchema), asyncHandler(c.list));
router.post(
  '/decisions',
  authorize(...CREATE),
  validate(createFoundationDecisionSchema),
  asyncHandler(c.create)
);

/**
 * Detail & unduh dokumen hanya `authenticate`, TANPA `authorize(...READ)`.
 *
 * Akses bacanya diperiksa di service (`canReadFoundationDecision`), dan itu
 * disengaja: `authorize` memeriksa `req.user.roleCode` HARI INI, sedangkan
 * anggota organ terkunci pada SNAPSHOT saat keputusan dibuat. Anggota snapshot
 * yang rolenya sudah berubah tetap boleh MENANDATANGANI (rute vote juga tanpa
 * `authorize`), jadi menolaknya membaca/mengunduh dokumen yang sama adalah
 * kontradiksi. Service menerima peran READ ATAU keanggotaan snapshot.
 */
router.get('/decisions/:id', asyncHandler(c.detail));
router.get('/decisions/:id/document', asyncHandler(c.download));
/**
 * Route vote HANYA `authenticate`, tanpa `authorize`.
 *
 * Hak suara ditentukan oleh SNAPSHOT anggota yang terkunci saat keputusan
 * dibuat (`d.members.some(...)` di service), bukan oleh peran hari ini. Memasang
 * `authorize(...READ)` di sini memeriksa `req.user.roleCode` SAAT INI dan
 * menolak anggota snapshot yang rolenya sudah berubah lebih dari setahun
 * kemudian — middleware menolaknya sebelum service sempat melihat snapshot,
 * sehingga jaminan "keanggotaan immutable" tak pernah tercapai. `authenticate`
 * tetap wajib (harus ada identitas untuk dicocokkan dengan snapshot).
 *
 * `passphraseLimiter` dipasang SEBELUM `authenticate` dan controller, sama
 * seperti rute tanda tangan esign. Membuka kunci privat ber-scrypt adalah
 * operasi mahal, dan mencoba passphrase adalah permukaan tebak yang tidak
 * dibatasi oleh lockout per kunci: lockout hanya mengunci SATU kunci, sehingga
 * penyerang dengan banyak akun/sesi tetap dapat menghabiskan CPU. Middleware
 * ini membatasi percobaan lintas akun dengan satu definisi yang sama.
 */
router.post(
  '/decisions/:id/vote',
  passphraseLimiter,
  authenticate,
  validate(castFoundationVoteSchema),
  asyncHandler(c.castVote)
);
router.post(
  '/decisions/:id/finalize',
  authorize(...FINALIZE),
  validate(finalizeFoundationDecisionSchema),
  asyncHandler(c.finalize)
);

/**
 * Publikasi metadata — HANYA Super Admin.
 *
 * Rute terpisah dari finalisasi, dan itu disengaja: menerbitkan metadata
 * keputusan (judul, organ, tanggal, rekap suara) ke endpoint verifikasi anonim
 * adalah keputusan tersendiri. Bila ia menempel pada finalisasi mana pun,
 * setiap keputusan otomatis terpublikasi — termasuk yang menyangkut personalia.
 */
router.post(
  '/decisions/:id/publication',
  authorize(RoleCode.SUPER_ADMIN),
  validate(setFoundationDecisionPublicationSchema),
  asyncHandler(c.setPublication)
);

router.get('/rules', authorize(RoleCode.SUPER_ADMIN), asyncHandler(c.listRules));
router.put(
  '/rules',
  authorize(RoleCode.SUPER_ADMIN),
  validate(upsertFoundationRuleSchema),
  asyncHandler(c.upsertRule)
);

export default router;
