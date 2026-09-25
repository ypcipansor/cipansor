/**
 * Regresi SECURITY — rute suara (`POST /foundation/decisions/:id/vote`) wajib
 * memakai limiter passphrase yang SAMA dengan modul esign.
 *
 * `castVote` membuka kunci privat tersegel dengan scrypt untuk setiap
 * percobaan, sehingga ia adalah permukaan tebak passphrase. Lockout per kunci
 * (`user_signing_keys.locked_until`) hanya mengunci SATU kunci: penyerang
 * dengan banyak akun/sesi tetap dapat menjalankan scrypt berulang kali secara
 * paralel. Yang menutup celah itu adalah pembatas per-IP di jalur suara —
 * dan pembatas itu harus instance yang sama dengan esign, bukan salinan baru
 * yang bisa menyimpang diam-diam.
 *
 * Berkas ini menguji PERILAKU, bukan teks sumber: ia memasang router Express
 * yang sesungguhnya, mengirim permintaan BER-AUTENTIKASI (`router.use(authenticate)`
 * berjalan lebih dulu), dan membuktikan percobaan ke-N dijawab 429 dengan kode
 * `RATE_LIMIT_EXCEEDED`.
 */
import { describe, it, expect, vi } from 'vitest';

// Batas dinaikkan-turunkan lewat env, jadi harus disetel SEBELUM modul limiter
// dievaluasi. `vi.hoisted` berjalan sebelum import apa pun.
vi.hoisted(() => {
  process.env.ESIGN_RATE_LIMIT_MAX = '3';
  process.env.PUBLIC_VERIFY_RATE_LIMIT_MAX = '3';
});

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
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import foundationRouter from '../foundation-decisions.routes';
import esignRouter from '@/modules/esign/esign.routes';
import { passphraseLimiter, publicVerifyLimiter } from '@/middleware/rate-limit';
import { generateAccessToken } from '@/lib/jwt';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown; name: string }>;
  };
}

function handlersFor(router: unknown, method: string, path: string) {
  const stack = (router as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return layer.route.stack;
}

function limiterOn(router: unknown, method: string, path: string) {
  const found = handlersFor(router, method, path).find(
    (h) =>
      typeof h.handle === 'function' &&
      typeof (h.handle as { resetKey?: unknown }).resetKey === 'function'
  );
  return found?.handle;
}

function buildApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  // Penangan galat minimal supaya respons dari middleware auth/validate/service
  // terbaca sebagai status, bukan 500 HTML bawaan Express.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { statusCode?: number; status?: number; message?: string };
    res.status(e.statusCode ?? e.status ?? 500).json({ error: e.message });
  });
  return app;
}

/** Token akses sah supaya `router.use(authenticate)` meneruskan permintaan. */
function token() {
  return generateAccessToken({
    id: 'u1',
    sub: 'u1',
    email: 'anggota@cipansor.or.id',
    roleId: 'r1',
    roleCode: 'YAYASAN_PEMBINA',
    unitId: null,
    permissions: [],
    role: 'SUPER_ADMIN',
  });
}

describe('foundation-decisions vote rate limiting', () => {
  it('POST /decisions/:id/vote memakai limiter passphrase yang SAMA dengan esign', () => {
    // Identitas instance, bukan sekadar "ada limiter": inilah yang mencegah
    // limiter duplikat yang dapat menyimpang dari esign.
    expect(limiterOn(foundationRouter, 'post', '/decisions/:id/vote')).toBe(passphraseLimiter);
    expect(limiterOn(esignRouter, 'post', '/letters/:letterId/sign')).toBe(passphraseLimiter);
  });

  it('membatasi percobaan vote berulang dengan 429 dan kode RATE_LIMIT_EXCEEDED', async () => {
    const app = buildApp(foundationRouter);
    const auth = `Bearer ${token()}`;
    const body = { choice: 'APPROVE', passphrase: 'passphrase-salah' };

    // Tiga percobaan pertama di bawah ambang: limiter meneruskannya. Handler
    // lanjut ke service yang memakai Prisma tiruan, jadi statusnya bisa 500 —
    // yang penting BUKAN 429.
    for (let i = 0; i < 3; i += 1) {
      const allowed = await request(app)
        .post('/decisions/dec-1/vote')
        .set('Authorization', auth)
        .send(body);
      expect(allowed.status).not.toBe(429);
    }

    // Percobaan ke-4 melewati ambang: 429 dari limiter, bukan dari service.
    const blocked = await request(app)
      .post('/decisions/dec-1/vote')
      .set('Authorization', auth)
      .send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body?.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  /**
   * Regresi SECURITY — jalur verifikasi publik token (`GET /verify`) memakai
   * limiter BERSAMA yang sama dengan esign, dan limiter itu benar-benar
   * menolak permintaan berulang dengan 429.
   *
   * Satu lookup token menempuh beberapa operasi mahal (baris keputusan, baca
   * arsip `bytea`, hash, verifikasi e-seal) dan endpoint-nya anonim, jadi
   * limiter-nya harus instance bersama — bukan salinan yang dapat menyimpang.
   */
  it('GET /verify memakai limiter publik BERSAMA dengan esign dan menolak percobaan berulang', async () => {
    expect(limiterOn(foundationRouter, 'get', '/verify')).toBe(publicVerifyLimiter);
    expect(limiterOn(foundationRouter, 'post', '/verify-pdf')).toBe(publicVerifyLimiter);
    expect(limiterOn(esignRouter, 'post', '/verify-pdf')).toBe(publicVerifyLimiter);

    const app = buildApp(foundationRouter);
    for (let i = 0; i < 3; i += 1) {
      const allowed = await request(app).get('/verify?token=tok-tidak-ada');
      expect(allowed.status).not.toBe(429);
    }
    const blocked = await request(app).get('/verify?token=tok-tidak-ada');
    expect(blocked.status).toBe(429);
    expect(blocked.body?.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
