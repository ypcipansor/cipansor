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
