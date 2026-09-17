import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import router from '../foundation-decisions.routes';
import { authorize } from '@/middleware/auth';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown; name: string }>;
  };
  name?: string;
}

function handlersFor(method: string, path: string) {
  const layer = (router.stack as unknown as RouteLayer[]).find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer?.route) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return layer.route.stack;
}

function isRateLimiter(handle: unknown): boolean {
  return (
    typeof handle === 'function' &&
    typeof (handle as { resetKey?: unknown }).resetKey === 'function'
  );
}

function hasLimiter(method: string, path: string) {
  return handlersFor(method, path).some((h) => isRateLimiter(h.handle));
}

function isPublicRoute(method: string, path: string) {
  const stack = router.stack as unknown as RouteLayer[];
  const authIndex = stack.findIndex((l) => !l.route && l.name === 'authenticate');
  const routeIndex = stack.findIndex(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (routeIndex === -1) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return authIndex === -1 || routeIndex < authIndex;
}

/**
 * Rute publik verifikasi keputusan.
 *
 * `/verify` (token) dan `/verify-pdf` (unggahan) harus dapat dicapai tanpa
 * sesi — pemindai QR dan dinas luar tidak punya akun. Keduanya juga harus
 * dibatasi lajunya: keduanya menukar/menghitung data dan dapat dipakai
 * membanjiri peladen.
 */
describe('foundation-decisions.routes public verify', () => {
  it('GET /verify is public', () => {
    expect(isPublicRoute('get', '/verify')).toBe(true);
  });

  it('POST /verify-pdf is public', () => {
    expect(isPublicRoute('post', '/verify-pdf')).toBe(true);
  });

  it('POST /verify-pdf is rate limited', () => {
    expect(hasLimiter('post', '/verify-pdf')).toBe(true);
  });

  /**
   * Regresi audit #3 — GET /verify WAJIB dibatasi lajunya.
   *
   * Dulu hanya `POST /verify-pdf` yang punya limiter, sehingga justru jalur
   * termurah bagi penyerang (GET, tanpa Turnstile, tanpa unggahan) yang
   * terbuka — padahal satu permintaan men-token melakukan lookup baris,
   * membaca arsip PDF `bytea`, menghash byte-nya, lalu membaca + memverifikasi
   * kunci e-seal. `hasLimiter` memeriksa Express MELAKUKAN pemasangan handler
   * limiter di stack rute (middleware `express-rate-limit` membawa `resetKey`),
   * bukan sekadar membaca sumber.
   */
  it('GET /verify is rate limited', () => {
    expect(hasLimiter('get', '/verify')).toBe(true);
  });

  /**
   * Rute vote TIDAK memakai `authorize(...)`.
   *
   * Hak suara ditentukan oleh snapshot anggota yang terkunci, diperiksa di
   * service. `authorize` memeriksa `req.user.roleCode` SAAT INI dan akan
   * menolak anggota snapshot yang rolenya sudah berubah sebelum service sempat
   * melihat snapshot. Yang dipaku di sini: `authenticate` ada, dan tidak ada
   * handler `authorize(...)` di rute vote.
   */
  it('POST /decisions/:id/vote is authenticated but not role-gated', () => {
    const handlers = handlersFor('post', '/decisions/:id/vote');
    expect(handlers.some((h) => h.name === 'authenticate')).toBe(true);
    // `authorize` mengembalikan middleware bernama 'authorize'.
    expect(handlers.some((h) => h.handle === authorize || h.name === 'authorize')).toBe(false);
    expect(isPublicRoute('post', '/decisions/:id/vote')).toBe(false);
  });

  it('POST /decisions/:id/finalize is authenticated', () => {
    expect(isPublicRoute('post', '/decisions/:id/finalize')).toBe(false);
  });
});

/**
 * Regresi item review #3 — rute detail & unduh TIDAK boleh memakai
 * `authorize(...READ)`.
 *
 * Akses bacanya dipindahkan ke service (`canReadFoundationDecision`) justru
 * karena `authorize` memeriksa peran HARI INI, sedangkan anggota organ
 * terkunci pada SNAPSHOT saat keputusan dibuat. Anggota snapshot yang rolenya
 * sudah berubah tetap boleh MENANDATANGANI (rute vote tanpa `authorize`), jadi
 * menolaknya MEMBACA dokumen yang sama adalah kontradiksi.
 */
describe('foundation-decisions.routes — akses baca detail/dokumen', () => {
  it('GET /decisions/:id is authenticated but not role-gated', () => {
    // `authenticate` dipasang lewat `router.use` sebelum rute ini, bukan di
    // dalam stack rute — jadi yang diperiksa adalah sifat publiknya (harus
    // false) plus tidak adanya `authorize`.
    expect(isPublicRoute('get', '/decisions/:id')).toBe(false);
    const handlers = handlersFor('get', '/decisions/:id');
    expect(handlers.some((h) => h.handle === authorize || h.name === 'authorize')).toBe(false);
  });

  it('GET /decisions/:id/document is authenticated but not role-gated', () => {
    expect(isPublicRoute('get', '/decisions/:id/document')).toBe(false);
    const handlers = handlersFor('get', '/decisions/:id/document');
    expect(handlers.some((h) => h.handle === authorize || h.name === 'authorize')).toBe(false);
  });

  /**
   * Regresi audit #9 — daftar harus sejalan dengan detail.
   *
   * Anggota snapshot yang rolenya sudah berubah boleh MEMBUKA keputusannya
   * (detail tidak `authorize`), jadi daftar yang memakai `authorize(...READ)`
   * membuat orang itu tidak dapat menemukan dokumen yang boleh ia tanda
   * tangani. Aksesnya karena itu dipindahkan ke query service
   * (`foundationDecisionListWhere`), bukan ke middleware.
   */
  it('GET /decisions is authenticated but not role-gated', () => {
    expect(isPublicRoute('get', '/decisions')).toBe(false);
    const handlers = handlersFor('get', '/decisions');
    expect(handlers.some((h) => h.handle === authorize || h.name === 'authorize')).toBe(false);
  });
});
