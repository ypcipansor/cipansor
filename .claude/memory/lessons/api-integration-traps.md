# api-integration-traps

> API-side bugs that stay invisible while you test as Super Admin: an empty permission matrix, Express 5's read-only `req.query`, `/:id` shadowing, and frontend paths the backend never mounted.

Found by the per-role audit of 2026-07-21 and fixed. Every one of them was
invisible to a Super Admin, which is why they lived so long. **Test as the
role, not as the admin.**

- **An empty role → permission matrix.** 81 roles, and exactly one
  (SUPER_ADMIN) had a non-empty `permissions` array — while `hasPermission()`
  lets SUPER_ADMIN through implicitly. Every gated route 403'd for everyone
  else and nobody noticed. The matrix now comes from `permissionsForRoleCode()`
  (`apps/api/src/modules/roles/permissions.ts`), called by the seed. **When you
  add `hasPermission` to a route, check the matrix grants it.**
- **Express 5 `req.query` is a getter that re-parses the URL on every access.**
  Mutating the object it returns is silently discarded; assigning to it throws.
  `validateQuery` therefore writes to `res.locals.validatedQuery`, and a
  controller that reads `req.query` after it loses the schema's defaults —
  `skip` became `NaN` and a plain list call answered 500. The idiom is
  `(res.locals.validatedQuery || req.query) as T`. The failure is silent:
  validation passes and the route looks guarded. `middleware/normalize-pagination.ts`
  shows how to shadow `req.query` when you must (`Object.defineProperty`).
- **`router.get('/:id')` registered before literal paths swallows them.**
  Express matches in registration order; keep a bare `/:id` last.
- **`authorize(UserRole.SUPER_ADMIN)` does not expand to the `YAYASAN_*`
  RoleCodes**, so the yayasan got 403 on its own workspace. Use RoleCode
  groups, not the legacy `UserRole`.
- **Frontend calls to paths the backend never mounted** (`/bills`,
  `/payments`, `/report-cards`, `/rooms`, …) and hooks written against
  endpoints that were never built. A hook existing is not evidence its
  endpoint does. Check the route file, not the hook.
- **`RoleCode` is a Prisma-only enum — no column uses it** (`roles.code` is
  plain `text`). Adding or removing a value needs no SQL migration: edit
  `schema.prisma`, `db:generate`, and let `tsc` list every stale reference.
  Before deleting any user, check `pg_constraint`: over a hundred FK columns
  reference `users(id)`, many `ON DELETE RESTRICT`.

## The guards

- `apps/web/src/lib/dead-links.test.ts` checks every `href` against the App
  Router tree, with a `KNOWN_MISSING` backlog that may shrink, never grow.
- `apps/api/src/middleware/validated-query.test.ts` asserts every module that
  calls `validateQuery()` also reads `validatedQuery`. It **strips comments
  first** — its first version passed on the explanatory comment above the code
  it was checking. Prove a static guard by reintroducing the bug and watching
  it fail ([guard-tests-that-measure-the-wrong-thing](./guard-tests-that-measure-the-wrong-thing.md)).

See [rbac-nav-contract](./rbac-nav-contract.md) for the web side of the same
contract.
