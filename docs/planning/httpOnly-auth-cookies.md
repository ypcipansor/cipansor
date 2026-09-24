# Security PR plan — server-issued HttpOnly auth cookies

Status: **implemented on this branch, pending owner merge decision.** This is the
decision record for the finding raised against PR #508 (Pengawas/WBS/suspension)
that session credentials lived in browser-readable storage.

The implementation is in the working tree of PR #508 rather than a separate PR:
the API now issues `HttpOnly; Secure (in production); SameSite=Lax` session
cookies, the web app stores no credential in `localStorage`/`document.cookie`,
and the Next middleware routes on the server-set `cipansor_routing` cookie.
Because this is a cross-cutting auth change folded into the governance feature,
the repository owner should still confirm it ships here (or is split out) — see
[Disposition](#disposition).

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

All of the following is implemented on this branch; the file references are the
landed locations.

**API (`apps/api/src/modules/auth/`)**

- Issue `access`/`refresh` cookies on `POST /auth/login`, `POST /auth/refresh`,
  and `POST /auth/2fa/verify` via `sessionCookies` / `setCookies`
  (`apps/api/src/utils/auth-cookies.ts`): `HttpOnly`, `SameSite=Lax`, `Secure`
  unless `AUTH_COOKIE_SECURE=false` or non-production, `Path=/`, `Max-Age`
  matching each token's own expiry. `apps/api/src/modules/auth/auth.controller.ts`.
- Strip the raw `accessToken`/`refreshToken`/`tempToken` from the browser JSON
  body on login, refresh, 2FA-verify and role-switch
  (`apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/roles/roles.controller.ts`).
  A native Bearer client opts back in with `X-Client-Type: native`
  (`apps/api/src/utils/auth-cookies.ts` `wantsRawTokens`) and keeps the pair in
  the body; the web never receives it. The bearer auth path itself is unchanged
  and is checked first (`apps/api/src/middleware/auth.ts`).
- Clear cookies server-side on `POST /auth/logout`
  (`clearedSessionCookies`), in addition to revoking the refresh token row.
- Servlet-side identity for middleware: a server-set `cipansor_routing` cookie
  (base64url JSON: `role`, `roleCode`, `userId`, `unitId`, `exp`; no
  `permissions[]`, no token) encoded in `packages/shared/src/auth-cookies.ts`,
  set at login/refresh/2FA/role-switch and cleared on logout.
- 2FA temp token is a short-lived `HttpOnly` cookie (`twoFactorCookie`); the web
  no longer stores it.
- CSRF posture: same-origin production + `SameSite=Lax` is the shipped defence;
  the cross-origin `SameSite=None` case is not enabled (the CORS allowlist
  refuses `*` and requires explicit origins — `apps/api/src/config/cors.ts`).

**Web (`apps/web/src/`)**

- `lib/api.ts`: `withCredentials: true`; remove the `Authorization` header
  interceptor and the `localStorage` reads/writes; the refresh call becomes a
  cookie-bearing `POST` and no longer touches tokens in JS. Keep the
  single-flight refresh and the `NoSessionError` semantics.
- `stores/auth.ts`: stop persisting tokens; keep only the non-credential user
  blob. Logout calls the API (which clears cookies), clears the user blob, and
  resets the store.
- `middleware.ts` / `lib/rbac.ts`: identity comes from the server-set
  `cipansor_routing` cookie (`decodeRoutingCookie`). The legacy `accessToken`
  cookie is read only as "a session exists" and yields no role, so an
  authenticated-but-role-unknown request fails closed. `permissions[]` never
  enter a cookie; they are fetched from `/auth/me`.
- `lib/auth-cookie.ts` (the client write path) is deleted; the cookie shape is
  server-owned.

**Tests (regression)**

- API: cookie flags (`HttpOnly`, `Secure`, `SameSite`, `Path`, `Max-Age`) per
  environment; login, refresh/rotation, logout (cookies cleared + refresh row
  revoked), 2FA verify — `apps/api/src/modules/auth/tests/auth.controller.cookies.test.ts`,
  `apps/api/src/utils/auth-cookies.test.ts`.
- Web: token does not appear in `localStorage` or a client-readable cookie;
  login, refresh, logout, switch role, hydration.
- Middleware: RBAC still enforced with the server cookie; a forged client
  cookie grants nothing —
  `apps/web/src/lib/middleware-rbac.test.ts`.
- Playwright: auth helpers seed via real API sessions and the server-issued
  cookies (`apps/web/e2e/helpers/auth-api.ts`); `e2e/auth.spec.ts` asserts the
  cookie is `httpOnly` and absent from `document.cookie`/`localStorage`;
  governance/WBS/pengawasan flows re-run.

## 5. Threat model

Before this change:

- An XSS or malicious dependency could read `localStorage.accessToken` and
  `localStorage.refreshToken` and exfiltrate a session that outlived the tab
  (refresh: 30 days). The 2FA temp token was exposed for its one-hour life.
- The `auth-storage` cookie was client-writable, so middleware RBAC was only as
  trustworthy as the page executing on the origin; a crafted cookie could name a
  role the user did not hold. Its silent truncation over ~4 KB was separately
  documented (see `docs/KNOWN_ISSUES.md`, "Cookie `auth-storage` di atas 4 KB").

After: the credential is script-inaccessible (`HttpOnly`), the RBAC routing
cookie is server-set, and `permissions[]` are resolved from `/auth/me` against
the API-verified token. Cookie transport does not remove XSS, but it keeps the
credential out of reach of script and gives the server a single revocation
point.

## 6. Disposition

Implemented on PR #508. Because this is a cross-cutting auth change folded into
a governance feature, the repository owner should confirm the ship decision:

1. merge PR #508 with the cookie migration included, or
2. split it into a dedicated security PR that lands before/with the governance
   feature.

The bearer-in-`localStorage` design is no longer present, so no risk acceptance
for it is required; the remaining owner decision is scope/packaging, not the
vulnerability itself. PR #508 adds no new token to `localStorage` (the WBS
tracking token is transferred via `sessionStorage` and stored server-side only
as an HMAC digest, `apps/api/src/utils/wbs-token.ts`).
