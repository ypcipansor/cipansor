import { describe, it, expect } from "vitest";
import { escapeHtml } from "./string";

describe("escapeHtml", () => {
  it("escapes the special characters once", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#039;",
    );
  });
});
