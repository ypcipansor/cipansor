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

  it("reaches the fixed point on layered tag fragments in one pass", () => {
    // Each `>` closes one layer, so the old whole-string loop needed one round
    // per layer (`"<a".repeat(n) + ">".repeat(n)` took n+1 rounds). The result
    // must still be empty, and must be reached without the quadratic loop.
    for (const n of [1, 2, 5, 25, 250, 2000]) {
      expect(stripHtml("<a".repeat(n) + ">".repeat(n))).toBe("");
      expect(stripHtml("<a".repeat(n) + "b".repeat(n) + ">".repeat(n))).toBe(
        "",
      );
    }
    // A `<` may only be consumed once even when the `<`s outnumber the `>`s.
    expect(stripHtml("<".repeat(2000) + "a".repeat(2000) + ">".repeat(2000))).toBe(
      "<".repeat(1999) + ">".repeat(1999),
    );
  });

  it("matches a single-pass reference on random non-comment input", () => {
    // Differential fuzz against an independent oracle. Comment-free input has
    // no fusion ambiguity, so the oracle and the scanner must agree exactly;
    // any divergence is a scanner bug. Deterministic PRNG keeps this
    // reproducible (no flake) while still exploring the character space.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const chars = "<>/!?ab \n".split("");
    for (let round = 0; round < 4000; round++) {
      const length = Math.floor(rand() * 24);
      let input = "";
      for (let i = 0; i < length; i++) {
        input += chars[Math.floor(rand() * chars.length)];
      }
      expect(stripHtml(input)).toBe(referenceStrip(input, false));
    }
  });

  it("leaves no complete markup run behind on random markup soup", () => {
    // Invariant fuzz: whatever survives must not itself contain a removable
    // run, i.e. the result is a fixed point. Also idempotent.
    let seed = 0x51ed270;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const atoms = [
      "<a",
      "<a>",
      "</a>",
      "<!--",
      "-->",
      "<!",
      "<?",
      ">",
      "?>",
      "script",
      "<",
      "!",
      "?",
      "-",
      "a",
      " ",
    ];
    for (let round = 0; round < 4000; round++) {
      const count = Math.floor(rand() * 14);
      let input = "";
      for (let i = 0; i < count; i++) {
        input += atoms[Math.floor(rand() * atoms.length)];
      }
      const out = stripHtml(input);
      expect(hasCompleteRun(out)).toBe(false);
      expect(stripHtml(out)).toBe(out);
    }
  });

  it("grows sub-quadratically on adversarially layered input", () => {
    // A single generous timeout would not catch the O(n²) regression: the old
    // fixed-point loop removed one layer per pass, so `"<a".repeat(n) +
    // ">".repeat(n)` took n+1 rounds. At these sizes the old code needs seconds
    // and its time ratio is ~4× per doubling; the scanner is linear (~2×).
    // Both an absolute bound and the ratio are asserted, and the absolute bound
    // fires on the first old-code iteration so a regression fails fast.
    const layered = (n: number) => "<a".repeat(n) + ">".repeat(n);
    const time = (n: number) => {
      layered(1000); // warm up the JIT and the allocation paths
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        expect(stripHtml(layered(n))).toBe("");
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(1500);
        best = Math.min(best, elapsed);
      }
      return best;
    };

    const base = time(15000);
    const doubled = time(30000);
    // Quadratic would give ~4×; linear gives ~2×. 3× leaves CI headroom while
    // still failing the old implementation.
    expect(doubled / Math.max(base, 0.05)).toBeLessThan(3);
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

/**
 * Independent oracle used only by the tests above. It re-scans the whole string
 * per pass and loops to a fixed point, which is exactly the pre-change
 * behaviour `stripHtml` must keep; the scanner is compared against it.
 * `allowComments` is false for the differential fuzz because comment fusion in
 * the scanner's output buffer is the one place it intentionally differs from a
 * re-scanning reference, and that path is covered by the fixed-point fuzz.
 */
function referenceStrip(text: string, allowComments = true): string {
  let current = text;
  for (;;) {
    const next = singleReferencePass(current, allowComments);
    if (next === current) return current;
    current = next;
  }
}

function singleReferencePass(text: string, allowComments: boolean): string {
  const startsRun = (i: number): number => {
    if (allowComments && text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i + 4);
      if (close !== -1) return close + 3;
    }
    const next = text[i + 1];
    if (next === "!") {
      let j = i + 2;
      while (j < text.length && text[j] !== ">" && text[j] !== "<") j++;
      return j < text.length && text[j] === ">" ? j + 1 : -1;
    }
    if (next === "?") {
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === "<" || text[j] === ">") return -1;
        if (text[j] === "?" && text[j + 1] === ">") return j + 2;
        j++;
      }
      return -1;
    }
    let nameStart = i + 1;
    if (next === "/") nameStart++;
    const first = text[nameStart];
    if (first === undefined || !/[a-z]/i.test(first)) return -1;
    let j = nameStart;
    while (j < text.length && text[j] !== ">" && text[j] !== "<") j++;
    return j < text.length && text[j] === ">" ? j + 1 : -1;
  };

  let result = "";
  let copiedTo = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "<") continue;
    const end = startsRun(i);
    if (end === -1) continue;
    result += text.slice(copiedTo, i);
    copiedTo = end;
    i = end - 1;
  }
  return result + text.slice(copiedTo);
}

/** True when one reference pass would still change the text. */
function hasCompleteRun(text: string): boolean {
  return singleReferencePass(text, true) !== text;
}

describe("escapeHtml", () => {
  it("escapes the special characters once", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#039;",
    );
  });
});
