# Cipansor Web

The Next.js 16 (App Router) frontend of Cipansor. The conventions for working in
it — app shell, data fetching, RBAC, the definition of done — are in
[`AGENTS.md`](./AGENTS.md); the repository-wide rules and commands are in the
root [`AGENTS.md`](../../AGENTS.md).

## Run it

```bash
pnpm dev                  # http://localhost:3000, expects the API on :3001
pnpm build && pnpm start  # production build
pnpm test                 # vitest unit tests
pnpm lint
```

## E2E

Playwright specs live in `e2e/`, with page objects in `e2e/page-objects/`,
fixtures in `e2e/fixtures/` and helpers in `e2e/helpers/`. They need the local
stack up and seeded (see the root `AGENTS.md`).

```bash
pnpm test:e2e             # all projects
pnpm test:e2e:chromium    # the one CI requires
pnpm test:e2e:ui          # interactive
./run-e2e.sh              # checks the API and web are up first
```

The specs and helpers default to `http://localhost:3000` and
`http://localhost:3001/api`. Set `BASE_URL` and `API_URL` to point them anywhere
else, and never at a server holding real data — several specs write.

`node scripts/e2e-coverage.mjs` lists the pages no spec visits.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 + shadcn/ui · React Query +
Zustand · Socket.IO client · Sentry · Playwright and Vitest.

## Layout

```
src/
├── app/          # App Router pages
├── components/   # React components (ui/ = shadcn/ui)
├── config/       # navigation, site content, i18n
├── hooks/        # React Query hooks
├── lib/          # api client, rbac, utilities
├── services/     # API services
└── stores/       # Zustand stores
```

The API's Swagger UI is at `http://localhost:3001/api/docs` outside production.
