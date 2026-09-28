# Before/after screenshots of a UI change

`AGENTS.md` requires every UI change to ship before/after screenshots, one pair
per affected surface. This is how to produce them from the **real**
components, not mock-ups. Three routes, cheapest first; pick by what you need
to show.

**"Before" is taken, never remembered:** `git stash push -- <files>` (after
`git add -A` — see `.claude/memory/lessons/git-checkout-path-destroys-uncommitted.md`),
rebuild `shared` if needed, shoot, `git stash pop`. Or, once the change is
committed: `git show origin/main:<file> > <file>`, shoot, `git checkout HEAD -- <file>`.
Don't edit files while a build is running.

## Route 1 — jsdom HTML dump (static layout only)

1. A temporary harness `apps/web/src/__render__/dump.test.tsx` (untracked;
   delete before committing) with `vi.mock` for `next/navigation`, the auth
   and data hooks, and `main-layout` (passthrough). Write
   `container.innerHTML` out — or `document.body.innerHTML` when a Radix
   dialog is involved (it renders in a portal).
2. Mask the repo's `.env` when running it, so nothing reaches a real service.
3. Wrap the HTML in the built CSS: `apps/web/.next/static/chunks/*.css` (the
   largest is the app), rewrite `../media/` → `media/`, copy `static/media/`.
4. Screenshot with Chromium (`--shm-size=1g`, `--disable-dev-shm-usage`,
   window height ≤ ~2200 at scale 2).

jsdom has no layout: anything computed at runtime (Radix scrollbar geometry,
popper positions) will not appear. Use route 2 or 3 for that.

## Route 2 — bundle the real component for a real browser (esbuild)

For measuring behaviour, not just appearance. Alias `next/link`,
`next/image`, `next/navigation`, `@/stores/auth`, `@/lib/api` to small stubs
and use the tsconfig so `@/*` resolves. `process` does not exist in a browser:
add a `banner` with `var process = { env: { NODE_ENV: "…", NEXT_PUBLIC_…: "" } }`,
not only a `define`. Under `--dump-dom` + `--virtual-time-budget`,
`requestAnimationFrame` and ResizeObserver do not tick reliably, so components
that depend on them silently never mount their parts — go to route 3.

## Route 3 — the real production build, locally (most faithful)

1. `pnpm --filter web build` with `NEXT_PUBLIC_API_URL` pointing at a local
   stub (e.g. `http://127.0.0.1:3099`) — the URL is **baked at build time**,
   and **without** a trailing `/api` (`lib/api.ts` appends it; with it every
   call 404s and some widgets never render). Never let it default to a port
   that could be a real API.
2. A small API stub: `/api/auth/me` returns `{ success, data: <user> }`
   (`fetchUser` reads `response.data.data`); everything else
   `{ success: true, data: [] }` is often enough. The stub user **must** carry
   `userRoles[].role.realm`, or `sidebar.tsx` crashes and the page never shows
   (the only symptom is a `waitFor` timeout — read the dev server's log).
   `middleware.ts` only decodes the `auth-storage` cookie; it does not verify
   the JWT, so a stub token works and no database is needed for read-only
   pages.
3. `next start`. **`next dev` does not run `middleware.ts` here** (measured
   2026-09-25, Next 16.3: with no cookie at all, `/finance` answered 200 under
   `next dev` and 307 → `/login` under `next start` of the same tree). HMR
   before/after is fine for how a page *looks*; anything about which role may
   open which page must be shot on a production build, one for "before" and
   one for "after". The same holds for Playwright: locally its `webServer` runs
   `pnpm dev`, so specs that depend on a middleware redirect pass only in CI,
   which runs `pnpm start`.
4. **Plant the session at the context level.** Middleware reads cookies on the
   *first* request, before any page script runs, so `addInitScript` alone
   always bounces to `/login`:
   ```js
   const authStorage = JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 });
   await ctx.addCookies([
     { name: 'accessToken',  value: accessToken, domain: 'localhost', path: '/' },
     { name: 'auth-storage', value: encodeURIComponent(authStorage), domain: 'localhost', path: '/' },
   ]);
   await ctx.addInitScript(([at, s]) => {
     localStorage.setItem('accessToken', at);
     localStorage.setItem('auth-storage', s);
   }, [accessToken, authStorage]);
   ```
   `auth-storage` must be `encodeURIComponent`-ed — that is how
   `stores/auth.ts` stores it.

**Running Playwright yourself in a container:** a script importing
`playwright` must sit in the directory whose `node_modules` holds it (ESM
resolves from the file, not the cwd; `NODE_PATH` does nothing for ESM). Copy
the script in; don't bind-mount over the image's app directory, or you hide
its `node_modules`. Playwright passes `--hide-scrollbars` by default — native
scrollbars vanish because of that flag, not because of headless mode; launch
with `ignoreDefaultArgs: ['--hide-scrollbars']` (and an explicit
`executablePath` if only the full Chromium is installed). With the flag on,
`clientWidth` excludes no scrollbar, so width measurements come out ~10 px
roomier than reality. The image tag must match `@playwright/test` in
`apps/web/package.json`.

## Traps worth knowing

- **Radix Select has no `<select>`.** The stable handle is `label[for]` = the
  trigger's id; the id comes from React `useId` and changes per render, so
  never hard-code it:
  ```js
  const id = await dlg.locator('label').filter({ hasText: /Tingkat RKA/i }).first().getAttribute('for');
  await dlg.locator(`[id="${id}"]`).click();
  await page.getByRole('option', { name: /^Unit/ }).first().click();
  ```
- **The Turnstile widget lives in a *closed* shadow root.** DOM queries find
  no widget (its iframe has no `src`; the one iframe you do find is a 1×1
  beacon), and `el.shadowRoot` is `null`. Detect it at the browser level:
  ```js
  const f = page.frames().find((f) => /challenges\.cloudflare\.com/.test(f.url()) && /turnstile/.test(f.url()));
  const box = await (await f.frameElement()).boundingBox();
  ```
  When a scanner says "none" for *every* target at once, suspect the scanner,
  and look at the screenshot before concluding anything is broken.
- **SVG/XML assets:** `setContent()` fails after navigating to an SVG
  (`Only HTML documents support open()`). Fetch the bytes with
  `page.request.get()` (which also gives the real status and content type),
  then `setContent()` on `about:blank` with an absolute `src`. Prove images
  loaded: `document.images.filter(i => !i.naturalWidth).length === 0` — a
  broken image still produces a PNG that looks fine.
- **Error paths can be shot too:** let the stub read a `_status` field from its
  JSON payload to return, say, a 503.
- **PDFs:** render with a temporary script, then `pdftoppm`; Poppler needs
  `font-liberation fontconfig` and `fc-cache -f`, or the pages come out blank.

Walking every stage for screenshots finds defects a diff does not: a blank
page from `senderName[0]`, an outbox showing the inbox, a letterhead printing
the yayasan's name twice.
