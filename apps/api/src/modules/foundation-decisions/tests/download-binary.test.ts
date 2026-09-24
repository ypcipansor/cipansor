import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  // Finding B2/B3: `refreshActorRoles` reads the actor's CURRENT roles from the
  // database before every governance route, so route-level tests need these two
  // models. They return an active Pembina — enough to pass the refresh gate.
  prisma: {
    user: { findFirst: async () => ({ id: 'u1' }) },
    userRoleAssignment: {
      findMany: async () => [{ isPrimary: true, role: { code: 'YAYASAN_PEMBINA' } }],
    },
  },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import express from 'express';
import request from 'supertest';
import router from '../foundation-decisions.routes';
import { errorHandler, Errors } from '@/middleware/error';
import { generateAccessToken } from '@/lib/jwt';
import { FoundationDecisionService } from '../foundation-decisions.service';

/**
 * Regresi BUG SEVERE — unduhan risalah harus mengirim byte PDF, bukan JSON.
 *
 * `FoundationDecisionDocument.bytes` adalah kolom `Bytes` Prisma, yang
 * dikembalikan sebagai `Uint8Array` — bukan `Buffer`. `res.send` memperlakukan
 * `Uint8Array` secara berbeda antar versi Express: yang tidak mengenalinya
 * sebagai badan biner jatuh ke `res.json`, sehingga PDF terkirim sebagai JSON
 * array angka sementara `Content-Type` tetap `application/pdf`. Klien menerima
 * berkas yang tidak dapat dibuka tanpa satu pun galat peladen.
 *
 * Handler menormalkan ke `Buffer`. Suite ini mengujinya lewat HTTP sungguhan
 * (bukan mock `res`), sehingga membuktikan apa yang benar-benar melintasi kabel:
 * status, tipe konten, awalan `%PDF-`, ketiadaan bentuk JSON, dan byte identik
 * dengan arsip.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return app;
}

const token = generateAccessToken({
  id: 'u1',
  sub: 'u1',
  email: 'x@y.z',
  roleId: 'r1',
  roleCode: 'SUPER_ADMIN',
  unitId: null,
  permissions: [],
  role: 'SUPER_ADMIN',
} as never);

/** Arsip yang menyerupai PDF nyata: header, isi biner, dan byte non-UTF-8. */
function archivePdf(): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.from([0x00, 0xff, 0x10, 0x80, 0xc3, 0x28]),
    Buffer.from('\n%%EOF\n'),
  ]);
}

describe('foundation-decisions GET /decisions/:id/document — byte PDF', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('mengirim byte PDF identik sebagai badan biner, bukan JSON', async () => {
    const archive = archivePdf();
    // Persis seperti Prisma: `Uint8Array`, bukan `Buffer`.
    vi.spyOn(FoundationDecisionService, 'getFinalDocument').mockResolvedValue({
      bytes: new Uint8Array(archive),
    } as never);

    const res = await request(buildApp())
      .get('/decisions/abcdef12-0000/document')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);

    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    // Body dimulai dengan header PDF, bukan `{`/`[`.
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Bukan serialisasi JSON: array angka `{"0":37,...}` atau `[37,80,...]`.
    const asText = body.toString('utf8').trimStart();
    expect(asText.startsWith('{')).toBe(false);
    expect(asText.startsWith('[')).toBe(false);
    // Byte respons IDENTIK dengan byte arsip, termasuk yang bukan UTF-8.
    expect(body.equals(archive)).toBe(true);
  });

  it('mempertahankan byte non-UTF-8 apa adanya', async () => {
    const archive = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x80]);
    vi.spyOn(FoundationDecisionService, 'getFinalDocument').mockResolvedValue({
      bytes: new Uint8Array(archive),
    } as never);

    const res = await request(buildApp())
      .get('/decisions/deadbeef-0000/document')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(archive)).toBe(true);
  });

  it('404 bila dokumen belum final', async () => {
    vi.spyOn(FoundationDecisionService, 'getFinalDocument').mockRejectedValue(
      Errors.notFound('Dokumen final keputusan tidak ditemukan atau belum final.')
    );

    const res = await request(buildApp())
      .get('/decisions/abcdef12-0000/document')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body?.success).toBe(false);
  });

  it('tanpa sesi tetap 401, bukan byte dokumen', async () => {
    const spy = vi.spyOn(FoundationDecisionService, 'getFinalDocument');
    const res = await request(buildApp()).get('/decisions/abcdef12-0000/document');
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
