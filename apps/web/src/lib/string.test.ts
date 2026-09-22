import { describe, it, expect } from "vitest";
import { escapeHtml, stripHtml } from "./string";

describe("stripHtml", () => {
  it("strips a simple tag and keeps the text content", () => {
    expect(stripHtml("<b>Hello</b>")).toBe("Hello");
  });

  it("strips nested tags", () => {
    expect(stripHtml("<div><p>Hello <b>world</b></p></div>")).toBe(
      "Hello world",
    );
  });

  it("strips malformed and concatenated tags without leaving one behind", () => {
    // Removing the inner `<script>` would concatenate the halves into a live
    // tag if the strip ran only once.
    expect(stripHtml("<<script>script>alert(1)")).not.toMatch(/<\/?script/i);
    expect(stripHtml("<scr<script>ipt>alert(1)")).not.toMatch(/<\/?script/i);
  });

  it("strips comments, declarations, doctype and processing instructions", () => {
    expect(stripHtml("before<!-- note -->after")).toBe("beforeafter");
    expect(stripHtml("before<!DOCTYPE html>after")).toBe("beforeafter");
    expect(stripHtml('before<?xml version="1.0"?>after')).toBe("beforeafter");
    // A comment spanning newlines is removed whole.
    expect(stripHtml("a<!--\n multi\n line \n-->b")).toBe("ab");
    // Concatenation across a removed comment must not re-form a tag.
    expect(stripHtml("<<!---->script>alert(1)")).not.toMatch(/<\/?script/i);
    expect(stripHtml("<scr<!--x-->ipt>alert(1)")).not.toMatch(/<\/?script/i);
  });

  it("matches the markup boundaries of the pattern it replaced", () => {
    // A `<!-- ... -->` run is matched as a comment; `<!-->` has no `-->`, so it
    // falls back to the declaration form `<! ... >` and is removed.
    expect(stripHtml("<!-->")).toBe("");
    expect(stripHtml("a<!-- x >b")).toBe("ab");
    // A processing instruction needs `?>` AND a body free of `<`/`>`. `<?xml>`
    // has neither terminator nor a legal body, so it stays literal text.
    expect(stripHtml("<?xml>")).toBe("<?xml>");
    expect(stripHtml("<?xml a>b?>")).toBe("<?xml a>b?>");
  });

  it("keeps a bare less-than that begins no markup", () => {
    expect(stripHtml("a < b")).toBe("a < b");
    expect(stripHtml("1 < 2 and 3 > 2")).toBe("1 < 2 and 3 > 2");
  });

  it("strips pathological input in linear time and terminates", () => {
    // Many unterminated `<a` plus many `<!`/`<?` starters: a quadratic or
    // backtracking pattern would blow up here. Unterminated starters are plain
    // text and may survive, so only the time bound and termination are asserted.
    const input = "<a".repeat(20000) + "<!" + "<?".repeat(20000);
    const start = Date.now();
    const out = stripHtml(input);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(typeof out).toBe("string");
    // Idempotent: a second pass changes nothing (fixed point already reached).
    expect(stripHtml(out)).toBe(out);
  });

  it("stays linear on a long run of comment starters", () => {
    // Regression for code scanning alert 49: the old comment alternative
    // `(?:[^-]|-(?!->))*` branched at every non-`-` character, so `<!--`
    // repeated made it exponential (80k took ~39s). The scanner must be linear.
    // None of these is a closed comment, so the text survives verbatim.
    const input = "<!--".repeat(200_000);
    const start = Date.now();
    const out = stripHtml(input);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(out).toBe(input);
  });

  it("stays linear on a long run of closed comments", () => {
    // Every `<!--` is closed, so each is a comment and all are removed.
    const input = "<!--x-->".repeat(100_000);
    const start = Date.now();
    const out = stripHtml(input);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(out).toBe("");
  });

  it("returns plain text unchanged when there is no markup", () => {
    expect(stripHtml("Just some text")).toBe("Just some text");
  });

  it("does not decode or re-escape HTML entities", () => {
    // Entities are literal text here: stripping tags must not turn `&lt;` into
    // `<` (decoding) nor `&` into `&amp;` (escaping).
    expect(stripHtml("a &lt; b &amp; c")).toBe("a &lt; b &amp; c");
    expect(stripHtml('say "hi" & <b>bye</b>')).toBe('say "hi" & bye');
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes the special characters once", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#039;",
    );
  });
});
