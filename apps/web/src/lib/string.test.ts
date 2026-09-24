import { describe, it, expect } from "vitest";
import { EMAIL_PATTERN, escapeHtml, isEmail, slugify } from "./string";
import { email } from "./validation";

describe("escapeHtml", () => {
  it("escapes the special characters once", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#039;",
    );
  });
});

describe("isEmail / EMAIL_PATTERN", () => {
  it("accepts ordinary addresses", () => {
    for (const ok of [
      "a@b.co",
      "santri.putra@cipansor.or.id",
      "x+y@sub.domain.id",
    ]) {
      expect(isEmail(ok), ok).toBe(true);
    }
  });

  it("rejects what is not an address, including empty domain labels", () => {
    for (const bad of [
      "",
      "a@b",
      "a b@c.id",
      "a@@b.id",
      "a@b..id",
      "a@.b.id",
      "a@b.id.",
      "@b.id",
    ]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });

  it("stays linear on the input CodeQL flagged (#18): '!@!' + many '!.' with no valid end", () => {
    const hostile = "!@!" + ".!".repeat(20000) + " ";
    const started = performance.now();
    expect(EMAIL_PATTERN.test(hostile)).toBe(false);
    // The old pattern backtracked quadratically here (seconds); linear is ~1 ms.
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("is the pattern the form validator uses", () => {
    expect(email().validate("a@b..id")).toBe(false);
    expect(email().validate("santri@cipansor.or.id")).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases, collapses separators and trims the dashes", () => {
    expect(slugify("  Berita  Terbaru  ")).toBe("berita-terbaru");
    expect(slugify("Halo, Dunia!")).toBe("halo-dunia");
    expect(slugify("Tahun 2026/2027")).toBe("tahun-20262027");
    expect(slugify("---abc---")).toBe("abc");
    expect(slugify("_under_score_")).toBe("under-score");
  });

  it("returns an empty string for empty, blank and all-dash input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("  ")).toBe("");
    expect(slugify("---")).toBe("");
  });

  it("stays fast on a long dash run (#18 js/polynomial-redos)", () => {
    // The old trailing /-+$/ was reported as polynomial on dash runs. Feed it
    // the pattern CodeQL names and assert it completes promptly.
    const hostile = "a" + "-".repeat(200000);
    const started = performance.now();
    expect(slugify(hostile)).toBe("a");
    expect(performance.now() - started).toBeLessThan(200);
  });
});
