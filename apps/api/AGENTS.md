# AGENTS.md — apps/api

Express 5 + Prisma 7 REST API. Read the root `AGENTS.md` first.

## Module layout (the standard)

```
src/modules/<name>/
  <name>.routes.ts      # Router; authenticate/authorize/validate; -> controller
  <name>.controller.ts  # thin; asyncHandler; ApiResponse.success/error/paginated
  <name>.service.ts     # business logic; the only layer that touches Prisma
  <name>.schema.ts      # Zod schemas; export types via z.infer
  index.ts              # export { <name>Routes }
  tests/                # vitest, Prisma mocked
```

Layering: **routes never call Prisma; controllers never embed business logic.**
Mount new modules in `src/app.ts`.

> **File naming: `<name>.<type>.ts`.** Every module file carries its type suffix
> (`finance.controller.ts`, `finance.service.ts`, `finance.schema.ts`,
> `finance.routes.ts`) — the `feature.type.ts` convention from the Angular style
> guide and NestJS. It keeps files greppable and unambiguous across ~110 modules
> (a folder of bare `controller.ts` / `service.ts` tabs is indistinguishable in
> editors and fuzzy-finders). All controller/service/schema/routes files now
> follow this; keep new files consistent.

## Reuse, don't reinvent

- Responses: `src/utils/response.ts` (`ApiResponse`).
  **`ApiResponse.error(message, code)` — message first.** Easy to get backwards
  and silent when you do: the three calls in `modules/chatbot/chatbot.controller.ts`
  had `code` holding an Indonesian sentence and `message` holding
  `CHATBOT_UNAVAILABLE`, which inverts their jobs — the code is the machine-readable
  half. Nothing failed, because no caller read it. Fixed 2026-09-04; if you add a
  branch that returns an error the widget or a client acts on, assert the `code`
  in a test.
- Errors/validation: `src/middleware/error.ts` — throw `Errors.notFound()`,
  `Errors.badRequest()`, etc.; wrap async handlers in `asyncHandler`; validate
  with `validate(schema)` / `validateQuery(schema)`.
- Auth/RBAC: `src/middleware/auth.ts` — `authorize(RoleCode.X, ...)`,
  `hasPermission('perm')`, `isAdmin`, `isSuperAdmin`, `isTeacherOrAbove`.
- Infra: `src/lib/{prisma,redis,jwt,logger,event-bus,realtime}.ts`.
- **Outbound URLs: `config.publicSiteUrl` / `config.portalUrl`**, and for
  certificates `utils/verification-url.ts`. Never build one from
  `process.env.SOMETHING || 'https://…'` inline. There used to be an `APP_URL`
  doing that job; because the name says nothing about *which* of the two hosts
  it means, four call sites each guessed differently and all four shipped —
  `cipansor.app` (×2), `cipansor.com`, `localhost:3000`. Two of those are domains
  the yayasan does not own, and one was printed onto physical asset labels.
  Pick by audience: `publicSiteUrl` for anything an outsider scans or clicks,
  `portalUrl` only for links whose reader is already signed in.
- **A new env var must be added to the `environment:` block in
  `docker-compose.yml`, not just `.env`.** Compose enumerates by name; a value
  present only in `.env` never reaches the container, and the feature stays
  silently inert. Give it a default that degrades to *correct* rather than to
  localhost. Verify with `docker exec cipansor-api sh -c 'env | grep ^NAME='`.
- Cross-module side effects: emit via `eventBus` (typed `AppEvents`), don't reach
  into other modules' services.
- **Contracts: `@cipansor/shared`.** A user-facing endpoint's request/response
  DTO is a shared Zod type reused by the web client — reuse it, or add it to
  shared when missing (never redeclare per-app). A new endpoint that serves the
  UI ships with its web consumer in the same change (**golden rule #8**); pure
  backend-only endpoints (webhooks, cron, health, push, internal orchestrators)
  are exempt.

## Prisma 7 specifics

- The client connects through the **`@prisma/adapter-pg` driver adapter** in
  `src/lib/prisma.ts`; the connection URL lives in `prisma/prisma.config.ts`, not
  in `schema.prisma`. Standalone scripts use `prisma/client.ts`'s
  `createPrismaClient()`.
- `Decimal` is imported from `@prisma/client/runtime/client` (not `/runtime/library`).
- Import DB enums and `Prisma` namespace from `@prisma/client`.
- Always add the matching `include`/`select` for any relation/field you access on
  a query result, or TypeScript will (correctly) reject the access.
- **`OR: [{}]` matches NOTHING, not everything.** An empty object inside `OR`
  becomes a clause with no conditions that Prisma 7 resolves to zero rows, so a
  "match all" branch written that way silently returns an empty result set. Write
  the match-all case as `{}` with no `OR` clause at all (`AND: [{}]` and `{}` do
  match everything). This shipped once as a list ACL: Super Admin — a READ role
  that should see every row — saw an empty list, and nothing failed because the
  predicate still looked correct as an object. Unit tests with a mocked Prisma
  cannot catch it; only running the predicate against real PostgreSQL
  (`tests/integration.db.test.ts`) can.

## Auth & roles

- `req.user` (`JwtPayload`) carries `roleCode`, `permissions[]`, `unitId`, and a
  deprecated `role` string. Gate routes on `RoleCode`/permissions.
- 2FA uses **otplib 13's functional API**: `generateSecret()`, `generateURI()`,
  `await verify({ token, secret })` → `{ valid }`.
- Privilege-escalation guards (e.g. unit admins cannot mint governance roles)
  live in `modules/auth/auth.service.ts`; keep them and cover with tests.

## Testing

- **Mandatory (golden rule #7):** every new/changed **service or controller**
  ships with vitest tests in the module's `tests/`, in the **same commit**. New
  business logic and every branch of an endpoint get a covering test; a bug fix
  gets a regression test that fails before the fix. Barrels, type-only files, and
  pure Zod `schema.ts` are exempt (they're exercised via the service/route).
- `vitest run`. Unit tests mock Prisma (see existing `tests/unit/**` patterns).
- Test setup: `tests/setup.ts`. Keep services pure enough to unit-test.
- Cover the RBAC/privilege-escalation guards (e.g. `auth.service.ts`) explicitly —
  both the allowed and the forbidden path.

## Static analysis (CodeQL)

CodeQL runs via GitHub's **default code-scanning setup** and gates PRs: an alert
with `security-severity >= 8` fails the `CodeQL` check. Two things that cost a
day each:

- **In-source suppression comments do not work here.** `// codeql[query-id]`
  is recorded as SARIF `suppressions` metadata, but the `@kind
  alert-suppression` queries are *not* part of the default code-scanning suite,
  so the alert keeps failing CI. Fix the flow structurally, or dismiss the alert
  in the Security tab / via the API — do not rely on the comment.
- **`js/insufficient-password-hash` fires on `createHash().update()` even for a
  public key.** The query treats a `createKeyMaterial()` return value as a
  password source (its bundle is secret), and any `.publicKey` read off it stays
  tainted. It models `crypto.createHash(...).update(...)` as a sink but *not*
  the one-shot `crypto.hash(algo, data, enc)` — which produces the identical
  digest. `publicKeyFingerprint` uses the one-shot form for this reason.

## Build

- `pnpm build` uses `tsconfig.build.json` (lenient). `pnpm build:strict` uses the
  full strict config and is the real quality target. NOTE: `strictNullChecks:false`
  in the lenient config degrades Zod inference (makes all fields optional); prefer
  fixing toward the strict build over relaxing further.
