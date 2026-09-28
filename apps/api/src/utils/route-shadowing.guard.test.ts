import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { app } from '../app';

/**
 * Express answers a request with the FIRST matching layer, in registration
 * order. A route with a parameter registered above a static sibling therefore
 * swallows it: `GET /:id` above `GET /upcoming` answers `/upcoming` as a lookup
 * of the record whose id is "upcoming", and the real handler never runs.
 *
 * Three had shipped (found 2026-09-25): `GET /simaan/upcoming` (the Jadwal
 * Simaan page), `POST /notifications/whatsapp/send` (the WhatsApp send
 * button) and `GET /donation/mustahik`. None failed a build or a unit test,
 * because each handler was tested on its own.
 *
 * This walks the real router tree the app mounts, not the source text: for
 * every static route it asks each layer of the same router, in order, whether
 * it would match, and fails when the first one to say yes is not the route
 * itself. A router mounted under another (`router.use('/waves', …)`) is checked
 * on its own; its mount point is not re-checked against the parent's earlier
 * routes, because Express 5 layers keep no path string to compare with.
 */

type RouteLayer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle: { stack?: RouteLayer[] };
  match(path: string): boolean;
};

const rootStack = (app as unknown as { router: { stack: RouteLayer[] } }).router.stack;

function allRouters(stack: RouteLayer[], out: RouteLayer[][] = []): RouteLayer[][] {
  out.push(stack);
  for (const layer of stack) {
    if (!layer.route && layer.handle?.stack) allRouters(layer.handle.stack, out);
  }
  return out;
}

const isStatic = (path: string) => !/[:*{(]/.test(path);

function shadowedRoutes(): string[] {
  const found: string[] = [];
  for (const stack of allRouters(rootStack)) {
    const routes = stack.filter((l) => l.route);
    routes.forEach((own, ownIndex) => {
      const paths = ([] as string[]).concat(own.route!.path);
      for (const path of paths.filter(isStatic)) {
        for (const method of Object.keys(own.route!.methods).filter((m) => m !== '_all')) {
          const first = routes.findIndex(
            (l) => (l.route!.methods[method] || l.route!.methods._all) && l.match(path)
          );
          if (first !== -1 && first < ownIndex) {
            const by = ([] as string[]).concat(routes[first].route!.path).join(' | ');
            found.push(`${method.toUpperCase()} ${path} is answered by ${by}, registered above it`);
          }
        }
      }
    });
  }
  return found;
}

describe('route shadowing', () => {
  it('finds routes to check (the walk reaches the module routers)', () => {
    const count = allRouters(rootStack).reduce(
      (n, stack) => n + stack.filter((l) => l.route).length,
      0
    );
    // ~1,380 routes today; a walk that silently stopped at the top would see a handful.
    expect(count).toBeGreaterThan(1000);
  });

  it('no static route sits below a parameter route that matches it', () => {
    expect(shadowedRoutes()).toEqual([]);
  });
});
