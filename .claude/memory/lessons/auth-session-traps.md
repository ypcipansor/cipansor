# auth-session-traps

> Why signed-in users were bounced off the page they asked for — a refresh-token stampede, zustand's pre-rehydration state, a spinner that ate the shell, a cookie the browser silently dropped — and, with HttpOnly sessions, a routing cookie that outlived its session.

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
- **A cookie over ~4 KB is dropped without a word.** The client once wrote
  the whole user object, with every permission, into a cookie the middleware
  read; for a kepala sekolah that was 4.3 KB. The browser refused it silently
  and the middleware saw someone signed in with **no role**. Keep a cookie the
  middleware needs to a few hundred bytes. In Playwright the symptom is
  `addCookies` → "Invalid cookie fields".
- **A cookie only the server can clear must be cleared on every refusal.**
  Since #620 the session is HttpOnly and the middleware routes by an HttpOnly
  `cipansor_principal` cookie. When a refresh was refused and that cookie
  survived, the middleware kept sending `/login` back to the dashboard, the
  dashboard's first call failed to refresh again, and the browser looped with
  no way to sign in. Any refusal path — refresh, and anything else that
  decides a session is over — clears every session cookie in its response.
  The commonest trigger is ordinary: changing your own password revokes every
  refresh token, the current one included.
- **No session, no refresh — and decide it before the refresh.** The client
  cannot see an HttpOnly session, so without a check every anonymous 401 (the
  login page itself calls `/auth/me`) sends a refresh: it spends the per-IP
  auth rate limit, and once a refusal clears cookies its answer can land after
  a sign-in has set them and wipe them — seen on the e2e rig as a test sent
  back to `/login` right after injecting a session. The readable CSRF cookie
  is set and cleared with the session; read it before any refresh (a refused
  one clears it in its own response). An anonymous visitor is never
  refreshed or redirected; a signed-in one whose refresh is refused is sent to
  `/login`. A refresh with no token clears nothing.
- **An e2e suite that shares one cached session must not rotate or revoke
  it.** A test that refreshes or logs out the shared session leaves every
  later test holding a deleted refresh token; give such a test its own
  sign-in. And assert the refresh answered 200, not only the URL: a refused
  refresh bounced back by the middleware still ends on the right URL.
- **The routing cookie's bucket is minted, not derived by the client.** Every
  place that mints a token (login, 2FA, refresh, role switch) must compute
  the bucket the same way (`tokenLegacyRole`): a switch that wrote the legacy
  `users.role` column routed the user by the column again, and role codes with
  no bucket (komite, alumni) were refused every page. Test it by signing in
  through the form, not with a helper that builds the cookie itself.

**Health route:** a reverse proxy's `location /health` is a *prefix* match and
once swallowed the whole Kesehatan module (`/health/records`, …). The health
check lives at `/healthz`.

**Rate limits shape testing:** login/register/refresh/password are 5 a minute
per IP (`authLimiter`); everything else 100. A crawler must pace logins, and
its own 429s are not product bugs.

See [api-integration-traps](./api-integration-traps.md).
