import { Request, Response } from 'express';
import type { ListFoundationDecisionsQuery } from '@cipansor/shared';
import { ApiResponse } from '@/utils/response';
import { Errors } from '@/middleware/error';
import { FoundationDecisionService } from './foundation-decisions.service';

/**
 * Penanda awal setiap PDF: `%PDF-` (ISO 32000 §7.5.2). Dipakai untuk menolak
 * berkas yang hanya MENGAKU PDF lewat MIME/nama. Empat byte pertama saja —
 * nomor versinya (`1.7`, `2.0`) tidak dipatok.
 */
const PDF_MAGIC = Buffer.from('%PDF-');

/** Benarkah byte ini dibuka dengan penanda PDF? */
function looksLikePdf(buffer: Buffer): boolean {
  return (
    buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  );
}

/**
 * Finding 2 — bentuk aktor yang diteruskan ke service.
 *
 *  mengisi  dengan SELURUH peran aktif
 * dari basis data, tetapi handler dulu hanya meneruskan `{ id, roleCode }`
 * (peran PRIMER saja), sehingga pengguna yang jabatan yayasannya bukan peran
 * utama (mis. `roleCode=GURU` utama + `YAYASAN_KETUA` sekunder) ditolak di
 * list/detail/download — dan, bila service menilai lewat `actorRoleCodes`,
 * juga di create/finalize/cancel. Helper ini meneruskan keduanya supaya
 * keputusan otorisasi dinilai atas seluruh peran, bukan satu klaim.
 */
function actorFrom(req: Request) {
  return { id: req.user!.id, roleCode: req.user!.roleCode, roleCodes: req.user!.roleCodes };
}

export const FoundationDecisionController = {
  /** Buat draf keputusan (buka voting). */
  async create(req: Request, res: Response) {
    const decisionId = await FoundationDecisionService.create(actorFrom(req), req.body);
    return res
      .status(201)
      .json(ApiResponse.success({ decisionId }, 'Keputusan dibuat dan voting dibuka.'));
  },

  /** Daftar keputusan (paginated). */
  async list(req: Request, res: Response) {
    const query = (res.locals.validatedQuery || req.query) as ListFoundationDecisionsQuery;
    const result = await FoundationDecisionService.list(actorFrom(req), query);
    return res.json(
      ApiResponse.success(result.items, 'Daftar keputusan diterima.', {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      })
    );
  },

  /** Organ & jenis keputusan yang boleh dibuat aktor (gerbang form create). */
  async createOptions(req: Request, res: Response) {
    const result = await FoundationDecisionService.createOptions(actorFrom(req));
    return res.json(ApiResponse.success(result));
  },

  /** Detail keputusan. */
  async detail(req: Request, res: Response) {
    const result = await FoundationDecisionService.detail(actorFrom(req), req.params.id);
    return res.json(ApiResponse.success(result));
  },

  /** Memberi suara + tanda tangan digital. */
  async castVote(req: Request, res: Response) {
    const result = await FoundationDecisionService.castVote(
      actorFrom(req),
      req.params.id,
      req.body
    );
    return res.json(ApiResponse.success(result, 'Suara Anda tercatat.'));
  },

  /** Finalisasi manual bila kuorum sudah tercapai. */
  async finalize(req: Request, res: Response) {
    const result = await FoundationDecisionService.finalize(actorFrom(req), req.params.id);
    return res.json(ApiResponse.success(result, 'Keputusan difinalisasi.'));
  },

  /** Batalkan rapat yang kuorum hadirnya tak pernah tercapai. */
  async cancel(req: Request, res: Response) {
    const result = await FoundationDecisionService.cancel(actorFrom(req), req.params.id);
    return res.json(ApiResponse.success(result, 'Rapat dibatalkan karena kuorum tidak tercapai.'));
  },

  /**
   * Ubah klasifikasi publikasi metadata (SUPER_ADMIN).
   *
   * Ini yang membuka penyensoran verifikasi anonim: selama PRIVATE (bawaan),
   * endpoint verifikasi publik hanya menyatakan keabsahan, tanpa membocorkan
   * subject/organ/tanggal/rekap suara.
   */
  async setPublication(req: Request, res: Response) {
    const result = await FoundationDecisionService.setPublication(
      actorFrom(req),
      req.params.id,
      req.body.publication
    );
    return res.json(ApiResponse.success(result, 'Klasifikasi publikasi keputusan diperbarui.'));
  },

  /** Daftar aturan kuorum (SUPER_ADMIN). */
  async listRules(_req: Request, res: Response) {
    const result = await FoundationDecisionService.listRules();
    return res.json(ApiResponse.success(result));
  },

  /** Ubah aturan kuorum (SUPER_ADMIN). */
  async upsertRule(req: Request, res: Response) {
    const result = await FoundationDecisionService.upsertRule(actorFrom(req), req.body);
    return res.json(ApiResponse.success(result, 'Aturan kuorum disimpan.'));
  },

  /** Verifikasi keputusan akhir lewat nomor rujukan/token cetak (publik). */
  async verify(req: Request, res: Response) {
    const token = String(req.query.token ?? '');
    if (!token) throw Errors.badRequest('Token verifikasi wajib diisi.');
    const result = await FoundationDecisionService.verifyByToken(token);
    return res.json(ApiResponse.success(result));
  },

  /**
   * Verifikasi publik lewat berkas PDF yang diunggah.
   *
   * Jalur ini yang benar-benar mengikat keabsahan pada dokumen yang dipegang
   * pembaca: hash byte unggahan dibandingkan dengan digest yang ditandatangani
   * e-seal. Jalur token hanya memeriksa arsip server, sehingga PDF berisi token
   * asli yang isinya diganti tetap lolos. Turnstile sudah dipasang di rute,
   * sebelum handler ini.
   *
   * **Finding B4.** `fileFilter` multer hanya melihat `mimetype` yang DIKIRIM
   * klien dan akhiran `.pdf` pada namanya — keduanya dapat dipalsukan dengan
   * `curl -F 'file=@payload.exe;type=application/pdf;filename=x.pdf'`. Isi
   * diperiksa di sini lewat MAGIC BYTES (`%PDF-` di awal berkas), tepat sebelum
   * byte-nya di-hash; PDF yang sah tidak terpengaruh karena risalah kita sendiri
   * selalu dibuka dengan penanda itu.
   */
  async verifyPdf(req: Request, res: Response) {
    const file = (req as Request & { file?: { buffer?: Buffer } }).file;
    if (!file || !file.buffer) {
      throw Errors.badRequest('Berkas PDF wajib diunggah.');
    }
    if (!looksLikePdf(file.buffer)) {
      throw Errors.badRequest(
        'Isi berkas bukan PDF yang sah. Unggah berkas risalah asli (byte-identik), bukan hasil pindai atau berkas lain yang dinamai .pdf.'
      );
    }
    const result = await FoundationDecisionService.verifyByPdfBuffer(file.buffer);
    return res.json(ApiResponse.success(result));
  },

  /** Unduh PDF risalah final (keputusan sah). */
  async download(req: Request, res: Response) {
    const doc = await FoundationDecisionService.getFinalDocument(actorFrom(req), req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="risalah-${req.params.id.slice(0, 8)}.pdf"`
    );
    // Kolom `Bytes` Prisma adalah `Uint8Array`. Konversi eksplisit ke `Buffer`
    // menjaga jalur ini tetap mengirim byte biner mentah apa pun versi Express:
    // `res.send` yang menerima non-Buffer (objek) akan jatuh ke `res.json` dan
    // mengirim serialisasi JSON alih-alih PDF. `Buffer` selalu dikenali sebagai
    // badan biner oleh Express.
    res.send(Buffer.from(doc.bytes));
  },
};
