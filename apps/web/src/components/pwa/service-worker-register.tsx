"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (/sw.js) once, in the browser, on a secure
 * context. Kept as a tiny client component so the rest of the app tree stays
 * server-rendered. Registration is skipped in development to avoid caching the
 * dev bundle.
 *
 * It is also skipped under browser automation (`navigator.webdriver`). A
 * navigation-intercepting service worker trips a known WebKit + Playwright bug
 * ("WebKit encountered an internal error" during navigation), which cascades
 * into flaky waitForURL/visibility failures. Real users never run with
 * `webdriver === true`, so this preserves the full PWA (install/offline)
 * experience for them while keeping the e2e suite deterministic across engines.
 *
 * `enabled={false}` — the public site, see `pwaEnabledForHost` — does not merely
 * skip registration. It actively removes what is already there. That asymmetry
 * is the whole reason this component still renders on a host with no PWA: a
 * service worker outlives the page that installed it, so the apex would keep
 * serving cached marketing pages through a worker no code registers any more,
 * and no future deploy would ever dislodge it.
 */
/**
 * Seed planted in localStorage just before the reload that applies an update.
 *
 * `controllerchange` also fires for the first-install claim; guarding on this
 * flag means the auto-reload only happens for an update the user accepted.
 */
export const SW_UPDATE_RELOAD_FLAG = "pwa-sw-updated";

declare global {
  interface Window {
    __swWaiting?: ServiceWorker | null;
  }
}

/**
 * Tell the update prompt there is a waiting worker.
 *
 * Registration runs on `load`, which can beat React's mount, so the waiting
 * worker is both stashed on `window` and announced by an event: a mounted
 * prompt hears the event, and one that mounts later reads the stash — the same
 * before/after-mount race InstallPrompt handles for `beforeinstallprompt`.
 */
function announceUpdate(worker: ServiceWorker) {
  window.__swWaiting = worker;
  window.dispatchEvent(new Event("sw-update-ready"));
}

export function ServiceWorkerRegister({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (!enabled) {
      // Unregister unconditionally — including in development and under
      // automation, unlike registration below. Those two guards exist to avoid
      // *creating* a worker; none of them is a reason to leave a stale one in
      // place once this host has stopped shipping a PWA.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() =>
          // The registration is gone but its Cache Storage is not, and sw.js
          // serves static assets cache-first. Left behind, a stale bundle would
          // outlive the worker that cached it.
          "caches" in window
            ? caches
                .keys()
                .then((keys) =>
                  Promise.all(
                    keys
                      .filter((k) => k.startsWith("cipansor-"))
                      .map((k) => caches.delete(k)),
                  ),
                )
            : undefined,
        )
        .catch(() => {
          // Nothing to recover from: the page works either way, and a console
          // error on the marketing site helps nobody.
        });
      return;
    }

    if (process.env.NODE_ENV !== "production") return;
    if (navigator.webdriver) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // A new worker that is already waiting (an update installed while a
          // previous tab was open) will never fire `updatefound` again; tell
          // the UI immediately so the reload prompt can appear.
          if (registration.waiting && navigator.serviceWorker.controller) {
            announceUpdate(registration.waiting);
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              // `controller` is null on the very first install — there is
              // nothing to update from, so stay quiet then.
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                announceUpdate(installing);
              }
            });
          });
        })
        .catch((err) => {
          // Non-fatal: the app works without the SW, just without offline/install.
          console.error("Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, [enabled]);

  return null;
}
