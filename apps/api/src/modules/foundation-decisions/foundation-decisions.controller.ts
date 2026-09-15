import { Request, Response } from 'express';
import type { ListFoundationDecisionsQuery } from '@cipansor/shared';
import { ApiResponse } from '@/utils/response';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { FoundationDecisionService } from './foundation-decisions.service';

/** Semua peran yang boleh membaca daftar/detail keputusan (halaman internal). */
export const FoundationDecisionController = {
  /** Buat draf keputusan (buka voting). */
  async create(req: Request) {
    const decisionId = await FoundationDecisionService.create(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.body
    );
    return ApiResponse.success({ decisionId }, 'Keputusan dibuat dan voting dibuka.');
  },

  /** Daftar keputusan (paginated). */
  async list(req: Request, res: Response) {
    const query = (res.locals.validatedQuery || req.query) as ListFoundationDecisionsQuery;
    const result = await FoundationDecisionService.list(query);
    return ApiResponse.success(result.items, 'Daftar keputusan diterima.', {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    });
  },

  /** Detail keputusan. */
  async detail(req: Request) {
    const result = await FoundationDecisionService.detail(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id
    );
    return ApiResponse.success(result);
  },

  /** Memberi suara + tanda tangan digital. */
  async castVote(req: Request) {
    const result = await FoundationDecisionService.castVote(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id,
      req.body
    );
    return ApiResponse.success(result, 'Suara Anda tercatat.');
  },

  /** Finalisasi manual bila kuorum sudah tercapai. */
  async finalize(req: Request) {
    const result = await FoundationDecisionService.finalize(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.params.id
    );
    return ApiResponse.success(result, 'Keputusan difinalisasi.');
  },

  /** Daftar aturan kuorum (SUPER_ADMIN). */
  async listRules(_req: Request, res: Response) {
    const result = await FoundationDecisionService.listRules();
    return ApiResponse.success(result);
  },

  /** Ubah aturan kuorum (SUPER_ADMIN). */
  async upsertRule(req: Request, res: Response) {
    const result = await FoundationDecisionService.upsertRule(
      { id: req.user!.id, roleCode: req.user!.roleCode },
      req.body
    );
    return ApiResponse.success(result, 'Aturan kuorum disimpan.');
  },

  /** Verifikasi keputusan akhir lewat token (QR/publik). */
  async verify(req: Request) {
    const token = String(req.query.token ?? '');
    if (!token) throw Errors.badRequest('Token verifikasi wajib diisi.');
    const result = await FoundationDecisionService.verifyByToken(token);
    return ApiResponse.success(result);
  },

  /** Unduh PDF risalah final (keputusan sah). */
  async download(req: Request, res: Response) {
    const doc = await prisma.foundationDecisionDocument.findUnique({
      where: { decisionId: req.params.id },
      include: { decision: { select: { status: true } } },
    });
    if (!doc || doc.decision.status !== 'APPROVED') {
      throw Errors.notFound('Dokumen final keputusan tidak ditemukan atau belum final.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="risalah-${req.params.id.slice(0, 8)}.pdf"`
    );
    res.send(doc.bytes);
  },
};
