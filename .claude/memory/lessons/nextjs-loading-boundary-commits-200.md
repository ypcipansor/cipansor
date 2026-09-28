# nextjs-loading-boundary-commits-200

> A root `app/loading.tsx` flushes the shell before the page runs, so `notFound()` can no longer set the status: unknown slugs answered 200 with a dashboard skeleton. `dynamicParams = false` did not fix it; removing the file did. Measure the status code, not the source line.

Found and fixed 2026-08-17 (#411). `/unit/<unknown>` and `/berita/<unknown>`
on the public site answered **HTTP 200** with 48 KB of dashboard-shaped
skeleton titled with the internal app name — a soft 404 to Googlebot and a
page that never arrives for a person. Both routes had called `notFound()` all
along; that was never the problem.

**The mechanism.** `app/loading.tsx` is a Suspense boundary. Next flushes the
shell through it before the page resolves, so the response is committed as 200
before the page objects. One file at the app root did this to every route.

**The fix that did not work:** `export const dynamicParams = false` beside
`generateStaticParams`. It reads like the answer and is inert here — these
routes render on demand (they call `cookies()`), so Next never consults it.
Measured after adding it: still 200. Shipping it with a comment claiming the
fix, plus a guard asserting the line exists, would have been a textbook
[guard that measures the wrong thing](./guard-tests-that-measure-the-wrong-thing.md).

**What worked:** removing `app/loading.tsx`.

| URL | before | after |
|---|---|---|
| `/unit/zzz-bogus` | 200, 48 KB skeleton | **404**, the real not-found page |
| `/berita/tidak-ada` | 200, 48 KB skeleton | **404** |
| `/unit/sdit` | 200, 81 KB | 200, **60 KB** |

The skeleton had also been inlined into every HTML response, landing page
included. The reasoning lives in `apps/web/src/app/not-found.tsx`, and
`src/config/gallery.test.ts` fails if a root `loading.tsx` comes back. A
skeleton belongs in the authenticated segments, not at the root.

**How to test this class of bug:** `curl -o /dev/null -w '%{http_code}
%{size_download}'` against a **built** app, not dev. The unit suite cannot see
it, and the page source looks correct.
