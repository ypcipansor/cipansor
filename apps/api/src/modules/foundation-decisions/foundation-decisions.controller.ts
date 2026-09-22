import { Request, Response } from 'express';
import type { ListFoundationDecisionsQuery } from '@cipansor/shared';
import { ApiResponse } from '@/utils/response';
import { Errors } from '@/middleware/error';
import { FoundationDecisionService } from './foundation-decisions.service';

/** Semua peran yang boleh membaca daftar/detail keputusan (halaman internal). */
export const FoundationDecisionController = {
  /** Buat draf keputusan (buka voting). */
  async create(req: Request, res: Response) {
    const decisionId = await FoundationDecisionService.create(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.body
    );
    return res
      .status(201)
      .json(ApiResponse.success({ decisionId }, 'Keputusan dibuat dan voting dibuka.'));
  },

  /** Daftar keputusan (paginated). */
  async list(req: Request, res: Response) {
    const query = (res.locals.validatedQuery || req.query) as ListFoundationDecisionsQuery;
    const result = await FoundationDecisionService.list(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      query
    );
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
    const result = await FoundationDecisionService.createOptions({
      id: req.user!.id,
      roleCode: req.user!.roleCode,
    });
    return res.json(ApiResponse.success(result));
  },

  /** Detail keputusan. */
  async detail(req: Request, res: Response) {
    const result = await FoundationDecisionService.detail(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id
    );
    return res.json(ApiResponse.success(result));
  },

  /** Memberi suara + tanda tangan digital. */
  async castVote(req: Request, res: Response) {
    const result = await FoundationDecisionService.castVote(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id,
      req.body
    );
    return res.json(ApiResponse.success(result, 'Suara Anda tercatat.'));
  },

  /** Finalisasi manual bila kuorum sudah tercapai. */
  async finalize(req: Request, res: Response) {
    const result = await FoundationDecisionService.finalize(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id
    );
    return res.json(ApiResponse.success(result, 'Keputusan difinalisasi.'));
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
      { id: req.user!.id, roleCode: req.user!.roleCode },
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
    const result = await FoundationDecisionService.upsertRule(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.body
    );
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
   */
  async verifyPdf(req: Request, res: Response) {
    const file = (req as Request & { file?: { buffer?: Buffer } }).file;
    if (!file || !file.buffer) {
      throw Errors.badRequest('Berkas PDF wajib diunggah.');
    }
    const result = await FoundationDecisionService.verifyByPdfBuffer(file.buffer);
    return res.json(ApiResponse.success(result));
  },

  /** Unduh PDF risalah final (keputusan sah). */
  async download(req: Request, res: Response) {
    const doc = await FoundationDecisionService.getFinalDocument(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id
    );
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
