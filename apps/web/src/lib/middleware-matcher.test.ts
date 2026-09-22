import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
// The testing entry Next ships for exactly this assertion. The `next/experimental/
// testing/server` alias has no bundled `.d.ts`, so the deep path is used to keep
// the build type-clean; it is the same module the compiled middleware gate runs.
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils";
import { config, middleware } from "../../middleware";
import { PUBLIC_HOST, PORTAL_HOST } from "./host-split";

/**
 * `/public/wbs` is a page route, but it used to be excluded from middleware by
 * the matcher's `|public)` clause — the same word as the static-asset directory
 * behind it. Middleware therefore never ran for it, `hostSplitActionFor` never
 * saw it, and the whistleblowing page answered on both hosts: the portal served
 * an anonymous page the split says belongs to the apex, and the login wall the
 * split exists to enforce was bypassed on that one prefix.
 *
 * These tests pin the matcher through Next's own matcher helper, then drive the
 * real `middleware()` with the two production host headers, so the redirect
 * direction is exercised end to end rather than assumed.
 */
const matches = (pathname: string): boolean =>
  unstable_doesMiddlewareMatch({ config, url: pathname });

describe("middleware matcher — the /public page segment is not a static asset", () => {
  it("runs for the WBS submission page and its tracking subroute", () => {
    // Fails on the old matcher (both were excluded by `|public)`).
    expect(matches("/public/wbs")).toBe(true);
    expect(matches("/public/wbs/track")).toBe(true);
  });

  it("runs for the other /public page routes", () => {
    // The regression must not be fixed for WBS only; every page under the
    // segment needs the host split and the session wall to see it.
    for (const path of [
      "/public/spmb",
      "/public/spmb/track",
      "/public/verify-card",
      "/public/verify-letter",
      "/public/verify-sanad",
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("still excludes static assets and Next internals", () => {
    // The extension clause is what replaces the blanket `|public)` exclusion:
    // every file in the `public/` directory carries an extension, so none of
    // them is matched — while the extensionless page URL is.
    for (const path of [
      "/logo.png",
      "/sw.js",
      "/manifest.json",
      "/offline.html",
      "/public/images/hero.webp",
      "/public/icons/icon-192.png",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/api/health",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("still runs for application routes", () => {
    for (const path of ["/dashboard", "/profil", "/keuangan/invoice"]) {
      expect(matches(path), path).toBe(true);
    }
  });
});

describe("middleware host split for /public/wbs", () => {
  const request = (host: string, path: string) =>
    new NextRequest(`https://${host}${path}`, { headers: { host } });

  it("redirects a portal request to the canonical public host with 308", () => {
    const res = middleware(request(PORTAL_HOST, "/public/wbs"));

    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      `https://${PUBLIC_HOST}/public/wbs`,
    );
  });

  it("redirects the tracking subroute the same way", () => {
    const res = middleware(request(PORTAL_HOST, "/public/wbs/track"));

    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      `https://${PUBLIC_HOST}/public/wbs/track`,
    );
  });

  it("redirects every other /public page from the portal, no regression", () => {
    // The matcher fix routes the whole segment through middleware, so the
    // split must keep the canonical-host behaviour for the pages that were
    // previously exempt. A miss here would strand `/public/verify-card` (the
    // QR on printed student cards) on the portal.
    for (const path of [
      "/public/verify-card",
      "/public/verify-letter",
      "/public/verify-sanad",
      "/public/spmb",
      "/public/spmb/track",
    ]) {
      const res = middleware(request(PORTAL_HOST, path));
      expect(res.status, path).toBe(308);
      expect(res.headers.get("location"), path).toBe(
        `https://${PUBLIC_HOST}${path}`,
      );
    }
  });

  it("forwards an anonymous request on the public host", () => {
    // Anonymous is the whole point: no session, so it must not be bounced to
    // /login, and the public host is already the right one.
    const res = middleware(request(PUBLIC_HOST, "/public/wbs"));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(307);
  });

  it("forwards the tracking subroute on the public host", () => {
    const res = middleware(request(PUBLIC_HOST, "/public/wbs/track"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps /public/verify-card reachable on the public host, no regression", () => {
    const res = middleware(request(PUBLIC_HOST, "/public/verify-card"));

    expect(res.headers.get("location")).toBeNull();
  });
});
