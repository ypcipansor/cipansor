# auth-session-traps

> Why signed-in users were bounced off the page they asked for — a refresh-token stampede, zustand's pre-rehydration state, a spinner that ate the shell — and a cookie the browser silently dropped.

Found 2026-07-21 by driving the site with Playwright. All of it was first
misread as RBAC or as timing noise. **Capture the document redirect chain
before theorising**: `200 /inventory | 307 /login -> /dashboard | 200 /dashboard`
named the cause at once.

- **The API rotates refresh tokens** (`auth.service.ts` deletes the presented
  token and issues a new one). Parallel requests with an expired access token
  each fired `/auth/refresh`; the first rotated it, the rest presented a token
  the server had just deleted, and the axios catch block wiped the session.
  `lib/api.ts` now refreshes single-flight, and only 400/401/403 counts as a
  real logout — a 429 or a network blip must not discard a working session.
- **`zustand/persist` reports `isAuthenticated: false` on first render**,
  before rehydration. A layout that redirects on it sends a signed-in user to
  `/login`, and middleware bounces `/login` to their dashboard — for PARENT
  that is `/parent`, so all thirteen `/parent/*` links landed on the portal
  home. Guard on `user` being present, or let `ProtectedRoute` (which waits for
  `hasInitialized`) decide.
- **`ProtectedRoute` showed a full-screen spinner whenever `isLoading`**, and
  fetched the user on every mount — so the sidebar and header vanished on
  every navigation. Gate the spinner on `isLoading && !user`; `fetchUser` is
  single-flight too.
- **A cookie over ~4 KB is dropped without a word.** `customStorage`
  (`apps/web/src/stores/auth.ts`) wrote the whole user object, with every
  permission, into the `auth-storage` cookie; for a kepala sekolah that was
  4.3 KB, and with fuller data 5.7 KB. The browser refused it silently and
  `middleware.ts` fell back to the token-only branch — signed in, **no role**.
  Since #531 the cookie carries only the role and the primary assignment
  (~300 B); localStorage keeps the full object. In Playwright the symptom is
  `addCookies` → "Invalid cookie fields".

**Health route:** a reverse proxy's `location /health` is a *prefix* match and
once swallowed the whole Kesehatan module (`/health/records`, …). The health
check lives at `/healthz`.

**Rate limits shape testing:** login/register/refresh/password are 5 a minute
per IP (`authLimiter`); everything else 100. A crawler must pace logins, and
its own 429s are not product bugs.

See [api-integration-traps](./api-integration-traps.md).
