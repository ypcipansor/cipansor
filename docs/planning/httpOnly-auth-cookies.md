# Security PR plan — server-issued HttpOnly auth cookies

Status: **planned, not implemented.** This is the decision record for the
finding raised against PR #508 (Pengawas/WBS/suspension) that session
credentials live in browser-readable storage. It is a cross-cutting auth
rewrite, deliberately kept out of the governance PR; the governance PR does not
mark it resolved.

Owner sign-off required before merge of the governance feature, or an explicit
written risk acceptance (see [Disposition](#disposition)).

## 1. The finding

|          |                                                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | Security                                                                                                                                                                                                                               |
| Where    | `apps/web/src/stores/auth.ts`, `apps/web/src/lib/api.ts`, `apps/web/middleware.ts`, `apps/api/src/modules/auth/auth.controller.ts`                                                                                                     |
| What     | Access, refresh, and 2FA-temporary bearer tokens are persisted in `localStorage`; the `accessToken` and `auth-storage` cookies are written by client JavaScript (`document.cookie`), so they are readable by any script on the origin. |
| Impact   | Any XSS or malicious third-party script can exfiltrate a session that outlives the tab (refresh token: 30-day lifetime) and can forge the middleware's RBAC cookie.                                                                    |

Exact line evidence at branch HEAD `5ddab09` (2026-09-22):

- `apps/web/src/stores/auth.ts:105-108` — login writes access + refresh to
  `localStorage` and an `accessToken` cookie.
- `apps/web/src/stores/auth.ts:153-155` — 2FA verify, same.
- `apps/web/src/stores/auth.ts:253-255` — role switch, same.
- `apps/web/src/stores/auth.ts:98-99`, `:147` — 2FA temporary token to
  `localStorage` + a one-hour cookie.
- `apps/web/src/stores/auth.ts:29-49` — the zustand `customStorage` writes the
  whole `auth-storage` payload as a client cookie for the middleware.
- `apps/web/src/lib/api.ts:105-107` — request interceptor reads the bearer from
  `localStorage`.
- `apps/web/src/lib/api.ts:153-163` — refresh reads the refresh token from
  `localStorage`, posts it in the body, and writes new tokens + cookie.
- `apps/web/src/lib/api.ts:227-230` — logout clears `localStorage` + cookies
  client-side.
- `apps/web/middleware.ts` `getAuthState()` (≈`:78-125`) — reads
  `auth-storage`, falls back to the `accessToken` cookie.
- `apps/api/src/modules/auth/auth.controller.ts:19-56`, `:141-147` — the API
  returns tokens in JSON bodies and sets no cookies.

## 2. Why it is not a patch on the governance PR

The review constraint rules out the tempting middle ground (keep the access
token in JS, only harden the refresh token, add `HttpOnly` text to a
`document.cookie` string). Browsers forbid JavaScript-created `HttpOnly`
cookies, so any partial version either does nothing or leaves the refresh token
exposed. A correct migration touches every layer below, each with its own
failure mode, and a half-done version is worse than the status quo because it
_looks_ fixed.

## 3. Deployment topology — the constraint that shapes the design

Verified against `apps/web/next.config.ts`, `docs/DEPLOYMENT.md`,
`apps/web/src/lib/api.ts`, and `apps/api/src/config/cors.ts`.

1. **Production is same-origin.** `NEXT_PUBLIC_API_URL=""` in production
   (`docs/DEPLOYMENT.md:67-72`); one web image serves both `cipansor.or.id` and
   `portal.cipansor.or.id`, and the bundle calls `/api` on whichever origin
   served the page. So an API-set cookie _is_ first-party in production and the
   Next middleware (same origin) can read it. Good.
2. **There is no `/api` rewrite/proxy in `next.config.ts`.** In production this
   is fine because the reverse proxy in front serves both. It is _not_ fine in
   `pnpm dev`, where the Next dev server is `:3000` and the API is `:3001`
   (`apps/web/src/lib/api.ts:88-92`). A cookie the API sets on `:3001` is not
   sent to `:3000`, so middleware would lose the role signal in dev. A dev-only
   proxy rewrite (or a `SameSite=None; Secure` dev cookie over https) is part
   of the change set.
3. **CORS/`SameSite`.** `apps/api/src/config/cors.ts` already sets
   `credentials: true` and refuses `*`; for a cross-origin deployment the
   cookies need `SameSite=None; Secure`, with strict CSRF protection because
   browsers will then attach them cross-site.
4. **The mobile/parent app is a Bearer client.** `docs/MOBILE_API.md:6`,
   `:13-14` documents login → access + refresh tokens over `Authorization:
Bearer`. A cookie-only API would break it. The API must keep issuing bearer
   tokens for non-browser clients while the _web_ stops using them.

## 4. Required change set

**API (`apps/api/src/modules/auth/`)**

- Issue `access`/`refresh` cookies on `POST /auth/login`, `POST /auth/refresh`,
  and `POST /auth/2fa/verify`:
  - `HttpOnly`, `Secure` in production, `SameSite=Lax` (or `None` when the web
    host and API host differ), `Path=/`, an explicit `Max-Age` matching the
    token's own expiry, and the narrowest `Domain` that works.
  - Consider splitting `refresh` onto `Path=/api/auth` so it is not attached to
    every request.
- Keep the JSON token fields for the mobile client; do not remove the bearer
  path.
- Clear cookies server-side on `POST /auth/logout` (`Set-Cookie` with
  `Max-Age=0`), in addition to revoking the refresh token row.
- Add CSRF protection (double-submit cookie or an `Origin`/`Referer` check with
  a per-session token) to every cookie-authenticated mutating method. The
  existing same-origin deployment plus `SameSite=Lax` covers most of it, but the
  cross-origin case must be explicit.
- 2FA temp token: set it as a short-lived `HttpOnly` cookie too, or keep the
  existing body/`Authorization` handshake for non-browser clients, but stop the
  web putting it in `localStorage`.

**Web (`apps/web/src/`)**

- `lib/api.ts`: `withCredentials: true`; remove the `Authorization` header
  interceptor and the `localStorage` reads/writes; the refresh call becomes a
  cookie-bearing `POST` and no longer touches tokens in JS. Keep the
  single-flight refresh and the `NoSessionError` semantics.
- `stores/auth.ts`: stop persisting tokens; keep only non-sensitive UI state.
  Logout calls the API (which clears cookies) and resets the store.
- `middleware.ts` / `lib/rbac.ts`: obtain identity from a server-issued
  cookie. Preferred: sign a small, server-set "routing hint" cookie (role code
  only, or a signed opaque session id) at login/refresh so middleware can do
  the route gate without trusting a client-written payload; the authoritative
  `permissions[]` stay out of cookies entirely and are fetched from
  `/auth/me`. Keep the fail-closed behaviour for an unresolved role.
- Remove `lib/auth-cookie.ts`'s client-write role; the cookie shape becomes
  server-owned.

**Tests (regression, in the security PR)**

- API: cookie flags (`HttpOnly`, `Secure`, `SameSite`, `Path`, `Max-Age`) per
  environment; login, refresh/rotation, logout (cookies cleared + refresh row
  revoked), 2FA setup/verify; CSRF rejection for a cross-origin mutation;
  suspended/deactivated user.
- Web: token does not appear in `localStorage` or a client-readable cookie;
  login, refresh, logout, switch role, hydration.
- Middleware: RBAC still enforced with the server cookie; no client-cookie
  forgery path.
- Playwright: auth helpers seed via the real login flow (not `localStorage` +
  `document.cookie`); `apps/web/e2e/fixtures/auth.fixture.ts:69-89` is rewritten
  accordingly; governance/WBS/pengawasan flows re-run.

## 5. Threat model (still open until implemented)

- An XSS or malicious dependency can read `localStorage.accessToken` and
  `localStorage.refreshToken` and exfiltrate a session that outlives the tab
  (refresh: 30 days). The 2FA temp token is exposed for its one-hour life
  (`apps/web/src/stores/auth.ts:99`, `max-age=3600`).
- The `auth-storage` cookie is client-writable, so middleware RBAC is only as
  trustworthy as the page executing on the origin; a crafted cookie can name a
  role the user does not hold. Its silent truncation over ~4 KB is separately
  documented (see `docs/KNOWN_ISSUES.md`, "Cookie `auth-storage` di atas 4 KB").
- Cookie transport does not remove XSS, but it keeps the credential out of
  reach of script, removes the client-written RBAC cookie, and gives the server
  a single revocation point.

## 6. Disposition

This is **not** resolved by PR #508. Either:

1. the dedicated security PR above lands before (or with) the governance
   feature, or
2. the repository owner records an explicit, written risk acceptance for the
   bearer-in-`localStorage` design, with an expiry/review date.

Until then the finding stays open against the auth surface, even though PR #508
adds no new token to `localStorage` (the WBS tracking token is transferred via
`sessionStorage` and stored server-side only as an HMAC digest,
`apps/api/src/utils/wbs-token.ts`).
