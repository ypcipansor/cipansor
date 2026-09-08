import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { requireTurnstile } from './turnstile';
import { validate } from './error';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-kunci-uji');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * Jawaban siteverify yang lengkap.
 *
 * `hostname` dan `action` ikut karena keduanya sekarang diperiksa: sebuah
 * jawaban `success: true` tanpa hostname yang terdaftar ditolak, jadi mock
 * yang hanya membawa `success` akan menguji cabang yang salah.
 */
function cloudflareSays(success: boolean, codes: string[] = [], action = AKSI) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      success,
      'error-codes': codes,
      hostname: 'portal.cipansor.or.id',
      action,
    }),
  });
}

/** Tindakan yang dipakai seluruh berkas ini; nilainya tidak penting, kecocokannya yang penting. */
const AKSI = 'login';

/** Jalankan middleware-nya dan tunggu sampai `next` benar-benar dipanggil. */
function run(body: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const req = { body, ip: '203.0.113.7', path: '/uji' } as unknown as Request;
    const next = ((err?: unknown) => resolve(err)) as NextFunction;
    requireTurnstile(AKSI)(req, {} as Response, next);
  });
}

describe('requireTurnstile', () => {
  it('meneruskan permintaan yang tokennya diterima Cloudflare', async () => {
    cloudflareSays(true);

    await expect(run({ turnstileToken: 'token-sah' })).resolves.toBeUndefined();
  });

  it('menghentikan permintaan yang tokennya ditolak', async () => {
    cloudflareSays(false, ['invalid-input-response']);

    const error = await run({ turnstileToken: 'token-palsu' });

    expect(error).toBeInstanceOf(Error);
  });

  it('menghentikan permintaan yang tidak membawa token sama sekali', async () => {
    const error = await run({});

    expect(error).toBeInstanceOf(Error);
  });

  /**
   * Menggantikan uji yang dulu berbunyi "memberi pesan yang sama untuk token
   * hilang dan token ditolak".
   *
   * Uji itu hijau selama dua PR dan memaku perilaku yang salah. Alasannya
   * terdengar masuk akal — membedakan keduanya "hanya berguna bagi penulis
   * skrip" — tetapi ia mengabaikan pengunjung yang jaringannya memblokir
   * `challenges.cloudflare.com`: bagi orang itu tidak ada token yang pernah
   * terkirim, dan satu-satunya saran yang ia terima adalah memuat ulang
   * halaman, yang tidak akan pernah mengubah apa pun.
   */
  it('memberi saran yang berbeda untuk token hilang dan token ditolak', async () => {
    const missing = (await run({})) as Error;
    cloudflareSays(false, ['invalid-input-response']);
    const rejected = (await run({ turnstileToken: 'x' })) as Error;

    expect(missing.message).not.toBe(rejected.message);

    // Yang hilang: sebabnya ada di sisi pengunjung, jadi sebutkan alamat yang
    // harus diizinkan — dan JANGAN suruh memuat ulang halaman.
    expect(missing.message).toContain('challenges.cloudflare.com');
    expect(missing.message).not.toMatch(/muat ulang/i);

    // Yang ditolak: tantangan yang kedaluwarsa memang sembuh dengan memuat
    // ulang, jadi saran itu tetap benar di sini.
    expect(rejected.message).toMatch(/muat ulang/i);
  });

  it('menghentikan token sah yang diterbitkan untuk permukaan lain', async () => {
    // Token yang benar-benar diselesaikan — tapi di panel chat, bukan di sini.
    cloudflareSays(true, [], 'chatbot-ask');

    const error = await run({ turnstileToken: 'token-sah-tapi-salah-permukaan' });

    expect(error).toBeInstanceOf(Error);
  });

  it('meneruskan seluruh permintaan ketika gerbangnya dimatikan', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');

    await expect(run({})).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Urutan terhadap `validate()`, dibuktikan lewat aplikasi Express sungguhan.
 *
 * `validate` menimpa `req.body` dengan hasil `schema.parse(...)`, dan skema Zod
 * biasa membuang field yang tidak dikenalnya. Dipasang sesudah `validate`,
 * middleware ini mencari token yang baru saja dihapus — lalu menolak setiap
 * pengunjung yang sah. Kegagalannya tidak terlihat di mana pun kecuali di
 * layar pengunjung, jadi jebakannya dipaku di sini.
 */
describe('urutan terhadap validate()', () => {
  const schema = z.object({ email: z.string() });

  function appWith(...handlers: express.RequestHandler[]) {
    const app = express();
    app.use(express.json());
    app.post('/uji', ...handlers, (_req, res) => {
      res.status(200).json({ sampai: true });
    });
    // Penerjemah galat seadanya: yang diuji statusnya, bukan bentuk badannya.
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      res.status(400).json({ error: (err as Error).message });
    });
    return app;
  }

  it('LOLOS ketika requireTurnstile mendahului validate', async () => {
    cloudflareSays(true);

    const response = await request(appWith(requireTurnstile(AKSI), validate(schema)))
      .post('/uji')
      .send({ email: 'a@b.c', turnstileToken: 'token-sah' });

    expect(response.status).toBe(200);
  });

  it('GAGAL ketika validate mendahului requireTurnstile, meski tokennya sah', async () => {
    cloudflareSays(true);

    const response = await request(appWith(validate(schema), requireTurnstile(AKSI)))
      .post('/uji')
      .send({ email: 'a@b.c', turnstileToken: 'token-sah' });

    expect(response.status).toBe(400);
    // Dan buktinya memang tokennya hilang, bukan ditolak Cloudflare:
    // permintaannya tidak pernah sampai ke siteverify.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Penjaga statis atas rute yang sebenarnya.
 *
 * Uji di atas membuktikan urutan yang salah itu rusak; yang ini membuktikan
 * rute produksi memakai urutan yang benar. Tanpa yang kedua, seseorang dapat
 * menukar urutannya besok dan seluruh berkas ini tetap hijau.
 */
describe('rute yang dijaga memasang gerbangnya pada urutan yang benar', () => {
  const MODULES = path.join(__dirname, '..', 'modules');

  /** Ambil satu pemanggilan `router.post(...)` yang memuat requireTurnstile. */
  function guardedCall(file: string): string {
    const src = fs.readFileSync(file, 'utf8');
    const start = src.indexOf('router.post(');
    expect(start, `router.post tidak ditemukan di ${file}`).toBeGreaterThan(-1);

    let index = start;
    while (index > -1) {
      const end = src.indexOf(');', index);
      const call = src.slice(index, end);
      if (call.includes('requireTurnstile')) return call;
      index = src.indexOf('router.post(', end);
    }
    throw new Error(`Tidak ada rute yang dijaga requireTurnstile di ${file}`);
  }

  it.each([
    ['auth', 'auth/auth.routes.ts'],
    ['chatbot', 'chatbot/chatbot.routes.ts'],
  ])('%s memanggil requireTurnstile sebelum validate', (_name, relative) => {
    const call = guardedCall(path.join(MODULES, relative));

    expect(call).toContain('validate(');
    expect(call.indexOf('requireTurnstile')).toBeLessThan(call.indexOf('validate('));
  });

  it('esign memanggil requireTurnstile sesudah upload.single', () => {
    // Arah sebaliknya, alasan yang sama: rutenya multipart, dan sebelum multer
    // berjalan `req.body` masih kosong.
    const call = guardedCall(path.join(MODULES, 'esign/esign.routes.ts'));

    expect(call).toContain('upload.single');
    expect(call.indexOf('upload.single')).toBeLessThan(call.indexOf('requireTurnstile'));
  });
});
