/* Cipansor PWA service worker.
 * Strategy:
 *  - navigations: network-first, fall back to the last cached copy, then the
 *    offline page
 *  - immutable build output (_next/static): cache-first (filenames are hashed)
 *  - everything else static (icons, images, fonts, css): stale-while-revalidate
 *  - API (/api/**): never handled here — always go to network (no stale auth data)
 *  - push: show notification + focus/open the target on click
 *
 * Written by hand rather than with Workbox: the app ships no build-time SW
 * pipeline (see MOBILE_API.md) and the surface is small enough to keep in one
 * readable file.
 */
// Bump this version whenever precached assets (manifest, icons, offline page)
// change. The activate handler deletes every cache whose name doesn't start
// with the current prefix, so a new version forces returning clients to drop
// stale icons/manifest — without it the old PWA icon is served from
// cache-first storage indefinitely.
const VERSION = "v4";
const PRECACHE = `cipansor-precache-${VERSION}`;
const RUNTIME = `cipansor-runtime-${VERSION}`;
const PAGES = `cipansor-pages-${VERSION}`;
// Every cache this worker owns starts with this, so activate can sweep the
// ones from older versions without naming each.
const CACHE_PREFIX = "cipansor-";

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  // The notification badge must be on hand when a push arrives, which is
  // exactly when the network may be gone — so it is precached, not left to the
  // runtime cache to fill on first sight.
  "/icons/badge-96.png",
];

// Caps so a long-lived install cannot grow unbounded as deploys churn hashed
// chunk names. The runtime cache holds at most MAX_RUNTIME_ENTRIES responses;
// the page cache keeps only the most recent navigations.
const MAX_RUNTIME_ENTRIES = 120;
const MAX_PAGE_ENTRIES = 20;

self.addEventListener("install", (event) => {
  // Deliberately no skipWaiting() here. A new worker waits until every tab
  // running the old one closes, so a long-lived session (a teacher midway
  // through a form) is never half-swapped onto new assets. The UI notices the
  // waiting worker and asks the user to reload; that reload sends SKIP_WAITING.
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

// Apply a waiting update on the user's say-so (see ServiceWorkerRegister).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  // On logout, drop the caches that can hold per-user content: navigations
  // (cached HTML/pages) and the runtime cache. Cached bytes outlive the session
  // that fetched them, so without this a signed-out device could still read a
  // former user's pages from Cache Storage (CWE-524). The precache — public
  // static assets — is kept.
  if (event.data && event.data.type === "CLEAR_PRIVATE_CACHES") {
    event.waitUntil(
      Promise.all([caches.delete(PAGES), caches.delete(RUNTIME)]),
    );
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter(shouldDropCache).map((k) => caches.delete(k)),
          ),
        ),
      // Navigation preload: the browser starts the navigation request in
      // parallel with this worker's boot, so a network-first navigation does
      // not wait on worker startup. The fetch handler consumes
      // `event.preloadResponse`; with it unavailable (older browsers) it falls
      // back to its own fetch. Enable is idempotent.
      self.registration.navigationPreload &&
      self.registration.navigationPreload.enable
        ? self.registration.navigationPreload.enable().catch(() => undefined)
        : Promise.resolve(),
    ]).then(() => self.clients.claim()),
  );
});

/** The trailing `vN` of a cache name (or of `VERSION` itself), else null. */
function cacheVersion(name) {
  const match = /v(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a cache belongs to a version old enough to delete.
 *
 * The previous version's caches are kept, not just the current one. An accepted
 * update calls skipWaiting(), which takes control of *every* open tab at once —
 * but only the tab the user clicked in reloads. Another tab can still be
 * running the previous Next build and lazily ask for a hashed chunk that the
 * new build no longer serves; if its own HTTP cache has evicted that chunk, the
 * only other place it can come from is the cache this worker would have just
 * deleted. Keeping one version back gives those tabs their chunks until they
 * reload, and the version after next sweeps them.
 */
function shouldDropCache(name) {
  if (!name.startsWith(CACHE_PREFIX)) return false;
  const version = cacheVersion(name);
  if (version === null) return false; // not a versioned cache of ours; leave it
  return version < cacheVersion(VERSION) - 1;
}

/**
 * Trim a cache to `max` entries, oldest first.
 *
 * `cache.keys()` returns requests in insertion order, so deleting from the
 * front is a cheap least-recently-stored eviction. Not LRU by access, but it
 * bounds growth, which is the point.
 */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** Only cache responses that are worth serving later. */
function isCacheable(resp) {
  if (!resp || !resp.ok) return false;
  if (resp.type !== "basic" && resp.type !== "default") return false;
  // Honour the server's own cache contract: a `private`/`no-store` response is
  // not ours to keep, whatever the URL looks like.
  const cc = resp.headers.get("cache-control") || "";
  return !/\b(no-store|private)\b/i.test(cc);
}

function isImmutable(url) {
  // Next.js build output is content-hashed: a change means a new URL, so a
  // cache-first hit can never be stale.
  return url.pathname.startsWith("/_next/static/");
}

/**
 * Paths that must never be stored in Cache Storage, whatever they look like.
 *
 * `/uploads/**` is the only one today: student photos and documents behind
 * `uploadsAuth`. Cache Storage outlives the session that filled it, so keeping
 * one there leaves it readable by the next person on the device (CWE-524). Any
 * future same-origin route that serves per-user data goes in this list — the
 * alternative, inferring "private" from a file extension or a query string, is
 * exactly the guess that lets the next one through.
 */
const PRIVATE_PATH_PREFIXES = ["/uploads/"];

function isPrivatePath(url) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
  if (isPrivatePath(url)) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/") ||
    /\.(?:css|js|mjs|woff2?|ttf|png|jpe?g|svg|ico|webp|avif)$/.test(url.pathname)
  );
}

/**
 * Serve a public static asset without touching Cache Storage for private paths.
 *
 * A cache hit is returned before the network, so a stored copy is served with
 * no session check at all — which is why a private path must never reach the
 * cache in the first place. The guard here is the belt to `isStaticAsset`'s
 * braces: even if a private URL is routed through this handler, it is fetched
 * fresh every time and never stored.
 */
function cacheFirst(request, event) {
  const url = new URL(request.url);
  if (isPrivatePath(url)) return fetch(request);
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((resp) => {
      if (isCacheable(resp)) {
        const copy = resp.clone();
        // waitUntil keeps the write alive even if the page is closed mid-flight;
        // without it the browser may cancel the put and never cache the asset.
        event.waitUntil(
          caches
            .open(RUNTIME)
            .then((cache) => cache.put(request, copy))
            .then(() => trimCache(RUNTIME, MAX_RUNTIME_ENTRIES)),
        );
      }
      return resp;
    });
  });
}

/**
 * Mutable static assets: serve the cached copy, refresh in the background.
 *
 * Precache is consulted first. Public install assets (icons, manifest, the
 * notification badge) live in `PRECACHE`; without this lookup a cached-first
 * request that misses the runtime cache falls through to the network, which is
 * exactly what is unavailable offline — the notification badge then has no
 * image to render.
 */
function staleWhileRevalidate(request, event) {
  const url = new URL(request.url);
  if (isPrivatePath(url)) return fetch(request);
  return caches.open(RUNTIME).then(async (cache) => {
    const cached =
      (await cache.match(request)) ||
      (await caches.match(request, { cacheName: PRECACHE }));
    const network = fetch(request)
      .then(async (resp) => {
        if (isCacheable(resp)) {
          // Await the put *inside* the promise handed to waitUntil. If the write
          // is launched fire-and-forget, the browser may end the event as soon
          // as the fetch settles and abort the unfinished put — the stale copy
          // then never refreshes.
          try {
            await cache.put(request, resp.clone());
            await trimCache(RUNTIME, MAX_RUNTIME_ENTRIES);
          } catch {
            // A storage failure must not cost the caller a usable response.
          }
        }
        return resp;
      })
      .catch(() => cached);
    // Keep the refresh (fetch *and* its cache write) alive past the response.
    event.waitUntil(network.then(() => undefined).catch(() => undefined));
    return cached || network;
  });
}

/**
 * Navigations: network-first with real offline fallback.
 *
 * A successful page is stored so a later offline visit can still open the last
 * version of *that* page (not just the generic offline page), then the offline
 * page is the final fallback.
 *
 * Portal pages are dynamically rendered — the root layout reads cookies and
 * headers — so Next answers them `no-store`, and `isCacheable` honours that:
 * no per-page HTML is stored, and an offline reload of a portal route lands on
 * `/offline.html`. That is the deliberate choice, not an oversight. Caching a
 * signed-in page would put one user's rendered HTML in Cache Storage for the
 * next person on the device to read (CWE-524), and the same `no-store` the
 * server sends is the signal not to. Offline is promised at the app shell
 * (static assets, install, the offline page), not per-route.
 */
function navigationHandler(request, event) {
  // Navigation preload (see activate) already started the request, so we can
  // consume its result instead of fetching again. `preloadResponse` is a promise
  // that can resolve to `undefined` when the browser did not preload (preload
  // disabled, or it failed) — so await it and fall back to a real fetch rather
  // than passing `undefined` to respondWith, which fails the navigation outright.
  const network = Promise.resolve(event.preloadResponse)
    .then((preloaded) => (preloaded ? preloaded : fetch(request)))
    .catch(() => fetch(request));
  return network
    .then((resp) => {
      if (isCacheable(resp)) {
        const copy = resp.clone();
        event.waitUntil(
          caches
            .open(PAGES)
            .then((cache) => cache.put(request, copy))
            .then(() => trimCache(PAGES, MAX_PAGE_ENTRIES)),
        );
      }
      return resp;
    })
    .catch(() =>
      caches
        .match(request)
        .then((cached) => cached || caches.match(OFFLINE_URL)),
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls — auth/session data must stay fresh.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request, event));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      isImmutable(url)
        ? cacheFirst(request, event)
        : staleWhileRevalidate(request, event),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "Cipansor", body: "Anda punya notifikasi baru." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      // A monochrome white glyph on transparent, not the colour icon: Android
      // keeps only the badge alpha channel and tints the status-bar icon, so a
      // full-colour (or opaque) image renders as a solid blob.
      badge: "/icons/badge-96.png",
      // Carry the target URL on the notification so click can route to it.
      data: { url: payload.url || "/" },
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  // The payload URL comes from a push message, so treat it as untrusted. Resolve
  // it against our own origin and refuse to act on anything off-origin — a push
  // must not be able to open (or match) a foreign URL. Matching a client by
  // exact pathname, not `includes`, also stops `/dash` from claiming a click
  // meant for `/dashboard`.
  const resolved = new URL(target, self.location.origin);
  const safe =
    resolved.origin === self.location.origin
      ? resolved
      : new URL("/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (!client.url.startsWith(self.location.origin)) continue;
        if (new URL(client.url).pathname === safe.pathname && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(safe.href);
    }),
  );
});

// A push endpoint is not permanent: the push service rotates or revokes it
// outside the page's control, and this event is the browser's one chance to
// grab a replacement before the subscription is lost for good and the server's
// stored endpoint starts answering 410 Gone. Re-subscribe with the same key
// options so the new endpoint keeps working.
//
// The server row is deliberately NOT updated from here: the API requires a
// double-submit CSRF header on cookie-authenticated writes, and a service
// worker cannot read the `cipansor_csrf` cookie to produce it. The app's
// on-mount reconcile (useWebPush) re-registers whatever this handler leaves in
// `pushManager` on the next visit, so the pair converges then. Never throw:
// there is nothing the user can act on, and the next visit repairs it.
self.addEventListener("pushsubscriptionchange", (event) => {
  // Some browsers hand over the replacement directly; only fall back to a
  // fresh subscribe() when they did not.
  if (event.newSubscription) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription && event.oldSubscription.options)
      .catch(() => undefined),
  );
});
