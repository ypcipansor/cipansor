// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/**
 * Behavioural tests for the real `public/sw.js`.
 *
 * The e2e suite cannot cover this: `ServiceWorkerRegister` deliberately skips
 * registration under `navigator.webdriver` (a navigation-intercepting worker
 * trips a WebKit+Playwright engine bug), so no Playwright run ever exercises
 * the fetch router. The file's *existence* is checked in `e2e/pwa.spec.ts`;
 * what it *does* is checked here, against the real source executed in a fake
 * service-worker global — no reimplementation of the routing under test.
 */

const SW_SOURCE = readFileSync(
  join(__dirname, "..", "..", "public", "sw.js"),
  "utf8",
);
const ORIGIN = "https://portal.test";

// Read the cache version out of the worker rather than hard-coding it: these
// tests seed and assert on versioned cache names, so a VERSION bump must not
// silently turn "the live cache is kept" into "a stale one survived".
const SW_VERSION = /const VERSION = "([^"]+)"/.exec(SW_SOURCE)?.[1];
if (!SW_VERSION) throw new Error("could not read VERSION from sw.js");

type Entry = { request: { url: string }; response: Response };

/** A Cache with just the surface sw.js touches, keyed by request URL. */
class FakeCache {
  entries: Entry[] = [];
  constructor(public name: string) {}
  async put(request: { url: string } | string, response: Response) {
    const url = normalize(request);
    this.entries = this.entries.filter((e) => e.request.url !== url);
    this.entries.push({ request: { url }, response });
  }
  async match(request: { url: string } | string) {
    const url = normalize(request);
    return this.entries.find((e) => e.request.url === url)?.response;
  }
  async keys() {
    return this.entries.map((e) => e.request);
  }
  async delete(request: { url: string } | string) {
    const url = normalize(request);
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.request.url !== url);
    return this.entries.length < before;
  }
  async addAll(urls: string[]) {
    for (const u of urls) {
      await this.put(u, html(`precached ${u}`));
    }
  }
}

/** CacheStorage resolves string keys against the SW scope; mirror that. */
function normalize(request: { url: string } | string): string {
  return typeof request === "string"
    ? new URL(request, ORIGIN).href
    : request.url;
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(name));
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(request: { url: string }) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

function html(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}
function asset(body: string) {
  return new Response(body, { status: 200 });
}

/** Load sw.js in a sandbox and return the captured listeners + fakes. */
function loadWorker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const cacheStorage = new FakeCacheStorage();
  const skipWaiting = vi.fn();
  const clientsClaim = vi.fn();
  const fetchMock = vi.fn();
  const enableNavigationPreload = vi.fn().mockResolvedValue(undefined);
  const pushSubscribe = vi.fn().mockResolvedValue({ endpoint: "https://new" });
  const showNotification = vi.fn();

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.set(type, fn);
    },
    skipWaiting,
    clients: {
      claim: () => Promise.resolve(clientsClaim()),
      matchAll: async () => [],
    },
    registration: {
      showNotification,
      navigationPreload: { enable: enableNavigationPreload },
      pushManager: { subscribe: pushSubscribe },
    },
  };

  const sandbox = {
    self,
    caches: cacheStorage,
    fetch: fetchMock,
    URL,
    Response,
    Request,
    Headers,
    console,
    setTimeout,
    Promise,
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);

  return {
    listeners,
    cacheStorage,
    skipWaiting,
    fetchMock,
    enableNavigationPreload,
    pushSubscribe,
    showNotification,
  };
}

/** Fire a fetch event and return whatever respondWith() was given. */
async function dispatchFetch(
  listeners: Map<string, (event: unknown) => void>,
  request: { url: string; method: string; mode: string },
  preloadResponse?: Promise<Response>,
) {
  let responded: Promise<Response> | undefined;
  listeners.get("fetch")?.({
    request,
    preloadResponse,
    respondWith: (p: Promise<Response>) => {
      responded = p;
    },
    waitUntil: () => undefined,
  });
  return responded ? await responded : undefined;
}

const nav = (path: string) => ({
  url: new URL(path, ORIGIN).href,
  method: "GET",
  mode: "navigate",
});
const get = (path: string) => ({
  url: new URL(path, ORIGIN).href,
  method: "GET",
  mode: "cors",
});

describe("sw.js fetch routing", () => {
  let worker: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    worker = loadWorker();
  });

  it("does not intercept /api/** (fresh auth data)", async () => {
    let responded: Promise<Response> | undefined;
    worker.listeners.get("fetch")?.({
      request: get("/api/notifications"),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: () => undefined,
    });
    expect(responded).toBeUndefined();
  });

  it("ignores non-GET requests", () => {
    let responded: Promise<Response> | undefined;
    worker.listeners.get("fetch")?.({
      request: {
        url: new URL("/x", ORIGIN).href,
        method: "POST",
        mode: "cors",
      },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: () => undefined,
    });
    expect(responded).toBeUndefined();
  });

  it("serves a navigation from the network and caches it for offline", async () => {
    worker.fetchMock.mockResolvedValue(html("live page"));
    const res = await dispatchFetch(worker.listeners, nav("/dashboard"));
    expect(await res!.text()).toBe("live page");

    // Give the waitUntil'd cache write a tick to settle.
    await new Promise((r) => setTimeout(r, 0));
    const pages = [...worker.cacheStorage.caches.values()].find((c) =>
      c.name.startsWith("cipansor-pages"),
    );
    expect(pages?.entries.length).toBe(1);
  });

  it("uses the navigation preload response without a second fetch", async () => {
    const res = await dispatchFetch(
      worker.listeners,
      nav("/dashboard"),
      Promise.resolve(html("preloaded page")),
    );
    expect(await res!.text()).toBe("preloaded page");
    // The preload already fetched it; the worker must not fetch again.
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the cached page when the network fails", async () => {
    // Prime the page cache with an earlier online visit.
    worker.fetchMock.mockResolvedValueOnce(html("cached dashboard"));
    await dispatchFetch(worker.listeners, nav("/dashboard"));
    await new Promise((r) => setTimeout(r, 0));

    worker.fetchMock.mockRejectedValue(new Error("offline"));
    const res = await dispatchFetch(worker.listeners, nav("/dashboard"));
    expect(await res!.text()).toBe("cached dashboard");
  });

  it("falls back to offline.html when nothing is cached", async () => {
    // Precache is populated by the install handler.
    worker.listeners.get("install")?.({
      waitUntil: (p: Promise<unknown>) => p,
    });
    await new Promise((r) => setTimeout(r, 0));

    worker.fetchMock.mockRejectedValue(new Error("offline"));
    const res = await dispatchFetch(worker.listeners, nav("/never-visited"));
    expect(await res!.text()).toContain("precached /offline.html");
  });

  it("serves immutable _next/static assets cache-first", async () => {
    worker.fetchMock.mockResolvedValueOnce(asset("chunk"));
    await dispatchFetch(worker.listeners, get("/_next/static/chunks/a.js"));
    await new Promise((r) => setTimeout(r, 0));
    const callsAfterFirst = worker.fetchMock.mock.calls.length;

    const res = await dispatchFetch(
      worker.listeners,
      get("/_next/static/chunks/a.js"),
    );
    expect(await res!.text()).toBe("chunk");
    // Cache hit: the second request never reached the network.
    expect(worker.fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("stale-while-revalidates mutable static assets", async () => {
    worker.fetchMock.mockResolvedValue(asset("v1"));
    await dispatchFetch(worker.listeners, get("/icons/icon-192.png"));
    await new Promise((r) => setTimeout(r, 0));

    worker.fetchMock.mockResolvedValue(asset("v2"));
    const res = await dispatchFetch(
      worker.listeners,
      get("/icons/icon-192.png"),
    );
    // Stale copy is served immediately…
    expect(await res!.text()).toBe("v1");
    await new Promise((r) => setTimeout(r, 0));
    // …and the background fetch refreshed the cache to v2.
    const runtime = [...worker.cacheStorage.caches.values()].find((c) =>
      c.name.startsWith("cipansor-runtime"),
    );
    const key = new URL("/icons/icon-192.png", ORIGIN).href;
    expect(await runtime!.match({ url: key })).toBeTruthy();
  });

  it("does not cache error responses", async () => {
    worker.fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await dispatchFetch(worker.listeners, get("/_next/static/chunks/b.js"));
    await new Promise((r) => setTimeout(r, 0));
    const runtime = [...worker.cacheStorage.caches.values()].find((c) =>
      c.name.startsWith("cipansor-runtime"),
    );
    expect(runtime?.entries.length ?? 0).toBe(0);
  });

  it("honours the server's own no-store/private cache-control", async () => {
    worker.fetchMock.mockResolvedValue(
      new Response("secret", {
        status: 200,
        headers: { "cache-control": "private, no-store" },
      }),
    );
    await dispatchFetch(worker.listeners, get("/_next/static/chunks/c.js"));
    await new Promise((r) => setTimeout(r, 0));
    const runtime = [...worker.cacheStorage.caches.values()].find((c) =>
      c.name.startsWith("cipansor-runtime"),
    );
    expect(runtime?.entries.length ?? 0).toBe(0);
  });

  it("never intercepts or caches /uploads/** (private per-user files)", () => {
    let responded: Promise<Response> | undefined;
    worker.listeners.get("fetch")?.({
      request: get("/uploads/students/photo.jpg"),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: () => undefined,
    });
    // Even though it looks like an image, the worker leaves it to the network.
    expect(responded).toBeUndefined();
  });

  it("fetches when navigation preload resolves undefined", async () => {
    // Older browsers / a disabled preload can resolve the promise to undefined;
    // passing that to respondWith would fail the navigation outright.
    worker.fetchMock.mockResolvedValue(html("fallback fetch"));
    const res = await dispatchFetch(
      worker.listeners,
      nav("/dashboard"),
      Promise.resolve(undefined as unknown as Response),
    );
    expect(await res!.text()).toBe("fallback fetch");
    expect(worker.fetchMock).toHaveBeenCalled();
  });
});

describe("sw.js logout cache purge", () => {
  it("drops the page + runtime caches on CLEAR_PRIVATE_CACHES, keeps precache", async () => {
    const worker = loadWorker();
    await worker.cacheStorage.open(`cipansor-pages-${SW_VERSION}`);
    await worker.cacheStorage.open(`cipansor-runtime-${SW_VERSION}`);
    await worker.cacheStorage.open(`cipansor-precache-${SW_VERSION}`);

    let work!: Promise<unknown>;
    worker.listeners.get("message")?.({
      data: { type: "CLEAR_PRIVATE_CACHES" },
      waitUntil: (p: Promise<unknown>) => {
        work = p;
      },
    });
    await work;

    const names = await worker.cacheStorage.keys();
    expect(names).not.toContain(`cipansor-pages-${SW_VERSION}`);
    expect(names).not.toContain(`cipansor-runtime-${SW_VERSION}`);
    // Public precached assets are not private data; they stay for offline use.
    expect(names).toContain(`cipansor-precache-${SW_VERSION}`);
  });

  it("does not skipWaiting on a CLEAR_PRIVATE_CACHES message", async () => {
    const worker = loadWorker();
    let work!: Promise<unknown>;
    worker.listeners.get("message")?.({
      data: { type: "CLEAR_PRIVATE_CACHES" },
      waitUntil: (p: Promise<unknown>) => {
        work = p;
      },
    });
    await work;
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
});

describe("sw.js lifecycle", () => {
  it("deletes caches from older versions on activate", async () => {
    const worker = loadWorker();
    // Seed a stale cache from a previous version plus a live one.
    await worker.cacheStorage.open("cipansor-precache-v2");
    await worker.cacheStorage.open(`cipansor-runtime-${SW_VERSION}`);

    let activation!: Promise<unknown>;
    worker.listeners.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => {
        activation = p;
      },
    });
    await activation;

    const names = await worker.cacheStorage.keys();
    expect(names).not.toContain("cipansor-precache-v2");
    expect(names).toContain(`cipansor-runtime-${SW_VERSION}`);
    // Navigation preload is enabled alongside the cache sweep.
    expect(worker.enableNavigationPreload).toHaveBeenCalled();
  });

  it("applies a waiting update only when told to (SKIP_WAITING)", () => {
    const worker = loadWorker();
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.listeners.get("message")?.({ data: { type: "SKIP_WAITING" } });
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
    // An unrelated message must not force an update.
    worker.listeners.get("message")?.({ data: { type: "PING" } });
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe("sw.js push notification rendering", () => {
  /** Fire a push event and return the work it handed to waitUntil. */
  async function dispatchPush(
    worker: ReturnType<typeof loadWorker>,
    payload: unknown,
  ) {
    let work!: Promise<unknown>;
    worker.listeners.get("push")?.({
      data: { json: () => payload },
      waitUntil: (p: Promise<unknown>) => {
        work = p;
      },
    });
    await work;
  }

  it("shows a notification with a monochrome badge, not the opaque icon", async () => {
    const worker = loadWorker();

    await dispatchPush(worker, { title: "Halo", body: "Ada setoran baru" });

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [, options] = worker.showNotification.mock.calls[0];
    // Android keeps only the badge's alpha channel and tints it, so an opaque
    // full-colour image (the old maskable square) renders as a solid blob.
    expect(options.badge).toBe("/icons/badge-96.png");
    expect(options.badge).not.toBe(options.icon);
  });

  it("falls back to a default title/body when the payload is not JSON", async () => {
    const worker = loadWorker();
    let work!: Promise<unknown>;
    worker.listeners.get("push")?.({
      data: {
        json: () => {
          throw new Error("not json");
        },
        text: () => "Pesan biasa",
      },
      waitUntil: (p: Promise<unknown>) => {
        work = p;
      },
    });
    await work;

    const [, options] = worker.showNotification.mock.calls[0];
    expect(options.body).toBe("Pesan biasa");
  });
});

describe("sw.js push subscription rotation", () => {
  /** Fire pushsubscriptionchange and return the work it handed to waitUntil. */
  function dispatchSubscriptionChange(
    listeners: Map<string, (event: unknown) => void>,
    event: { oldSubscription?: unknown; newSubscription?: unknown },
  ) {
    let work!: Promise<unknown>;
    listeners.get("pushsubscriptionchange")?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => {
        work = p;
      },
    });
    return work;
  }

  it("re-subscribes with the old options when the endpoint is rotated", async () => {
    const worker = loadWorker();
    const oldSubscription = { options: { userVisibleOnly: true } };

    await dispatchSubscriptionChange(worker.listeners, { oldSubscription });

    expect(worker.pushSubscribe).toHaveBeenCalledWith(oldSubscription.options);
  });

  it("keeps the browser-supplied replacement instead of re-subscribing", async () => {
    const worker = loadWorker();

    await dispatchSubscriptionChange(worker.listeners, {
      oldSubscription: { options: {} },
      newSubscription: { endpoint: "https://new" },
    });

    expect(worker.pushSubscribe).not.toHaveBeenCalled();
  });

  it("never rejects when re-subscribe fails", async () => {
    const worker = loadWorker();
    worker.pushSubscribe.mockRejectedValueOnce(new Error("denied"));

    await expect(
      dispatchSubscriptionChange(worker.listeners, {
        oldSubscription: { options: {} },
      }),
    ).resolves.toBeUndefined();
  });
});
