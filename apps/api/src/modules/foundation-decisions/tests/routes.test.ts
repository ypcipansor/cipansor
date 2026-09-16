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
    expect(handlers.some((h) => h.handle === authorize || h.name === 'authorize')).toBe(
      false
    );
    expect(isPublicRoute('post', '/decisions/:id/vote')).toBe(false);
  });

  it('POST /decisions/:id/finalize is authenticated', () => {
    expect(isPublicRoute('post', '/decisions/:id/finalize')).toBe(false);
  });
});
