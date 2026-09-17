import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../foundation-decisions.service', () => ({
  FoundationDecisionService: {
    create: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    castVote: vi.fn(),
    finalize: vi.fn(),
    listRules: vi.fn(),
    upsertRule: vi.fn(),
    verifyByToken: vi.fn(),
    verifyByPdfBuffer: vi.fn(),
    getFinalDocument: vi.fn(),
  },
}));

import { FoundationDecisionController as controller } from '../foundation-decisions.controller';
import { FoundationDecisionService } from '../foundation-decisions.service';

type MockRes = Response & {
  statusCode: number;
  jsonPayload: unknown;
  headers: Record<string, string>;
  sent: unknown;
};

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { id: 'u1', roleCode: 'SUPER_ADMIN' },
    ...overrides,
  } as unknown as Request;
  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    headers: {} as Record<string, string>,
    sent: undefined as unknown,
    locals: {},
    status(code: number) {
      (this as unknown as MockRes).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as unknown as MockRes).jsonPayload = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      (this as unknown as MockRes).headers[name] = value;
      return this;
    },
    send(payload: unknown) {
      (this as unknown as MockRes).sent = payload;
      return this;
    },
  } as unknown as MockRes;
  return { req, res };
}

async function run(handler: any, req: Request, res: Response) {
  const next = vi.fn();
  await handler(req, res, next);
  return next;
}

/**
 * Regresi: setiap handler WAJIB benar-benar menulis respons.
 *
 * Sempat semua endpoint modul ini hang 30 detik (sampai klien timeout) karena
 * handler `return ApiResponse.success(...)` — mengembalikan objek tanpa
 * memanggil `res.json`. Express tidak mengirim apa pun, jadi tidak ada galat
 * yang muncul di log: koneksi hanya menggantung. Test ini mengunci kontrak
 * bahwa tiap handler menutup responsnya.
 */
describe('foundation-decisions controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create: mengirim 201 + decisionId ke body respons', async () => {
    (FoundationDecisionService.create as any).mockResolvedValue('d1');
    const { req, res } = mockReqRes({ body: { organType: 'PEMBINA' } as any });
    await run(controller.create, req, res);
    expect((res as any).statusCode).toBe(201);
    expect((res as any).jsonPayload?.data?.decisionId).toBe('d1');
  });

  it('list: mengirim items + pagination', async () => {
    (FoundationDecisionService.list as any).mockResolvedValue({
      items: [{ id: 'd1' }],
      total: 1,
      page: 1,
      limit: 10,
    });
    const { req, res } = mockReqRes();
    await run(controller.list, req, res);
    expect((res as any).jsonPayload?.data).toEqual([{ id: 'd1' }]);
    expect((res as any).jsonPayload?.pagination?.total).toBe(1);
  });

  it('detail: mengirim DTO detail', async () => {
    (FoundationDecisionService.detail as any).mockResolvedValue({ id: 'd1', status: 'VOTING' });
    const { req, res } = mockReqRes({ params: { id: 'd1' } as any });
    await run(controller.detail, req, res);
    expect((res as any).jsonPayload?.data?.status).toBe('VOTING');
  });

  it('castVote: meneruskan body dan mengirim hasil suara', async () => {
    (FoundationDecisionService.castVote as any).mockResolvedValue({ voteId: 'v1' });
    const { req, res } = mockReqRes({
      params: { id: 'd1' } as any,
      body: { choice: 'APPROVE' } as any,
    });
    await run(controller.castVote, req, res);
    expect(FoundationDecisionService.castVote).toHaveBeenCalledWith(
      { id: 'u1', roleCode: 'SUPER_ADMIN' },
      'd1',
      { choice: 'APPROVE' }
    );
    expect((res as any).jsonPayload?.data?.voteId).toBe('v1');
  });

  it('finalize: mengirim hasil finalisasi', async () => {
    (FoundationDecisionService.finalize as any).mockResolvedValue({ outcome: 'APPROVED' });
    const { req, res } = mockReqRes({ params: { id: 'd1' } as any });
    await run(controller.finalize, req, res);
    expect((res as any).jsonPayload?.data?.outcome).toBe('APPROVED');
  });

  it('listRules: mengirim daftar aturan', async () => {
    (FoundationDecisionService.listRules as any).mockResolvedValue([{ id: 'r1' }]);
    const { req, res } = mockReqRes();
    await run(controller.listRules, req, res);
    expect((res as any).jsonPayload?.data).toEqual([{ id: 'r1' }]);
  });

  it('upsertRule: meneruskan body tervalidasi dan mengirim simpanan', async () => {
    (FoundationDecisionService.upsertRule as any).mockResolvedValue({ id: 'r1' });
    const { req, res } = mockReqRes({ body: { organType: 'PEMBINA' } as any });
    await run(controller.upsertRule, req, res);
    expect(FoundationDecisionService.upsertRule).toHaveBeenCalledWith(
      { id: 'u1', roleCode: 'SUPER_ADMIN' },
      { organType: 'PEMBINA' }
    );
    expect((res as any).jsonPayload?.data?.id).toBe('r1');
  });

  it('verify: menolak token kosong sebelum menyentuh service', async () => {
    // Handler async melempar; `asyncHandler` di rute yang meneruskannya ke
    // middleware galat, jadi di sini penolakannya yang diperiksa.
    const { req, res } = mockReqRes({ query: {} as any });
    await expect(controller.verify(req, res)).rejects.toThrow('Token verifikasi wajib diisi.');
    expect(FoundationDecisionService.verifyByToken).not.toHaveBeenCalled();
  });

  it('verify: mengirim hasil verifikasi untuk token yang ada', async () => {
    (FoundationDecisionService.verifyByToken as any).mockResolvedValue({
      found: true,
      decisionId: 'd1',
    });
    const { req, res } = mockReqRes({ query: { token: 'tok' } as any });
    await run(controller.verify, req, res);
    expect((res as any).jsonPayload?.data?.found).toBe(true);
  });

  it('download: mengambil dokumen dari service dan mengirim byte PDF', async () => {
    const bytes = Buffer.from('%PDF-1.7');
    (FoundationDecisionService.getFinalDocument as any).mockResolvedValue({ bytes });
    const { req, res } = mockReqRes({ params: { id: 'abcdef12-0000' } as any });
    await run(controller.download, req, res);
    // Peminta diteruskan sebagai argumen pertama: akses bacanya diperiksa di
    // service (anggota snapshot tetap boleh mengunduh walau rolenya berubah).
    expect(FoundationDecisionService.getFinalDocument).toHaveBeenCalledWith(
      { id: 'u1', roleCode: 'SUPER_ADMIN' },
      'abcdef12-0000'
    );
    expect((res as any).headers['Content-Type']).toBe('application/pdf');
    expect((res as any).sent).toBe(bytes);
  });

  /**
   * Verifikasi unggahan PDF memakai `req.file.buffer` dari multer.
   *
   * Inilah yang membedakan jalur ini dari jalur token: byte yang dikirim
   * pengunjung diteruskan apa adanya ke service untuk di-hash dan dibandingkan
   * dengan digest tertanda-tangan. Bila handler diam-diam memakai arsip server,
   * PDF palsu akan lolos lagi.
   */
  it('verifyPdf: menolak permintaan tanpa berkas', async () => {
    const { req, res } = mockReqRes({} as any);
    await expect(controller.verifyPdf(req, res)).rejects.toThrow(/Berkas PDF wajib diunggah/);
    expect(FoundationDecisionService.verifyByPdfBuffer).not.toHaveBeenCalled();
  });

  it('verifyPdf: meneruskan byte unggahan ke service', async () => {
    const buffer = Buffer.from('%PDF-1.7 berkas pemindai');
    (FoundationDecisionService.verifyByPdfBuffer as any).mockResolvedValue({
      found: true,
      isValid: true,
    });
    const { req, res } = mockReqRes({ file: { buffer } } as any);
    await run(controller.verifyPdf, req, res);
    expect(FoundationDecisionService.verifyByPdfBuffer).toHaveBeenCalledWith(buffer);
    expect((res as any).jsonPayload?.data?.isValid).toBe(true);
  });
});