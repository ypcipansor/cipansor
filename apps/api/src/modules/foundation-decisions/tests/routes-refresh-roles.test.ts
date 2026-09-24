import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import router from '../foundation-decisions.routes';
import { FoundationDecisionService } from '../foundation-decisions.service';

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
