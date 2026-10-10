import { describe, it, expect, afterEach } from "vitest";
import {
  BANNER_DISMISS_COOKIE,
  BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS,
  readBannerDismissCookie,
  writeBannerDismissCookie,
} from "./announcement-cookies";

/**
 * The banner dismissal cookie — the one store the server and the browser both
 * read. What matters is that the intake it was dismissed for reads back the
 * same on both sides, and that its lifetime is one a browser actually keeps.
 */

afterEach(() => {
  document.cookie = `${BANNER_DISMISS_COOKIE}=; path=/; max-age=0`;
});

/** Capture the raw `Set-Cookie` string, which the `cookie` getter hides. */
function captureCookieWrite(): { read: () => string; restore: () => void } {
  const original = Object.getOwnPropertyDescriptor(document, "cookie");
  let written = "";
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => written,
    set: (value: string) => {
      written = value;
    },
  });
  return {
    read: () => written,
    restore: () => {
      if (original) Object.defineProperty(document, "cookie", original);
      else delete (document as { cookie?: unknown }).cookie;
    },
  };
}

describe("writeBannerDismissCookie", () => {
  it("records the dismissed intake where the server can read it", () => {
    const write = captureCookieWrite();
    try {
      writeBannerDismissCookie("period-123");
      expect(write.read()).toContain(`${BANNER_DISMISS_COOKIE}=period-123`);
    } finally {
      write.restore();
    }
  });

  it("asks for no more than the 400 days a browser keeps", () => {
    // Chrome and Edge clamp any longer Max-Age to 400 days (RFC 6265bis); a
    // longer value only pretends to a lifetime nobody gets.
    expect(BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS).toBe(400 * 24 * 60 * 60);
    const write = captureCookieWrite();
    try {
      writeBannerDismissCookie("period-123");
      expect(write.read()).toContain(
        `max-age=${BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS}`,
      );
      expect(write.read()).toContain("samesite=lax");
    } finally {
      write.restore();
    }
  });
});

describe("readBannerDismissCookie", () => {
  it("reads back the intake the banner was dismissed for", () => {
    expect(readBannerDismissCookie()).toBeNull();
    writeBannerDismissCookie("period-9");
    expect(readBannerDismissCookie()).toBe("period-9");
  });

  it("ignores a cookie whose name only starts the same way", () => {
    document.cookie = `${BANNER_DISMISS_COOKIE}-old=period-1; path=/`;
    try {
      expect(readBannerDismissCookie()).toBeNull();
    } finally {
      document.cookie = `${BANNER_DISMISS_COOKIE}-old=; path=/; max-age=0`;
    }
  });
});
