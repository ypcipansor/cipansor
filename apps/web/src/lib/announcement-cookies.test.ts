import { describe, it, expect, afterEach } from "vitest";
import {
  BANNER_DISMISS_COOKIE,
  BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS,
  writeBannerDismissCookie,
} from "./announcement-cookies";

/**
 * The cookie mirror of the banner dismissal. What matters is that the server can
 * read back the intake it was dismissed for, and that the cookie outlives the
 * `localStorage` entry it mirrors rather than lapsing first and letting a
 * dismissed banner flash in.
 */

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

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

  it("does not lapse before the localStorage entry it mirrors", () => {
    // localStorage has no expiry, so a one-year cookie would expire first and
    // the server would render a banner the browser then removes on hydration —
    // a flash on exactly the visit that should be silent. A two-year intake
    // dismissed in January 2027 is still open in February 2028.
    expect(BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(
      ONE_YEAR_SECONDS,
    );
    const write = captureCookieWrite();
    try {
      writeBannerDismissCookie("period-123");
      expect(write.read()).toContain(
        `max-age=${BANNER_DISMISS_COOKIE_MAX_AGE_SECONDS}`,
      );
    } finally {
      write.restore();
    }
  });
});
