import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { RoleCode } from '@prisma/client';
import { FoundationDecisionController as c } from './foundation-decisions.controller';
import { FoundationDecisionService } from './foundation-decisions.service';
import { authenticate, expandRoleCodes } from '@/middleware/auth';
import { FOUNDATION_FINALIZE_ROUTE_ROLES } from '@/utils/foundation-authority';
import { Errors, asyncHandler, validate, validateQuery } from '@/middleware/error';
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
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // DUA syarat, bukan OR. Versi OR menerima berkas yang mengaku PDF hanya
    // dari SALAH satu sinyal: `text/plain` bernama `x.pdf` lolos lewat akhiran
    // nama, dan `application/pdf` bernama `x.txt` lolos lewat mimetype.
    // `application/octet-stream` tetap diterima karena banyak peramban/klien
    // mengirim tipe generik untuk PDF yang sah - cek magic bytes `%PDF-` di
    // controller yang menjadi penentu akhirnya.
    const mimetype = (file.mimetype || '').toLowerCase();
    const mimetypeOk =
      mimetype === '' || mimetype === 'application/pdf' || mimetype === 'application/octet-stream';
    const nameOk = file.originalname.toLowerCase().endsWith('.pdf');
    if (mimetypeOk && nameOk) {
      cb(null, true);
    } else {
      // `Errors.badRequest` (ApiError), BUKAN `Error` telanjang. Sebuah Error
      // biasa jatuh ke cabang generik penangan galat dan dijawab 500 "Internal
      // server error": berkas yang salah format dilaporkan sebagai kerusakan
      // peladen. ApiError membuatnya 400 yang stabil — dan stempel waktu serta
      // stack internal tidak ikut bocor ke klien publik.
      cb(Errors.badRequest('File yang diunggah harus berformat PDF.'));
    }
  },
});

/**
 * Jalankan multer dan petakan galatnya ke respons klien yang stabil.
 *
 * `fileFilter` di atas menangani tipe yang ditolak, tetapi multer juga melempar
 * `MulterError`-nya sendiri — terutama `LIMIT_FILE_SIZE` untuk berkas melebihi
 * batas. Tanpa pemetaan di sini galat itu mencapai penangan galat global dan
 * menjadi 500, sehingga unggahan yang terlalu besar terlihat seperti
 * kegagalan peladen. 400, bukan 500: permintaannya yang tidak sah.
 */
function uploadSinglePdf(req: Request, res: Response, next: NextFunction) {
  uploadPdf.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(Errors.badRequest('Ukuran berkas melebihi batas 10 MB.'));
        return;
      }
      next(Errors.badRequest(err.message));
      return;
    }
    next(err);
  });
}

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
 * multer karena permintaannya multipart: sebelum multer berjalan, `req.body`
 * masih kosong dan tokennya belum dapat dibaca (pola esign).
 */
router.post(
  '/verify-pdf',
  publicVerifyLimiter,
  uploadSinglePdf,
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
const FINALIZE = [...FOUNDATION_FINALIZE_ROUTE_ROLES];

/**
 * Gerbang peran untuk rute TULIS: lolos bila SALAH SATU peran AKTUAL aktor
 * (hasil `refreshActorRoles` dari basis data) ada di daftar yang diizinkan.
 *
 * `authorize(...)` global hanya memeriksa `req.user.roleCode` — peran PRIMER.
 * Pejabat yang jabatan yayasannya BUKAN peran utama (mis. `GURU` primer +
 * `YAYASAN_KETUA` sekunder) ditolak walaupun `refreshActorRoles` sudah mengisi
 * seluruh perannya di `req.user.roleCodes`. Peran organ adalah properti
 * keanggotaan, bukan properti "jabatan utama": seseorang yang memegang
 * `YAYASAN_PENGAWAS` sebagai peran sekunder tetap Pengawas dan berhak
 * menandatangani, memfinalisasi, dan membatalkan rapat organnya.
 *
 * Middleware ini SENGAJA lokal (tidak mengubah `authorize` global, yang dipakai
 * puluhan modul lain) dan memakai ulang `expandRoleCodes` yang sama sehingga
 * benturan nama peran legacy tetap tertangani. Bila `roleCodes` belum diisi
 * (rute tanpa `refreshActorRoles`) ia JATUH KEMBALI ke `roleCode` tunggal —
 * tidak pernah melonggarkan gerbang yang tidak menyegarkan peran.
 */
function authorizeAnyRole(...allowedRoleCodes: string[]) {
  const expanded = expandRoleCodes(allowedRoleCodes);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized());
    const roles =
      req.user.roleCodes && req.user.roleCodes.length > 0
        ? req.user.roleCodes
        : [req.user.roleCode];
    if (!roles.some((code) => expanded.includes(code))) {
      return next(Errors.forbidden('Insufficient permissions'));
    }
    next();
  };
}

/**
 * Finding B2/B3 — `authorize(...)` hanya memercayai klaim token.
 *
 * `req.user.roleCode` disematkan di token AKSES saat login/refresh dan TIDAK
 * dicabut saat peran orang dicabut, dinonaktifkan, atau kedaluwarsa. Token
 * akses hidup 15 menit (produksi), jadi selama jendela itu mantan Ketua
 * Yayasan masih lolos `authorize(YAYASAN_KETUA)` di rute tulis, dan mantan
 * Pembina masih lolos cek peran READ global di service — tanpa menyentuh basis
 * data lagi.
 *
 * Middleware ini menyegarkan peran dari basis data pada SETIAP permintaan tulis
 * dan MENGGANTI `req.user.roleCode`/`roleCodes` dengan keadaan terkini. Bila
 * akun telah dinonaktifkan/dihapus, atau tak lagi memegang peran aktif mana
 * pun, ia menolak lebih dulu. Dengan begitu seluruh gerbang di bawahnya —
 * `authorize` di rute maupun `canFinalizeDecision`/`canReadFoundationDecision`
 * di service — menilai peran HARI INI, bukan peran yang dibekukan di token.
 *
 * Dipasang pada rute TULIS (create, vote, finalize, cancel, publication,
 * rules). Rute BACA sengaja tidak memakainya: hak baca memakai jalur SNAPSHOT
 * yang memang harus tetap berlaku bagi mantan anggota (lihat komentar rute
 * detail), dan jalur peran READ di sana membaca peran aktual lewat
 * `roleCodes` yang juga diisi middleware ini ketika ada.
 */
async function refreshActorRoles(req: Request, _res: Response, next: NextFunction) {
  try {
    const fresh = await FoundationDecisionService.currentActiveRoleCodes(req.user!.id);
    if (fresh === null) {
      throw Errors.forbidden(
        'Akun Anda tidak aktif, telah dihapus, atau tidak lagi memegang peran aktif, sehingga tidak dapat melakukan tindakan tata kelola ini.'
      );
    }
    req.user!.roleCode = fresh.primary;
    req.user!.roleCodes = fresh.all;
    next();
  } catch (err) {
    next(err);
  }
}

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
router.get(
  '/decisions',
  refreshActorRoles,
  validateQuery(listFoundationDecisionsQuerySchema),
  asyncHandler(c.list)
);
/**
 * Organ & jenis keputusan yang boleh dibuat aktor — gerbang form create.
 *
 * Didaftarkan SEBELUM `/decisions/:id` agar "create-options" tidak tertelan
 * sebagai id keputusan. Dibatasi `CREATE` karena jawabannya adalah kebijakan
 * pembuatan itu sendiri.
 */
router.get(
  '/decisions/create-options',
  refreshActorRoles,
  authorizeAnyRole(...CREATE),
  asyncHandler(c.createOptions)
);
router.post(
  '/decisions',
  refreshActorRoles,
  authorizeAnyRole(...CREATE),
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
router.get('/decisions/:id', refreshActorRoles, asyncHandler(c.detail));
router.get('/decisions/:id/document', refreshActorRoles, asyncHandler(c.download));
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
  refreshActorRoles,
  validate(castFoundationVoteSchema),
  asyncHandler(c.castVote)
);
router.post(
  '/decisions/:id/finalize',
  refreshActorRoles,
  authorizeAnyRole(...FINALIZE),
  validate(finalizeFoundationDecisionSchema),
  asyncHandler(c.finalize)
);

/**
 * Pembatalan rapat yang kuorum hadirnya tak pernah tercapai.
 *
 * Memakai gerbang `FINALIZE` yang sama: siapa pun yang boleh menutup rapat
 * organ itu boleh menyatakannya batal, dan service memperketatnya dengan
 * definisi yang sama (`canFinalizeDecision` + kuorum hadir memang belum
 * terpenuhi). Tanpa aksi ini, rapat yang gagal kuorum tergantung VOTING tanpa
 * akhir — satu-satunya "jalan keluar" adalah menandainya REJECTED, yang
 * menyatakan materi ditolak padahal rapat tidak memutus apa pun.
 */
router.post(
  '/decisions/:id/cancel',
  refreshActorRoles,
  authorizeAnyRole(...FINALIZE),
  asyncHandler(c.cancel)
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
  refreshActorRoles,
  authorizeAnyRole(RoleCode.SUPER_ADMIN),
  validate(setFoundationDecisionPublicationSchema),
  asyncHandler(c.setPublication)
);

router.get(
  '/rules',
  refreshActorRoles,
  authorizeAnyRole(RoleCode.SUPER_ADMIN),
  asyncHandler(c.listRules)
);
router.put(
  '/rules',
  refreshActorRoles,
  authorizeAnyRole(RoleCode.SUPER_ADMIN),
  validate(upsertFoundationRuleSchema),
  asyncHandler(c.upsertRule)
);

export default router;
