# Known Issues & Technical Debt

Status of production-readiness work and the remaining roadmap. Updated as part of
the production-readiness / architecture-standardization effort. For the system
overview see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## 🔴 OPEN — empat PR terbuka akan MELINDAS pekerjaan yang sudah tergelar (2026-09-05)

Keempat PR fitur yang terbuka bercabang dari basis yang sudah jauh tertinggal,
dan menggabungkannya apa adanya akan **menghapus berkas yang hidup di `main`
dan berjalan di produksi**. Diukur 2026-09-05:

| PR | tertinggal dari `main` | maju | catatan |
|---|---|---|---|
| #415 | **45 commit** | 46 | Manajemen Kinerja Terintegrasi |
| #438 | **42 commit** | 12 | Audit Ujian Online / CBT |
| #439 | **42 commit** | 14 | Standardisasi SPMB |
| #441 | **38 commit** | 15 | Google Workspace / Microsoft Nonprofits |

**#441 yang paling berbahaya.** Diff dua-titik dari basisnya menunjukkan ia
**menghapus 24 berkas**, dan tidak menyediakan penggantinya — di antaranya
seluruh rantai tanda tangan dan pencabutan e-office yang sudah dijalankan
end-to-end di produksi:

```
apps/api/src/utils/generate-letter-pdf.ts        apps/api/src/utils/letter-verification.ts
apps/api/src/utils/esign-revocation.ts           apps/api/src/utils/letter-revocation-authority.ts
apps/api/src/modules/correspondence/signed-pdf.ts
apps/web/src/app/public/verify-letter/page.tsx
apps/web/src/components/e-office/revocation-requests-card.tsx
apps/web/e2e/e-office-verify.spec.ts             … dan 16 lainnya
```

**Kenapa ini mudah terlewat:** `git diff main...branch` (tiga titik) tidak
menampilkannya sebagai penghapusan sama sekali — ia membandingkan lawan
merge-base, sehingga PR yang sekadar tertinggal terlihat seolah hanya menambah.
Ukur dengan `gh api repos/<o>/<r>/compare/main...<branch> --jq '.behind_by'`
dan `git diff --diff-filter=D --name-only $(git merge-base origin/main FETCH_HEAD) FETCH_HEAD`.

**Jangan gabungkan satu pun tanpa rebase ke `main` lebih dulu**, lalu periksa
ulang daftar penghapusannya.

## 🟠 SEPARUH BERES — raport merdeka masih PNG rata; naskah dinas tidak lagi (diperiksa 2026-09-05)

**Ralat 2026-09-05.** Separuh entri ini sudah tidak berlaku. Halaman naskah
dinas **tidak lagi** meraster: `apps/web/src/app/e-office/letter/[id]/page.tsx`
kini menyatakan sendiri *"Tidak ada html2canvas dan jsPDF di sini lagi"*, dan
generator sisi-server `apps/api/src/utils/generate-letter-pdf.ts` sudah dipakai
(7 panggilan `drawText`, teks tetap teks).

**Yang MASIH berlaku:** `apps/web/src/app/assessment/raport-merdeka/page.tsx`
tetap memanggil `html2canvas` + `jsPDF` (baris 50–51, 124, 132), jadi raport
merdeka masih diunduh sebagai satu gambar raster per halaman.

Deskripsi aslinya, untuk raport merdeka, tetap benar:

The letter template even documents it, at `letter-pdf-template.tsx:40`:
*"This template is not only displayed — html2canvas rasterises it into the
downloaded PDF."*

Costs: the text cannot be selected, searched, or indexed by the archive; screen
readers get nothing; files are far larger than they need to be; and — the reason
this blocks other work — **a raster PDF cannot carry a meaningful PAdES
signature**, so it is a hard ceiling on the e-signature roadmap.

A server-side `pdf-lib` generator that keeps text as text and embeds only the QR
as an image exists at commit `e93a7cf2` (21 `drawText` calls). It has four
defects to fix before use — silent single-page truncation, a missing letterhead
logo, WinAnsi-only fonts that throw on Arabic, and a signature block that can
overlap the body. See [`EOFFICE_ESIGN_PLAN.md`](./EOFFICE_ESIGN_PLAN.md) §2.2.

## ✅ SUDAH BISA — pencabutan terpasang penuh (dibuktikan lawan `main` 2026-09-05)

**Entri ini sudah tidak berlaku, dan sempat saya sebut mendesak kepada
pengguna sebelum memeriksanya — jangan ulangi: periksa item merah lawan kode
sebelum mengutipnya.** Diperiksa lawan `origin/main` 2026-09-05:

- **Kunci penandatanganan.** `POST /esign/keys/:userId/revoke` ada, dan frontend
  **memanggilnya**: `apps/web/src/components/settings/esign-key-inventory.tsx`
  (`revokeKey.mutateAsync`, tombol "Cabut kunci"), lewat
  `apps/web/src/hooks/use-esign.ts:239`.
- **Tanda tangan surat.** `POST /esign/letters/:letterId/revoke` ada di
  `esign.routes.ts:169` → `EsignController.revokeSignature`, divalidasi
  `revokeSignatureSchema`, dan dipanggil dari `use-esign.ts:269`. Modul
  kewenangannya (`letter-revocation-authority.ts`) dan mekaniknya
  (`esign-revocation.ts`) ada beserta ujinya, dan `signed-pdf.ts` merender cap
  DICABUT.

Isi lama, disimpan sebagai catatan bagaimana lubangnya dulu ditemukan:

- **Signing keys.** `POST /esign/keys/:userId/revoke` exists in
  `esign.routes.ts`, guarded by `isSuperAdmin` and validated by
  `revokeKeySchema` — and **no frontend code calls it**. A leaked signing
  passphrase, or an official who leaves the yayasan, cannot be revoked through
  the application.
- **Letter signatures.** `LetterSignature` carries `revokedAt`, `revokedReason`
  and `revokedById`. `letter-verification.ts` branches on them, the public
  verification page is written to report *"Surat telah dicabut: …"*, and the
  naskah template filters revoked signatures out of the QR block. But the only
  `letterSignature.update` in the whole tree writes `{ pdfHash, pdfSignature }`.
  **No route, controller or service method ever sets `revokedAt`.**

So the UI can display a state no code path can produce. Withdrawing a wrongly
issued SK is an ordinary administrative need, and today it is impossible.

## ✅ FIXED — public pages rendered Indonesian when EN/AR was selected (2026-07-23)

**Was.** Switching the public site to English or Arabic translated the
navigation and the breadcrumb, but the page content stayed Indonesian: 1 of 9
public pages and 0 of 7 landing sections were localized. PR #356 had built the
switching *mechanism* — cookie, server-side locale read, `router.refresh()`,
RTL, the switcher — and translated `/profil` alone to prove it worked. The
switcher then advertised a capability the content did not deliver.

**Now: all 9 public pages localized end to end**, including page titles and
meta descriptions:

| Surface | State |
|---|---|
| Public navbar + mobile drawer, breadcrumb | ✅ |
| `/` — all 7 landing sections + footer | ✅ |
| `/profil`, `/profil/pimpinan` | ✅ |
| `/unit`, `/unit/[slug]` | ✅ |
| `/program-unggulan` | ✅ |
| `/berita`, `/berita/[slug]` | ✅ chrome, headline and standfirst |
| `/kontak` | ✅ |
| `/wakaf-infaq` | ✅ including the donation form |

**What is still Indonesian, deliberately.**

1. **News article bodies.** Headlines and standfirsts are translated; the
   article text is not. Each body carries direct quotations attributed to named
   staff and lists of named children. English and Arabic readers are told so in
   a line above the article rather than left to wonder, and the body is marked
   `lang="id"`.
2. **Leaders' mottos and the donation page's scripture** — see below; these are
   deliberate and permanent.
3. **`ANONYMOUS_DONOR_NAME` ("Hamba Allah")** on the donation form. It is
   *recorded on the donation*, not merely displayed, so it stays one value in
   every locale rather than three the finance team has to reconcile. Likewise
   the bank details and the donation JSON-LD.

**Where the strings live.** Public prose is a plain function of the locale, so
the same module serves server components (`getServerLocale()`) and client ones
(`useI18n().locale`):

- `config/site.i18n.ts` — units, programmes, gallery, tagline, vision.
- `config/home.i18n.ts` — the seven landing sections and the footer.
- `config/pages.i18n.ts` — page chrome for everything past the homepage.
- `config/news.i18n.ts` — article headlines and standfirsts.
- `config/donation.i18n.ts` — the Wakaf & Infaq page and its form.
- `config/content.i18n.ts` — `/profil` and the legal-identity copy.
- `locales/{id,en,ar}.ts` — only the small UI atoms `t()` serves.

Content is keyed by **slug**, never by the Indonesian prose. Keying by title is
how the programme icon map silently lost four of its ten icons.

**`config/i18n-coverage.test.ts` is what keeps this from regressing.** It walks
every surface, fails when a key exists in one locale and not another, and fails
when an English or Arabic string is byte-identical to the Indonesian — with an
explicit allowlist naming each deliberate exception and its reason.

**Deliberately NOT translated** — a future pass should leave these alone:

- **Leaders' mottos, and the hadith and Qur'anic verse on the donation page.**
  Each is an Indonesian rendering of scripture. Generating Arabic or English
  from it would publish a reconstruction as scripture — in the mottos' case,
  as a quotation attributed to the Prophet ﷺ under a named person's
  photograph. Both pages say so in English and Arabic instead.
- **Domain vocabulary** — Pesantren, SPMB, Wakaf, Infaq, Santri, Tahfidz,
  Musyrif, and the unit names. The portal uses these words throughout;
  translating them on the public site alone would make the two disagree.
- **Legal identifiers** — decree number, NPWP, ministry name. Facts on a
  document; a translated identifier is a wrong identifier.

## ✅ FIXED — every rate limiter counted the Cloudflare edge, not the visitor (2026-07-25, fixed 2026-07-31)

**Symptom.** Rate limits do not limit anyone on the live site. 40+ consecutive
`POST /api/chatbot/public/ask` from a single address never returned 429 against
a 10-per-minute limit, and `ratelimit-remaining` moved non-monotonically —
9, 6, 9, 9, 8 — which is the signature of several counters, not one.

**Cause.** The request path is **client → Cloudflare → nginx → container**, two
reverse proxies, but `apps/api/src/app.ts` sets `app.set('trust proxy', 1)`.
Express therefore takes `req.ip` from the last `X-Forwarded-For` entry, which
nginx appended as `$remote_addr` — the Cloudflare **edge** address. Cloudflare
spreads one visitor across many edges (12+ distinct ones appeared in the nginx
access log for ~40 requests from one client), so each burst keeps landing in a
fresh bucket.

Proven in three steps rather than inferred:

1. The same burst sent straight to `127.0.0.1:3001` with a single-entry XFF
   decremented 9→0 cleanly and returned **429 on request 11**.
2. `https://cipansor.or.id/cdn-cgi/trace` reported the client IP as perfectly
   stable across 8 samples, so the client was not the thing changing.
3. Replaying nginx's exact two-entry header (`<client>, <rotating edge>`)
   reproduced `remaining: 9` **every time**.

**This is not a chatbot problem.** All nine `rateLimit()` instances key on
`req.ip` with no `keyGenerator`: `defaultLimiter`, `authLimiter` (login, 5/min),
`twoFactorLimiter` (10/15min), `passwordResetLimiter`, `passphraseLimiter`
(e-sign, 20/15min), `sensitiveOperationLimiter`, `uploadLimiter`,
`publicRegistrantLimiter`, `chatbotLimiter`. The brute-force ceiling on 2FA and
on the e-signature passphrase is multiplied by however many edges an attacker's
traffic spreads across. Secondary effect: `/var/log/nginx/access.log` records
Cloudflare addresses, so it cannot be used to investigate abuse either.

**Fix applied 2026-07-31.** The address is rewritten at the edge of our own
stack rather than by raising the Express hop count.
`/home/cipansoradm/cipansor-deploy/cloudflare-realip.conf` holds
`set_real_ip_from` for Cloudflare's published ranges plus
`real_ip_header CF-Connecting-IP` and `real_ip_recursive on`; it is copied to
`/etc/nginx/` and included from the `http{}` block of `/etc/nginx/nginx.conf`,
on the line after `proxy_set_header X-Forwarded-Host`. That makes
`$remote_addr` the visitor everywhere — the access log included — and keeps
`trust proxy = 1` correct. `trust proxy = 2` also repairs `req.ip`, but trusts
a hop count blindly and leaves the log wrong.

`CF-Connecting-IP` must **never** be trusted without `set_real_ip_from` scoped
to Cloudflare, or anyone can choose their own IP. That scoping was verified,
not assumed — see the third check below.

Verified against the live site after the reload:

1. A request to `https://cipansor.or.id/...` that demonstrably travelled
   through Cloudflare (`remote_ip=172.67.222.200`) was logged by nginx as
   `70.153.137.180`, the true client address, not the edge.
2. Six `POST /api/auth/login` against a nonexistent account returned
   `401 401 401 401 401 429` — the 5/min ceiling now trips — and the API's own
   warning recorded `{"ip":"70.153.137.180"}`, proving `req.ip` reaches Express
   as the visitor rather than the edge.
3. A forged `CF-Connecting-IP: 1.2.3.4` sent from `127.0.0.1`, which is **not**
   in the trust list, was ignored: nginx logged `127.0.0.1`. Spoofing one's own
   address past the limiter does not work.

The trust list is a snapshot of Cloudflare's published ranges. If Cloudflare
adds a range that is missing from the file, traffic via that edge silently goes
back to being counted as edge traffic — re-fetch `/ips-v4` and `/ips-v6` when
Cloudflare announces a change.

## ✅ FIXED — the teacher dashboard reported figures no query had produced (2026-08-01, fixed 2026-08-02)

**Was.** Every number on `/teacher` was wrong, and wrong in a way that looked
plausible. Six independent defects, found by reading the hooks against the
endpoints they called:

1. `useTeacherStats` read `meta.total`; `GET /students` returns
   `meta.pagination.total`. Total Siswa was therefore **always 0**.
2. The class count fell back to a literal `|| 4`, and since the response never
   carried the key it read, "dari 4 kelas" was **unconditional**.
3. It asked `GET /tahfidz/stats` for five keys that endpoint does not return
   (`setoranToday`, `setoranYesterday`, `targetAchievement`, `weeklyCount`,
   `monthlyCount`), so setoran and target were **always 0**.
4. It passed `teacherId` to `/students`, `/classes` and `/tahfidz`, **none of
   which filter on it**. The figures that did arrive described every record the
   caller could see — other teachers' students included.
5. It sent `user.id` as that `teacherId`. `Schedule.teacherId` references
   `Teacher.id` and the JWT carries no teacherId, so the timetable matched
   nothing and fell through to a **hardcoded five-period day** belonging to no
   one.
6. It read `student.name`; the name lives on `student.user.name`. Every recent
   setoran rendered **"Unknown Student"**.

Defects 5 and 6 were found during verification, after the first four.

**Now.** One session-scoped endpoint, `GET /api/dashboard/teacher`. It takes no
`teacherId` parameter by design — the server resolves the teacher from the
session via `findTeacherIdForUser`, so one teacher cannot read another's numbers
by guessing an id, and an account with no `Teacher` row gets 403 rather than a
row of zeros. Class membership is the union of three routes to a class:
homeroom (`Class.homeroomTeacherId`), timetable (`Schedule.teacherId`) and
subject assignment (`TeacherSubject`).

**The design decision worth keeping.** `targetAchievement` is `number | null`,
and null renders as **"—"** with "belum ada target hafalan" — not `0%`. When no
student has a `TahfidzTarget` for the active year there is nothing to measure
against, and `0%` is not a neutral placeholder: it is a claim that the teacher
achieved none of their target. Per-student progress is also capped with
`Math.min(completed / targetJuz, 1)` so one student far ahead cannot push a
class over 100%.

Errors are no longer swallowed into zeros either. A zero says the teacher
recorded nothing today; a failed request says we do not know. The old code
could not tell those apart, and neither could the guru reading it.

Covered by 11 tests in `apps/api/src/modules/dashboard/teacher-stats.test.ts`
(scoping, the 100% cap, null-vs-zero, and the three-way class union). Fixed in
#383. **Note:** those tests queue `mockResolvedValueOnce` in call order, so the
suite uses `vi.resetAllMocks()` — `clearAllMocks` leaves the queued values in
place and the failures it produces point at the wrong test.

## ✅ SUPERSEDED — PWA install prompt never appears on cipansor.or.id (2026-07-23, closed 2026-08-15)

**This is no longer a defect: the apex deliberately ships no PWA.** Since #401,
`pwaEnabledForHost` (`apps/web/src/lib/host-split.ts`) withholds the manifest,
the Apple web-app tags, the `beforeinstallprompt` capture script and the install
banner on `cipansor.or.id` and `www.`. So the banner not appearing there is now
the intended behaviour, and the long investigation recorded below was chasing a
symptom of the right thing happening for the wrong reason.

**Why the apex should never have offered it.** `start_url` is `/`, which on the
public host is the landing page, and all three manifest `shortcuts` —
`/dashboard`, `/attendance`, `/students` — answer **404** there. Sessions do not
cross hosts either (the token is per-origin `localStorage`; `auth-storage` is a
host-only cookie), so an app installed from the apex could never sign anyone in
even if those routes existed. What installed was the brochure.

**Where the question actually lives now: `portal.cipansor.or.id`.** Verified
live after the #401 deploy — the portal serves `<link rel="manifest">`, the
`beforeinstallprompt` capture script, and `mobile-web-app-capable`; the apex
serves none of the three. Whether Chrome then *fires* the event on the portal is
the open half, and the diagnostic steps below still apply — run them against the
portal, not the apex:

1. Chrome DevTools → **Application → Manifest → "Installability"** on a real
   device (`chrome://inspect`). Chrome states its own reason, which beats
   inferring from outside. Still the highest-value step.
2. Lighthouse PWA audit against `https://portal.cipansor.or.id/login`.
3. The manifest `"id": "/"` field — if Chrome ever associated that app id with an
   installed/uninstalled instance it can decline to re-offer.
4. **Chrome's user-engagement heuristic**, which the original investigation did
   not list: Chrome withholds `beforeinstallprompt` until the user has interacted
   with the origin for a threshold of engagement. A fresh Incognito window — the
   test used to rule out a stale dismissal — has *zero* engagement by
   construction, so it can never satisfy this. Worth ruling in or out before
   suspecting the code.

**One thing #401 changed that is easy to miss.** `ServiceWorkerRegister` still
mounts on the public site, where its job is inverted: it calls
`getRegistrations().unregister()` and drops the `cipansor-*` caches. A service
worker outlives the page that registered it, so every earlier apex visitor would
otherwise have kept a navigation-intercepting worker that no code registers any
more and no deploy would ever dislodge. `/sw.js` is still *served* on the apex —
it is a static file in `public/` — and that is not the defect; nothing registers
it there.

## 🔴 OPEN — `next/image` optimisation has never run in production (2026-08-17)

Found while adding the public-site photography. Every `/_next/image` request
returns the **source file unchanged**, at every requested width, in the
original format:

```
original /images/cipansor/galeri-1.webp = 156,656 bytes
  ?w=256  → 200 image/webp 156656      ?w=1080 → 200 image/webp 156656
  ?w=640  → 200 image/webp 156656      ?w=1920 → 200 image/webp 156656
/logo.png ?w=128, Accept: image/avif → 200 image/png 34998
```

It is not Cloudflare — the same responses come straight from the container —
and it is not a cache miss: `X-Nextjs-Cache: HIT`. The optimiser runs and
produces nothing. Two causes, in the runner image:

1. `sharp` is **not resolvable**. `require.resolve("sharp")` fails from both
   `/app` and `/app/apps/web`; only `semver` is at the top level of
   `/app/node_modules`. Next's standalone trace does not pick sharp up, because
   it is loaded at runtime rather than imported.
2. Even the copy in the pnpm store **cannot load**:
   `Could not load the "sharp" module using the linuxmusl-x64 runtime`. The
   binary installed during the build is the glibc one; the runner is Alpine.

The Dockerfile comment about "next/image writes optimised variants here" and
the named volume that seeds `/app/apps/web/.next/cache/images` both describe
something that has never happened.

**Not fixed here.** The repair is a Dockerfile change to the runtime image
(install `sharp` for musl in the runner stage, or move the runner to a glibc
base), which is a deploy-risk change and does not belong in a content PR.
**Still true after the 2026-09-02 rebuild** — re-measured on the live site,
`/_next/image?w=256` returns the source file at 156,656 bytes unchanged.
Everything shipped in the meantime carries explicit derivatives instead —
`galleryThumb()` in `packages/shared/src/public-site.ts` — so the gallery page
costs 484 KB rather than 2.3 MB whether or not this is ever repaired. Anything
added later that assumes `next/image` will resize for it will be wrong.

Related: `robots.txt` is served by **Cloudflare**, not this repo (the
content-signals preamble is Cloudflare's). It allows `User-agent: * / Allow: /`
but carries no `Sitemap:` directive, so `/sitemap.xml` is only found if it was
submitted in Search Console.

## 🔴 OPEN — decisions, not repairs (2026-08-15)

Found while closing #401/#402. Each is a real defect or a real risk, and each
needs a judgement the codebase cannot supply, so none was fixed unilaterally.

**1. There is no student ID-card verification page, and the card's signature is
forgeable.** `StudentIdCardService.generateQRCodeData` signs its payload with a
bare `sha256(payload)` truncated to 8 hex characters and **no secret**. Anyone
who reads one card can mint a payload that verifies. `verificationUrl` is now
`null` rather than pointing at a fabricated address (it used to read
`https://cipansor.app/verify?q=…` — a domain the yayasan does not own, and a
path that has never routed). Building the page is worthwhile only *after* the
hash becomes an HMAC keyed on a server-side secret; a verification page over an
unkeyed hash attests nothing.

**2. `/certificates/verify/[code]` is behind the session wall.** Measured:
**404** on the apex, **307 → /login** on the portal. A verification link is for
people with no account — a dinas office, a prospective employer — so this one
cannot serve its purpose. Sanad certificates now point at
`/public/verify-sanad?code=…` instead, which answers 200 on the apex with no
session, because `middleware.ts` excludes `/public` from its matcher outright
rather than relying on the hand-maintained `publicPrefixes` list. Whether
`/certificates/verify` should join it depends on what that page discloses —
compare `/verifikasi/[token]`, which is public precisely because it never
returns the letter body.

**3. The dashboard metrics job writes 6 rows a minute, forever.**
`aggregateDashboardMetrics` runs on `* * * * *`: 8,640 rows/day, ~3.2M/year, for
an institution whose figures move on the timescale of a class period. The
retention *schedule* was fixed in #401 (the 24-hour window was being pruned
monthly, leaving 131,190 rows across 16 days). The **cadence** was left alone
because it is a product decision about how "real-time" the dashboards need to be.

**4. The pager speaks English.** `components/shared/pagination.tsx`, used by
every `DataTable`, renders "Showing 1 to 10 of 14 results", "Rows per page" and
"Page 1 of 1" in an otherwise Indonesian system. A copy/i18n decision, not a
layout one, so it was left out of the mobile work.

**5. Two people hold `*_KEPALA_SEKOLAH` in the same unit.** The 2026-08-14 email
rename put two seed families side by side that had been hidden behind different
domains, producing six transposed pairs. Some are one persona twice; others are
genuinely two different people holding the same approval rights in one unit.
That is an authority question for the yayasan, not a data-cleanup task. Prefer
`is_active = false` over deletion so the audit trail survives.

**6. `DEMO_MODE=true` is still set on production.** Every account skips the
mandatory-2FA wall, including both active `SUPER_ADMIN`s, neither of which has
2FA enrolled. Flipping it is part of launch, and it locks out testing until
someone enrols — see the launch checklist rather than treating it as a bug.
Re-confirmed in the container 2026-09-02. Its sibling is closed:
`NEXT_PUBLIC_SHOW_DEMO_LOGIN` is now `false` and built that way, so the
credential panel is gone from `/login`.

**7. `#2` above is now half-solved, in the direction that matters.**
`/reset-password` is public, portal-only and reachable with no session (#413),
so an e-mailed link resolves. `/certificates/verify/[code]` is untouched and
still answers **404** on the apex, **307 → /login** on the portal — measured
again 2026-09-02. What it discloses still needs deciding before it joins the
public list.


## ✅ Resolved by this effort (2026-07-22)

Follow-up on top of the merged planning/nav/security work, driven by a critique
of system sprawl, docs drift, and a full per-role visual sweep.

- **Dead admissions duplicates removed.** Deleted the unmounted `modules/psb`,
  the zero-importer `modules/finance-bridge`, and the standalone
  `modules/ppdb-wave` (the web app reaches waves via `/admissions/waves`; nothing
  called its `/api/ppdb-wave` mount). Deleted the five screenshot/crash-sweep e2e
  specs that were tooling, not tests. (The web `/ppdb` pages were **kept**: an
  early pass mistook them for a dead duplicate and removed them, but the e2e
  onboarding test caught it — `/ppdb/registrations` is the only built
  registrant-listing + "Eksekusi Onboarding Terpadu" UI; the canonical
  `/admissions/registrants` is still an unbuilt dead-link. Consolidating `/ppdb`
  into `/admissions/registrants` is a roadmap item, not a delete.)
- **Per-role screenshot sweep made runnable + the crashes it found fixed.**
  `screenshot-roles.ts` pointed at `qa-*` accounts no seed creates; it now drives
  off `DEMO_ACCOUNTS` (one login per RoleCode, `DEMO_MODE` bypasses admin 2FA
  setup). The sweep across all 75 roles found five pages that crashed for every
  visitor, all fixed: `muhadhoroh`/`muhadatsah` (upcoming/statistics/top-performers
  fetchers returned the `{success,data}` envelope while the page consumed the
  payload), `violations`/`rewards` (same envelope bug in the `*Types` hooks, plus
  a search filter hardened against a missing `name`), and `parent/finance` (child
  wallet fetched at the wrong route — `/wallet/student/:id` instead of
  `/wallet/:studentId`, and transactions keyed by wallet id not student id).
- **CI gate closed.** The ~100-test web unit suite (dead-link + RBAC guards
  included) ran in no workflow; it now runs in the Tests job. Renamed the
  workflow "CI/CD" → "CI" (no deploy stage), and dropped the dead `develop`
  trigger from the E2E workflow.
- **One source of truth for agent guidance.** `.github/copilot-instructions.md`
  was a fourth, already-stale copy of the project guide; it is now a pointer to
  `AGENTS.md`. Added `.claude/` guardrails (a PreToolUse hook blocking a full
  Write to `schema.prisma` and a push to `main`, a SessionStart bootstrap) and
  three skills (`gate`, `stack`, `screenshot-roles`). Corrected AGENTS.md's stale
  "237 models / 133 enums" (now stable phrasing) and its `UserRole`-as-example
  contradiction; fixed the README Prisma badge (5.22 → 7).

## ✅ Resolved by the 2026-07-21 Playwright role audit

Found by logging in as one demo account per role and walking every link the
sidebar renders. All of these were invisible when testing as super admin on a
warm session.

- **Authenticated users were thrown off the page they requested.** Three
  independent causes, each confirmed from the captured document redirect chain
  (`200 /inventory | 307 /login -> /dashboard | 200 /dashboard`):
  1. *Refresh-token stampede.* The API rotates refresh tokens, so parallel
     requests with an expired access token each fired `/auth/refresh`; the first
     rotated it and the rest presented a token the server had just deleted, and
     the axios catch block wiped the session. Now single-flight, and only
     400/401/403 counts as a real logout — a 429 or network blip no longer
     discards a working session.
  2. *Pre-rehydration redirect.* `zustand/persist` reports
     `isAuthenticated: false` on first render; the parent layout redirected on
     it, and middleware bounced `/login` back to the PARENT dashboard — which is
     `/parent`. All thirteen `/parent/*` links landed on the portal home.
  3. *The spinner ate the app shell.* `ProtectedRoute` rendered a full-screen
     spinner whenever `isLoading` and re-fetched on every mount, so the sidebar
     and header vanished on every page load. Now gated on `isLoading && !user`;
     `fetchUser` is single-flight, halving `/auth/me` traffic.
- **`validateQuery` results were being discarded.** Express 5 makes `req.query`
  read-only, so the middleware parks the parsed value in
  `res.locals.validatedQuery`. Six modules read `req.query` anyway, losing the
  schema's `page`/`limit` defaults — `skip` became `NaN` and Prisma returned a
  500 on `GET /api/sanad?limit=50`. Guarded by
  `apps/api/src/middleware/validated-query.test.ts`.
- **nginx swallowed the whole Kesehatan module.** `location /health` is a prefix
  match, so `/health/records`, `/health/medications` and the rest were proxied
  to the API's health check. Moved to `location = /healthz`. **Any external
  uptime monitor must be repointed**; container healthchecks hit `:3001`
  directly and are unaffected.
- **The 81 demo accounts had no domain rows.** No `Student` for `*_SISWA`, no
  `Teacher` for `*_GURU`/`MUSYRIF`/`PT_DOSEN`, no `StudentParent` for
  `*_ORANG_TUA`, and no `PERGURUAN_TINGGI` unit at all — so every `PT_*` account
  had `unitId: null`. They logged in and landed on empty portals, which the
  audit reported as "near-blank" pages. Fixed in `prisma/seed.ts`; because the
  seed starts with `TRUNCATE … CASCADE`, existing databases are updated with the
  additive, idempotent `wire-demo-personas.sql` instead.
- **Contract mismatches.** `/api/attendance/summary` demanded a mandatory
  `startDate`+`endDate` pair (a single day and an unbounded student history are
  both legitimate); `/api/curriculum/schedules` silently stripped the
  `studentId` the student dashboard was already sending, so the timetable widget
  queried the whole school; and both the student and teacher "Jadwal Hari Ini"
  widgets sent `dayOfWeek` as a number where the API expects `MONDAY` — now a
  shared `DAY_OF_WEEK_BY_INDEX` in `@cipansor/shared`.

## ✅ Resolved in this effort

- **FE↔BE double-`/api` bug (false green).** Seven React Query hooks
  (`use-syariah`, `use-tata-laksana`, `use-organisasi`, `use-quality`,
  `use-litbang`, `use-pengawasan`, `use-complaints`) prefixed paths with `/api`
  even though the Axios `baseURL` already ends in `/api`, so they hit
  `/api/api/...` and 404'd against the live backend. The e2e mocks' `**/api/...`
  globs masked it. Fixed all 59 call sites to match the majority convention.
- **Docker images reworked & verified runnable.** `apps/api` is a multi-stage
  build using a fresh `pnpm install --prod` closure + compiled `dist` + the
  generated Prisma client (~929 MB; boots, `/health` 200, PrismaClient loads);
  `apps/web` uses Next.js standalone output (~537 MB; boots, `/` 200). Build
  context kept ~136 KB via `.dockerignore`; both trust a build-time proxy CA via
  a BuildKit secret. (`pnpm deploy` was dropped — it hangs in CI sandboxes.)
- **E2E stabilized.** Root-caused and fixed every hard failure (a tahfidz raw-SQL
  bug referencing a non-existent `deleted_at`, the class-management edit flow,
  and several brittle mock-auth specs). Mock-based specs now seed auth via
  `page.addInitScript` (before first paint) with `/api/auth/me` + `/api/auth/refresh`
  mocks and a low-priority `/api/**` fallback, removing the logout-redirect races.
- **Removed stale artifacts.** `dashboard/dashboard.controller.ts.old` and the
  dead `apps/web/e2e/temp/` placeholder spec.
- **Tahfidz certificate endpoint fixed.** The certificate page POSTed to
  `/tahfidz/certificates` (nonexistent → 404); repointed to the real
  `/tahfidz/certificates/generate`. Also removed a dead, uncalled
  `tahfidzService.generateCertificate` helper that targeted another nonexistent
  path (`/tahfidz/students/:id/certificate`) with a signature that never matched
  the backend.

- **Destroyed Prisma schema restored.** `schema.prisma` (237 models, 133 enums)
  had been truncated to a stub, breaking the entire backend; restored from the
  last good revision.
- **Prisma 7 migration completed.** Datasource `url` moved to `prisma.config.ts`;
  runtime client now uses the `@prisma/adapter-pg` driver adapter; `Decimal`
  import path fixed; standalone seeds/scripts use a shared `createPrismaClient()`
  factory; missing back-relations and unsupported `nullsNotDistinct` arg fixed.
- **otplib 13 migration** for 2FA (functional `generateSecret`/`generateURI`/`verify`).
- **Express 5 types** pinned to a compatible `@types/express-serve-static-core`
  (5.1.0) so `req.params` is typed `string` without breaking router overloads.
- **RoleCode alignment (partial):** service/controller `currentUser.role` typed as
  string; route guards use `RoleCode.YAYASAN_*`; GRC controllers' `isPrivileged`
  accepts string.
- **🟢 API build is GREEN — all 336 TypeScript errors fixed.** `pnpm --filter api build`
  exits 0. Fixes spanned RoleCode typing, Prisma include/select bugs, enum literal
  mismatches, missing schema/DTO fields, the trial-balance report, role-switch
  tokens, and a full reception model alignment (the DB now matches the implemented
  frontend approval-workflow / package model). Controller→service calls that the
  lenient `strictNullChecks:false` config makes Zod-optional are cast to the
  service's own parameter type (`Parameters<...>[0]`) — to be removed when the
  build moves to strict mode.
- **Fixed a systematic test bug:** 13 module unit tests used a 5-level relative
  path so `vi.mock('../lib/prisma')` never intercepted; corrected to 4 levels.

## 🟢 API test suite — GREEN (565 passed, 0 failed)

`pnpm --filter api test` now passes: **565 passed, 24 skipped** (the skipped set is
the opt-in DB integration suite + 2 pre-existing skips). The previously-failing
~28 tests were all pre-existing debt and have been fixed, and new coverage was
added for security-critical paths (RBAC middleware, the 2FA flow,
foundation analytics, takhosus certificate eligibility, correspondence signing):

- Completed incomplete Prisma mocks (`$transaction`, `user`/`teacher`/`reward`/
  `roomAssignment`/`growthRecord`/`paymentType.upsert`, etc.).
- Repointed mis-wired mocks (organisasi/tatalaksana mocked the constructor; they
  use the shared `lib/prisma`) and fixed a `vi.mock` hoisting bug (classes).
- Implemented the missing `classService.promoteStudents` the test specified.
- Refreshed stale assertions/inputs (reception model alignment, library select,
  upload response shape, daily-report meal enum, auth RoleCode register flow).
- Gated `database-migrations` (real-DB integration) behind `RUN_DB_TESTS=1` and
  constructed it via the Prisma 7 adapter factory so it loads + skips cleanly.

**To run the DB integration suite:** start Postgres (docker-compose), apply the
schema (`db:push`), then `RUN_DB_TESTS=1 pnpm --filter api test`.

## 🟢 Also green now

- **Web build, type-check, and lint** all pass (`pnpm --filter web build`,
  `tsc --noEmit`, `pnpm --filter web lint` — fixed the user-edit role typing and
  the React Compiler lint errors).
- **API lint** passes (0 errors; `no-explicit-any` warnings remain, non-blocking).
- **CI gates are ON.** `.github/workflows/ci.yml` no longer tolerates lint/build
  failures (escape hatches removed) and runs an API test job.

## 🟢 Local full-stack verification (no Docker required)

The whole stack now boots and has been exercised locally against a **real**
Postgres 16 + Redis (no Docker needed — Postgres/Redis binaries are present):

- `prisma db push` + `db:seed` apply cleanly (after fixing the Prisma 7 config
  import + `--config` flag wiring — see commit history).
- **DB integration suite is green:** `RUN_DB_TESTS=1 pnpm --filter api test` →
  588 passed, 2 skipped (incl. the 22 real-schema DB tests, realigned to the
  restored schema's actual columns/indexes).
- **API boots and serves real requests:** `/health` OK; login verified for
  student/teacher/parent seed users; admins are correctly forced through the
  2FA-setup gate. Confirmed the reset-token-hash leak fix at runtime.
- **Web dev server boots** (Next 16 / Turbopack) and talks to the live API.
- **Playwright** browsers install and run: `landing.spec` 7/7 green and the
  unauthenticated `auth.spec` checks pass against the live stack.

**To reproduce locally:** start Postgres + Redis, write `apps/api/.env`
(DATABASE_URL/SHADOW_DATABASE_URL/REDIS_URL/JWT_SECRET), then
`pnpm --filter api db:push && pnpm --filter api db:seed`,
`pnpm --filter api dev` and `pnpm --filter web dev`.

### Playwright e2e — authenticated foundation in place

A reusable API-based auth helper now exists (`e2e/helpers/auth-api.ts`):
`await loginAs(page, role)` authenticates against the real API and injects the
session (localStorage + middleware cookies). It transparently completes the
**admin 2FA gate** using a TOTP derived from a fixed seed secret — so admins,
super-admins, teachers, parents and students can all be pre-authenticated for
browser tests. Verified by `authenticated-smoke.spec.ts` (5/5 roles green
against the live stack, incl. SUPER_ADMIN + UNIT_ADMIN).

Enablement: seed with `E2E_FIXED_2FA=1` (gives admin accounts the known TOTP
secret — opt-in, never used by a real seed). Bring the stack up with
`scripts/dev-stack.sh` (Postgres + Redis, no Docker).

**Full chromium suite verified GREEN against the real stack (2026-07-16):
280 passed / 0 failed (2.9m)** — see `apps/web/e2e/COVERAGE.md` for the
coverage matrix (430 routes × nav/CRUD/buttons/fields/RBAC) and the full
stabilization history (2FA rate-limiter 429 cascade → cross-worker session
cache persisted across runs; 24 specs migrated off the impossible UI-form
superadmin login; teardown no longer wipes `.auth/`). Also fixed along the
way: `config/index.ts` loaded dotenv from a path that never existed, so the
*running* API server had no DATABASE_URL (prisma CLI masked it), and the
offline banner trusted `navigator.onLine` blindly (now verified against a
real `/api/health` probe on the web origin).

Remaining: grow the matrix (76/430 routes currently visited by at least one
spec). The `page.route` mock-intercept migration is **complete** — every
active spec authenticates for real (`loginAs`); the only remaining `page.route`
usages are 5 config-**ignored** dev utilities (`debug-*`, `generate-screenshots`,
`verify-screenshots`, `verify_reception`) and 2 deliberate error-state
injections (`grc-live`, `integration-grc`), none of which mock product data.

## 🗺️ Roadmap (remaining follow-ups)

- **Module architecture standardization.** ✅ **The 12 controller-less modules
  now follow the standard** — `wallet, payroll, canteen, portfolio, laundry,
  ibadah, announcements, rapor-pesantren, student-compliance, teacher-compliance,
  wilayah, pkg` each have a thin `controller.ts` (and, where they were missing,
  `service.ts`/`schema.ts`), with `routes.ts` reduced to routing + authorize +
  validate and a controller test per module. ✅ **File-naming unified:** all
  module files now use the `<name>.<type>.ts` convention (Angular/NestJS
  `feature.type.ts` — 140 files: controller/service/schema/routes), so the
  `controller.ts` vs `<name>.controller.ts` split is gone. See
  `apps/api/AGENTS.md` for the standard.
- **Strict build.** ✅ **DONE.** `tsconfig.build.json` extends `tsconfig.json`
  (identical strictness; build.json only narrows emit scope), and the root
  config now sets `noEmit` so `build:strict` is a pure typecheck over
  src+tests+prisma. All `Parameters<...>[0]` service-input casts are gone
  (Prisma transactions use the official `Prisma.TransactionClient`; the only
  survivors are email-sms's heterogeneous template-union dispatch).
- **Reduce `no-explicit-any` warnings.** ✅ **Major pass done: 2278 → 1082**
  (−52%). Eliminated the `(req as any).user` / `(req.params as any)` /
  `(req.query as any)` cast families (~1150 sites) via the typed Express
  augmentation + new `requireUser`/`requireStudentId`/`findStudentIdForUser`/
  `findTeacherIdForUser` helpers — which surfaced and fixed latent bugs
  (student self-endpoints in muhasabah/takhosus always 400'd because the JWT
  never carries `studentId`; assignments teacher/student auto-fill never ran;
  tahfidz & rapor-pesantren list endpoints skipped zod validation entirely).
  Remaining (eslint-authoritative `no-explicit-any` count, api): **~1548** —
  ≈1110 in test files (mock plumbing) + ≈438 across service internals. ✅ **All
  49 `where: any` / `whereClause: any` query builders are now typed** with
  `Prisma.<Model>WhereInput`, which surfaced and fixed real looseness — a
  redundant no-op `not: null` filter on non-nullable `Student` columns and
  several `string`→enum assignment sites. The remaining service `any` are
  heterogeneous `as any` casts (many are genuine library/Prisma workarounds) —
  fix opportunistically per module.
- **Web role alignment.** ✅ **DONE.** `src/lib/rbac.ts` is the single source of
  truth (mirrors backend `deriveLegacyRole`); `middleware.ts` and
  `parent/layout.tsx` resolve the effective role from `user.role` OR
  `userRoles[].role.code` (RoleCode-aware, legacy-compatible, no lockout). The
  UI-gating reads were migrated to `getEffectiveRole` (commit `3f673fe`, 23
  files). The only surviving `user.role` reads are legitimate **non-gating**
  uses — displaying/editing **another** entity's role (`users/[id]`,
  `quality/complaints/[id]`) or already using the
  `getEffectiveRole(user) ?? user.role` fallback (`profile`).
- **Replace remaining FE mock data** with real API calls. ✅ **DONE — all
  previously-mocked pages are now real-API:** `foundation/dashboard`,
  `foundation/finance/consolidation`, `analytics/education`,
  `attendance/heatmap`, `parent/buku-penghubung` Weekly Progress,
  `analytics/parent-engagement` (new `/analytics/parent-engagement`),
  `alumni/sanad` (new `/sanad/tree` transmission tree),
  `homeroom/performance` (new `/homeroom/performance-overview`), and
  `foundation/accreditation/readiness` (new
  `/foundation/accreditation/readiness`). Also implemented the missing backend
  for the pre-existing `useStudentCompleteProfile` hook
  (`/students/:id/complete-profile`, Student 360 aggregate — counseling and
  medical details deliberately excluded; they stay behind their own
  permission-guarded endpoints).
- **Web unit/component tests.** ✅ **Harness in place:** vitest `unit` project
  (jsdom + React Testing Library) alongside `e2e-utils`; `pnpm --filter web test`
  runs both (37 tests: rbac, use-permission, i18n provider, Badge). Grow
  coverage with each web change per golden rule #7.
- **Comprehensive Playwright e2e** across all routes (nav, CRUD, every
  button/field, RBAC) against the seeded local stack.
- **Workflow completions:** ✅ correspondence letter-signed notification and
  ✅ takhosus certificate-eligibility notification are now wired (via the
  `notification:send` event bus). ✅ **Accounting per-unit config fallback
  done:** `AccountCode` now carries a `unitId`, and `getAccountOrFallback`
  resolves the code/name fallback strictly within the requesting unit's own
  chart of accounts (null-`unitId`/legacy rows are excluded, so behaviour for
  un-assigned data is the same safe default as before — minus the env-flag gate
  and any cross-unit leak risk). Verified against the live DB (own-unit found,
  cross-unit blocked, null-shared excluded, explicit mapping wins). See
  `apps/api/docs/ACCOUNTING_DEPLOYMENT.md`.

### New follow-ups surfaced by the 2026-07-22 critique

- **Consolidate the live `-enhancement`/`litbang`/`research` modules by design,
  not by delete.** `dashboard-enhancement`, `finance-enhancement`, `litbang`, and
  `research` are separately mounted and in active use — merging them is a
  contract-changing refactor (route-name collisions with `dashboard`, ~34 web
  call sites into `/finance-enhancement`, separate nav/RBAC entries), so it was
  deliberately *not* rushed as part of dead-code removal.
- **`/ppdb` → `/admissions/registrants`.** Build the canonical admissions
  registrant listing/detail (currently unbuilt dead-links), move the onboarding
  UI there, then redirect `/ppdb`. Until then `/ppdb/registrations` stays because
  it is the only built onboarding entry point.
- **`ViolationType` / `RewardType` have no backend model — the "Types" tabs are
  non-functional, not fixed.** The violations and rewards pages render a "Types"
  tab that expects CRUD-able type objects (name, description, points), but no such
  model exists server-side: `/violations/categories` and `/rewards/categories`
  return only the bare category enum (strings). This effort **only hardened the
  pages so they no longer white-screen** — the tab still shows no usable rows and
  its create/edit/delete controls write to nothing. Resolve properly by either
  building the `ViolationType`/`RewardType` models + endpoints, or removing the
  Types tab and its hooks (`useViolationTypes`/`useRewardTypes` and the
  create/update/delete mutations) entirely.
- **Menu vs middleware (still ~25 combinations).** The per-role sweep found roles
  whose nav offers a route the middleware then bounces to `/unauthorized` — e.g.
  most non-teaching staff (`*_TATA_USAHA`, `*_BENDAHARA`, `*_KOMITE`, pustakawan,
  perawat, keamanan, laboran, business-*) get `/students`; alumni get
  `/alumni/sanad`; `PT_MAHASISWA` gets `/classes`. Decide per route: grant access
  or hide the menu item. `screenshot-roles` reproduces the list.
- **Prettier is not enforced and the tree isn't clean.** `prettier --check`
  currently flags ~464 files, so it can't go into CI as-is. Do a one-time
  `pnpm format` pass, land it as its own commit, then add the check.
- **Consolidate the six kitab models** (`Kitab`, `KitabKuning`, `KitabAssignment`,
  `KitabProgress`, `KitabProgressRecord`, `KitabStudentProgress`) into one design —
  deferred because it needs a destructive migration.
- **README/branding + LICENSE.** The system moved PSB/PPDB → SPMB; the README
  copy and screenshots still say PSB. And it advertises an MIT badge + links a
  `LICENSE` file that does not exist — add the file or drop the claim (an owner
  decision).
- **Regulation-driven additions** (from the field/regulatory review): UU PDP
  27/2022 (student = child = specific personal data — parental-consent records,
  a privacy policy, data-subject access/erasure, data-access audit); ISAK 35
  non-profit financial statements + the UU Yayasan annual-report package;
  backup/restore scripts + a DR runbook (currently none, for a DB of children's
  and financial data); a zakat *collection* (muzakki) model to complement the
  existing distribution side.

## ✅ SELESAI 2026-09-05 (#480/#481) — rantai migrasi sudah di-baseline

The `prisma/migrations/` folder is **not applicable to a fresh database**:
`20260709000000_add_pesantren_features_294` runs `ALTER TABLE "complaints" …`,
but no migration ever `CREATE`s the `complaints` table — it exists only in
`schema.prisma`. The project has been evolving its schema with
`pnpm --filter api db:push` (schema-first), so the migrations are vestigial and
`prisma migrate deploy` / `migrate dev` fail (P3006/P3018,
`relation "complaints" does not exist`).

**Impact:** new changes can only be applied via `db:push` (as done for the
`AccountCode.unitId` addition above); a clean incremental migration cannot be
generated until the chain is repaired.

**Sudah dikerjakan persis begitu, 2026-09-05.** Riwayat diringkas jadi satu
`0_init`; produksi ditandai dengan `migrate resolve --applied 0_init`
(`applied_steps_count = 0`, data tidak tersentuh) dan kini menjawab "No pending
migrations to apply." Satu jebakan yang nyaris meloloskan kehilangan: `migrate
diff` **tidak melihat trigger/function/view**, sehingga
`assert_yayasan_organ_exclusive` hampir hilang dari baseline dengan diff yang
tetap kosong — ia harus ditulis tangan.

Rencana aslinya, yang ternyata tepat:

**Fix (dedicated follow-up):** baseline the history — squash the 18 migrations
into a single migration whose SQL is generated from the current `schema.prisma`
(`prisma migrate diff --from-empty --to-schema … --script`), verify it applies
to an empty DB and `migrate diff` against the schema is empty, then mark it
applied on existing databases with `migrate resolve --applied`. This unblocks
proper migrations project-wide.

## 📋 Disposition of the auto-generated PR backlog (#278–#298)

A review of the 20 open PRs (2026-07) found: 18 failed CI (build/lint/test/e2e),
massive duplication (the same feature implemented 3–5× across PRs — e.g.
`marketing/roi.service.ts` rewritten by 5 PRs), 4 PRs editing `schema.prisma`
with **zero migrations**, and systematically overstated descriptions. Verdict
and follow-through:

- **Rebuilt properly on this branch (verified, tested):** Student 360
  complete-profile (#281/#283/#284/#285), parent-engagement analytics
  (#282/#286/#289), sanad transmission tree (#278/#286/#294 part),
  homeroom performance + accreditation readiness (#286), cash-flow page fix
  (#279 — its restyle dropped `MainLayout`; we kept the layout and fixed the
  dead export button instead).
- **Already existed on `main`; PR variants rejected:** talenta `syncFromPKG`,
  marketing ROI service, perencanaan budget-realization — the competing PR
  rewrites all failed CI.
- **Rejected as unsafe:** #281's `responsibleId: risk.ownerId` on auto audit
  findings (`Risk.ownerId` is documented as "User **or Department**"; blind
  assignment can violate the `AuditFinding.responsibleId → User` FK).
- **Deferred (rebuild from scratch if wanted, with real migrations):** the
  large feature sets in #294–#298 (E-Simaan, digital library, facility
  ticketing, alumni placement, practicum/qiyadah/turats, admissions+CBT
  bridge, tahfidz prediction/gamification, Flutter mobile + FCM/WhatsApp).
  All fail CI and change the schema without migrations.
- **#293 (demo seeding)** is the only non-generated PR; left open — needs its
  e2e failure fixed by its author before merge. *(Update: closed by the
  maintainer 2026-07; safe parts were adopted on the feature branch.)*

### Second wave (#318–#320, 2026-07-15) — all reviewed, rebuilt, closed

- **#319 (roles/realms expansion):** stale-base branch — would have deleted
  10+ merged migrations, truncated `schema.prisma`/`seed.ts`, and weakened
  CI. Closed; vocabulary rebuilt **additively** (enum-only migration
  `20260716000000_expand_roles_realms_hierarchy`) with backend + web mapping,
  seeds, and tests. Deviation: `BUSINESS_MANAGER`/`PT_TATA_USAHA` map to
  STAFF, not admin. Also added research-grounded support roles
  (`PUSTAKAWAN`, `PERAWAT`, `KEAMANAN`, `LABORAN`) backed by existing modules.
- **#320 (security deps):** right goal, wrong means (pnpm 11 **RC** pinned,
  global `resolution-mode=highest`; `pnpm audit` is broken upstream — npm
  retired its endpoint, HTTP 410). Closed; overrides adopted on stable
  pnpm 9.15.9 and the CI audit step replaced with `scripts/audit-deps.mjs`
  (npm bulk advisory endpoint). Result: **0 advisories across 1165 packages**.
- **#318 (i18n id/en/ar + RTL):** good dictionaries, flawed client-only
  architecture (hydration flash, untyped `t()`, audit-gate weakening).
  Closed; rebuilt SSR-aware (cookie read in the root layout stamps
  `<html lang dir>` pre-paint), fully typed, wired to the header switcher and
  settings page, with unit tests. Pages adopt `t()` incrementally.

## How to contribute a build fix

1. `pnpm --filter api build:strict` to see strict errors (the real target).
2. Fix the type errors; reuse `@cipansor/shared` types and `@prisma/client` enums.
3. `pnpm --filter api test` and keep it green.
4. Commit with a scoped message on the feature branch.
