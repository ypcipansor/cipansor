import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import express from 'express';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import router from '../foundation-decisions.routes';
import { FoundationDecisionService } from '../foundation-decisions.service';
import { generateAccessToken } from '@/lib/jwt';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown; name: string }>;
  };
  name?: string;
  handle?: (...args: unknown[]) => unknown;
}

/**
 * `refreshActorRoles` dipasang per-rute (bukan `router.use` global) supaya ia
 * berjalan SETELAH limiter/`authenticate` yang memang harus lebih dulu — pada
 * rute vote, `passphraseLimiter` menahan percobaan sebelum kerja basis data.
 * Fungsi ini mencari middleware berdasarkan namanya di stack rute.
 */
function handlersFor(method: string, path: string) {
  const layer = (router.stack as unknown as RouteLayer[]).find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer?.route) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return layer.route.stack;
}

function refreshGateFor(method: string, path: string) {
  const h = handlersFor(method, path).find((x) => x.name === 'refreshActorRoles');
  if (!h) throw new Error(`No refreshActorRoles on ${method.toUpperCase()} ${path}`);
  return h.handle as (
    req: { user: Record<string, unknown> },
    res: unknown,
    next: (e?: unknown) => void
  ) => Promise<void>;
}

/**
 * Regresi Finding B2/B3 — peran dari token TIDAK BOLEH dipercaya untuk aksi
 * tata kelola; `refreshActorRoles` menyegarkannya dari basis data lebih dulu.
 *
 * Setup uji: token membekukan `roleCode` lama, sedangkan basis data (mock
 * `currentActiveRoleCodes`) mengembalikan keadaan terkini. Yang diuji adalah
 * perilaku middleware sungguhan pada stack rute, bukan teks sumber.
 */
describe('foundation-decisions.routes — refreshActorRoles (B2/B3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /** Ambil middleware `refreshActorRoles` dari stack rute berdasarkan namanya. */
  function refreshGate(method: string, path: string) {
    return refreshGateFor(method, path);
  }

  /** Jalankan middleware lalu tunggu microtask-nya selesai (handler async). */
  async function run(
    method: string,
    path: string,
    tokenRole: string
  ): Promise<{ forwarded: boolean; error: unknown; user: Record<string, unknown> }> {
    const gate = refreshGate(method, path);
    const req: { user: Record<string, unknown> } = {
      user: { id: 'u-1', roleCode: tokenRole, permissions: [] },
    };
    let forwarded = false;
    let error: unknown;
    await gate(req, {}, (e?: unknown) => {
      if (e) error = e;
      else forwarded = true;
    });
    return { forwarded, error, user: req.user };
  }

  const ALL_ROUTES: Array<[string, string]> = [
    ['get', '/decisions'],
    ['get', '/decisions/:id'],
    ['get', '/decisions/:id/document'],
    ['post', '/decisions'],
    ['post', '/decisions/:id/vote'],
    ['post', '/decisions/:id/finalize'],
    ['post', '/decisions/:id/cancel'],
    ['post', '/decisions/:id/publication'],
    ['put', '/rules'],
  ];

  it('setiap rute terautentikasi memuat refreshActorRoles', () => {
    for (const [m, p] of ALL_ROUTES) {
      expect(
        handlersFor(m, p).some((h) => h.name === 'refreshActorRoles'),
        `${m.toUpperCase()} ${p}`
      ).toBe(true);
    }
  });

  it('rute vote menaruh refreshActorRoles SETELAH limiter, bukan sebelum', () => {
    // Limiter harus menahan percobaan lebih dulu; menaruh refresh sebelum
    // limiter membuka kerja basis data bagi percobaan yang seharusnya ditolak.
    const stack = handlersFor('post', '/decisions/:id/vote');
    const limiterIndex = stack.findIndex(
      (h) => typeof (h.handle as { resetKey?: unknown }).resetKey === 'function'
    );
    const refreshIndex = stack.findIndex((h) => h.name === 'refreshActorRoles');
    expect(limiterIndex).toBeGreaterThanOrEqual(0);
    expect(refreshIndex).toBeGreaterThan(limiterIndex);
  });

  it('menolak akun yang tidak aktif/dihapus (null) pada SEMUA rute terautentikasi', async () => {
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue(null);
    for (const [m, p] of ALL_ROUTES) {
      const { forwarded, error } = await run(m, p, 'YAYASAN_KETUA');
      expect(forwarded, `${m.toUpperCase()} ${p}`).toBe(false);
      expect(error, `${m.toUpperCase()} ${p}`).toBeTruthy();
      expect((error as { statusCode?: number }).statusCode ?? 403).toBe(403);
    }
  });

  it('peran yang dicabut TIDAK lolos `authorize` berikutnya', async () => {
    // Token mengaku Ketua Yayasan; basis data berkata orangnya kini hanya GURU.
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
      primary: 'GURU',
      all: ['GURU'],
    });
    const { forwarded, user } = await run('post', '/decisions/:id/finalize', 'YAYASAN_KETUA');
    expect(forwarded).toBe(true);
    // `req.user.roleCode` sudah DIGANTI dengan peran terkini, sehingga
    // middleware `authorize(...FINALIZE)` di belakangnya akan menilai GURU.
    expect(user.roleCode).toBe('GURU');
    expect(user.roleCodes).toEqual(['GURU']);
  });

  it('peran yang masih sah tetap lolos dan roleCode disegarkan', async () => {
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
      primary: 'YAYASAN_KETUA',
      all: ['YAYASAN_KETUA'],
    });
    const { forwarded, user } = await run('post', '/decisions/:id/finalize', 'YAYASAN_KETUA');
    expect(forwarded).toBe(true);
    expect(user.roleCode).toBe('YAYASAN_KETUA');
  });

  it('middleware tidak menulis `roleCodes` bila basis data mengembalikan himpunan kosong (akun tanpa peran)', async () => {
    // Akun hidup tanpa peran aktif: hak baca jalur SNAPSHOT masih dinilai, jadi
    // middleware TIDAK menolaknya, tetapi `roleCode` menjadi kosong sehingga
    // `authorize(...READ)` tidak salah meloloskannya.
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
      primary: '',
      all: [],
    });
    const { forwarded, user } = await run('get', '/decisions/:id', 'YAYASAN_KETUA');
    expect(forwarded).toBe(true);
    expect(user.roleCode).toBe('');
  });
});

/**
 * Finding #2 (BUG severe) — pejabat yang jabatan yayasannya BUKAN peran PRIMER
 * harus lolos gerbang rute TULIS.
 *
 * `authorize(...)` global hanya menilai `req.user.roleCode`, yang diisi dengan
 * peran PRIMER hasil `refreshActorRoles`. Akun dengan `GURU` primer +
 * `YAYASAN_KETUA` sekunder ditolak 403 di semua rute tulis meski peran
 * yayasannya sah. Uji ini menjalankan router Express SUNGGUHAN dengan token
 * ber-`roleCode=GURU`, sehingga membuktikan perilaku middleware, bukan teks.
 * Diperbaiki oleh `authorizeAnyRole` yang menilai seluruh `roleCodes`.
 */
describe('foundation-decisions.routes — authorizeAnyRole (finding #2)', () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(router);
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = err as { statusCode?: number; status?: number; message?: string };
      res.status(e.statusCode ?? e.status ?? 500).json({ error: e.message });
    });
    return app;
  }

  function token(roleCode: string) {
    return generateAccessToken({
      id: 'u1',
      sub: 'u1',
      email: 'pejabat@cipansor.or.id',
      roleId: 'r1',
      roleCode,
      unitId: null,
      permissions: [],
      role: 'TEACHER',
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'post',
      '/decisions',
      { organType: 'PENGURUS', kind: 'MEETING', subject: 'Uji', body: 'naskah uji sekunder' },
    ],
    ['post', '/decisions/dec-1/finalize', {}],
    ['post', '/decisions/dec-1/cancel', {}],
  ])(
    '%s %s mengizinkan peran yayasan SEKUNDER (primer non-yayasan)',
    async (method, path, body) => {
      // Refresh dari basis data: primer GURU, sekunder YAYASAN_KETUA.
      vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
        primary: 'GURU',
        all: ['GURU', 'YAYASAN_KETUA'],
      });
      // Service-nya distub supaya yang diuji benar-benar middleware, bukan
      // kegagalan Prisma tiruan.
      vi.spyOn(FoundationDecisionService, 'create').mockResolvedValue('dec-1');
      vi.spyOn(FoundationDecisionService, 'finalize').mockResolvedValue({} as never);
      vi.spyOn(FoundationDecisionService, 'cancel').mockResolvedValue({} as never);

      const app = buildApp();
      const res = await request(app)
        .post(path)
        .set('authorization', `Bearer ${token('GURU')}`)
        .send(body);

      // Bukan 403 — peran sekunder YAYASAN_KETUA lolos gerbang.
      expect(res.status, `${method.toUpperCase()} ${path}`).not.toBe(403);
    }
  );

  it.each([
    ['post', '/decisions/dec-1/publication', { publication: 'PUBLIC' }],
    ['put', '/rules', { threshold: 1 }],
  ])(
    '%s %s mengizinkan peran SUPER_ADMIN SEKUNDER (primer non-yayasan)',
    async (method, path, body) => {
      // Rute publikasi/aturan hanya Super Admin; yang diuji adalah Super Admin
      // sebagai peran SEKUNDER.
      vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
        primary: 'GURU',
        all: ['GURU', 'SUPER_ADMIN'],
      });
      vi.spyOn(FoundationDecisionService, 'setPublication').mockResolvedValue({} as never);
      vi.spyOn(FoundationDecisionService, 'upsertRule').mockResolvedValue({} as never);

      const app = buildApp();
      const res = await (method === 'post' ? request(app).post(path) : request(app).put(path))
        .set('authorization', `Bearer ${token('GURU')}`)
        .send(body);

      expect(res.status, `${method.toUpperCase()} ${path}`).not.toBe(403);
    }
  );

  it.each([
    [
      'post',
      '/decisions',
      { organType: 'PENGURUS', kind: 'MEETING', subject: 'Uji', body: 'naskah uji' },
    ],
    ['post', '/decisions/dec-1/finalize', {}],
    ['put', '/rules', { threshold: 1 }],
  ])('%s %s TETAP menolak aktor tanpa peran yang diizinkan', async (method, path, body) => {
    // Tidak ada peran tata kelola sama sekali — hanya GURU. Gerbang tidak boleh
    // dilonggarkan hanya karena kini memeriksa banyak peran.
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
      primary: 'GURU',
      all: ['GURU'],
    });

    const app = buildApp();
    const res = await (method === 'post' ? request(app).post(path) : request(app).put(path))
      .set('authorization', `Bearer ${token('GURU')}`)
      .send(body);

    expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
  });
});

/**
 * Finding TASK-1 (revoked roles regain global read access) — jalur BACA.
 *
 * Rute baca (`GET /decisions`, `/decisions/:id`, `/decisions/:id/document`)
 * sengaja TIDAK memakai `authorize(...READ)` karena hak baca juga dinilai lewat
 * jalur SNAPSHOT anggota. Cacatnya: peran READ GLOBAL dinilai dari
 * `req.user.roleCode`, yang bila tidak disegarkan berasal dari token stateless
 * yang masih memuat peran lama. Mantan Pembina — peran dicabut tetapi token
 * 15 menit masih hidup — tetap melihat SELURUH daftar keputusan.
 *
 * `refreshActorRoles` menutupnya: setiap rute baca menyegarkan peran dari basis
 * data SEBELUM service menilai, sehingga peran global yang dicabut langsung
 * hilang. Uji ini menjalankan router Express SUNGGUHAN dengan token yang
 * membekukan peran lama dan basis data yang mengembalikan peran terkini.
 */
describe('foundation-decisions.routes — peran READ yang dicabut (TASK-1)', () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(router);
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = err as { statusCode?: number; status?: number; message?: string };
      res.status(e.statusCode ?? e.status ?? 500).json({ error: e.message });
    });
    return app;
  }

  /** Token yang MEMBEKUKAN peran yayasan lama (sebelum dicabut). */
  function staleToken(roleCode: string) {
    return generateAccessToken({
      id: 'u-revoked',
      sub: 'u-revoked',
      email: 'mantan@cipansor.or.id',
      roleId: 'r-old',
      roleCode,
      unitId: null,
      permissions: [],
      role: 'UNIT_ADMIN',
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const READ_ROUTES: Array<['get', string]> = [
    ['get', '/decisions'],
    ['get', '/decisions/dec-1'],
    ['get', '/decisions/dec-1/document'],
  ];

  it.each(READ_ROUTES)(
    '%s %s: peran READ global yang DICABUT tidak diteruskan ke service',
    async (_method, path) => {
      // Token mengaku YAYASAN_PEMBINA; basis data berkata orangnya kini GURU.
      vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
        primary: 'GURU',
        all: ['GURU'],
      });

      const seen: Array<{ roleCode?: string; roleCodes?: readonly string[] }> = [];
      vi.spyOn(FoundationDecisionService, 'list').mockImplementation(async (actor: any) => {
        seen.push(actor);
        return { items: [], total: 0, page: 1, limit: 10 } as never;
      });
      vi.spyOn(FoundationDecisionService, 'detail').mockImplementation(async (actor: any) => {
        seen.push(actor);
        return { id: 'dec-1' } as never;
      });
      vi.spyOn(FoundationDecisionService, 'getFinalDocument').mockImplementation(
        async (actor: any) => {
          seen.push(actor);
          return { bytes: Buffer.from('%PDF-1.7') } as never;
        }
      );

      const app = buildApp();
      const res = await request(app)
        .get(path)
        .set('authorization', `Bearer ${staleToken('YAYASAN_PEMBINA')}`);

      expect(res.status, path).not.toBe(403);
      expect(seen, path).toHaveLength(1);
      // Peran BASI tidak boleh sampai ke service — jalur READ global dinilai
      // dari keadaan sekarang, bukan dari klaim token.
      expect(seen[0].roleCode, path).toBe('GURU');
      expect(seen[0].roleCodes, path).toEqual(['GURU']);
      expect(
        (seen[0].roleCodes ?? []).some((c) => c.startsWith('YAYASAN_')),
        path
      ).toBe(false);
    }
  );

  it('mantan Super Admin yang dicabut tidak dapat membuka create-options', async () => {
    vi.spyOn(FoundationDecisionService, 'currentActiveRoleCodes').mockResolvedValue({
      primary: 'GURU',
      all: ['GURU'],
    });
    const app = buildApp();
    const res = await request(app)
      .get('/decisions/create-options')
      .set('authorization', `Bearer ${staleToken('SUPER_ADMIN')}`);
    expect(res.status).toBe(403);
  });
});
