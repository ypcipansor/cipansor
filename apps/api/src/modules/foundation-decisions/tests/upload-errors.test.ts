import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import express from 'express';
import request from 'supertest';
import router from '../foundation-decisions.routes';
import { errorHandler } from '@/middleware/error';
import { FoundationDecisionService } from '../foundation-decisions.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return app;
}

/**
 * Regresi BUG (finding C) — unggahan tidak sah pada `POST /verify-pdf`.
 *
 * `fileFilter` dulu memanggil `cb(new Error(...))`. `Error` telanjang tidak
 * punya `statusCode`, jadi penangan galat global jatuh ke cabang generik dan
 * menjawab **500 Internal server error** — berkas yang salah format dilaporkan
 * sebagai kerusakan peladen. `MulterError` (mis. `LIMIT_FILE_SIZE`) punya nasib
 * yang sama. Keduanya harus menjadi 4xx yang stabil, sementara PDF yang sah
 * tetap diterima.
 *
 * Turnstile mati secara bawaan (tanpa `TURNSTILE_SECRET_KEY`), jadi gerbangnya
 * meloloskan permintaan setelah multer — yang diuji di sini adalah pemetaan
 * galat multer, bukan gerbang anti-botnya.
 */
describe('foundation-decisions POST /verify-pdf — pemetaan galat unggahan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('MIME yang tidak diizinkan → 400, bukan 500', async () => {
    const res = await request(buildApp())
      .post('/verify-pdf')
      .attach('file', Buffer.from('bukan pdf'), {
        filename: 'catatan.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
    // Pesan yang berguna, bukan "Internal server error".
    expect(res.body?.error?.message).toMatch(/PDF/i);
  });

  it('berkas melebihi 10 MB → 400 dengan pesan ukuran, bukan 500', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(buildApp())
      .post('/verify-pdf')
      .attach('file', big, { filename: 'besar.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
    expect(res.body?.error?.message).toMatch(/10 MB/i);
  });

  it('permintaan tanpa berkas → 400 dengan kode BAD_REQUEST', async () => {
    const res = await request(buildApp()).post('/verify-pdf').field('turnstileToken', 'x');
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
  });

  it('PDF yang sah tetap diterima dan diteruskan ke service', async () => {
    const spy = vi
      .spyOn(FoundationDecisionService, 'verifyByPdfBuffer')
      .mockResolvedValue({ found: false } as never);

    const res = await request(buildApp())
      .post('/verify-pdf')
      .attach('file', Buffer.from('%PDF-1.7 isi'), {
        filename: 'risalah.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    // Handler menerima byte unggahan, bukan jalur berkas.
    expect((spy.mock.calls[0][0] as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('jumlah berkas melebihi batas → 400 (bukan 500)', async () => {
    const res = await request(buildApp())
      .post('/verify-pdf')
      .attach('file', Buffer.from('%PDF-1.7 a'), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      })
      .attach('file', Buffer.from('%PDF-1.7 b'), {
        filename: 'b.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
  });
});
