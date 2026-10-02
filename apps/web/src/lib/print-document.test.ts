import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TEST_COPY_STAMP } from "@cipansor/shared";
import { printDocument } from "./print-document";

/**
 * Certificates, kartu santri, transcripts and surat keterangan print from a
 * window of their own, which the app's TestCopyWatermark never reaches: a test
 * copy printed them unstamped until 2026-10-02. They now all print through
 * printDocument, which stamps on a test copy and escapes the title.
 */
function fakeWindow() {
  return {
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
}

let win: ReturnType<typeof fakeWindow>;
const written = () => win.document.write.mock.calls.map((c) => c[0]).join("");

beforeEach(() => {
  vi.useFakeTimers();
  win = fakeWindow();
  vi.spyOn(window, "open").mockReturnValue(win as unknown as Window);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const doc = { title: "Transkrip", head: "<style></style>", body: "<p>isi</p>" };

describe("printDocument", () => {
  it("stamps every page a test copy prints", () => {
    expect(printDocument({ ...doc, testCopy: true })).toBe(true);

    expect(written()).toContain(TEST_COPY_STAMP);
    expect(written()).toContain("position:fixed");
    expect(written()).toContain("<p>isi</p>");
  });

  it("stamps nothing in production, or before the answer is in", () => {
    printDocument({ ...doc, testCopy: false });
    printDocument({ ...doc, testCopy: undefined });

    expect(written()).not.toContain(TEST_COPY_STAMP);
  });

  it("escapes the title — a santri's name comes from public registration", () => {
    printDocument({
      ...doc,
      title: 'Transkrip - </title><img src=x onerror="alert(1)">',
      testCopy: false,
    });

    expect(written()).not.toContain("<img src=x");
    expect(written()).toContain("&lt;/title&gt;&lt;img");
  });

  it("prints, then closes the window", () => {
    printDocument({ ...doc, testCopy: false });
    vi.advanceTimersByTime(500);

    expect(win.print).toHaveBeenCalled();
    expect(win.close).toHaveBeenCalled();
  });

  it("says so when the browser blocked the window", () => {
    vi.mocked(window.open).mockReturnValue(null);

    expect(printDocument({ ...doc, testCopy: true })).toBe(false);
  });
});

describe("print windows", () => {
  const SRC = path.resolve(__dirname, "..");
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return files(p);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });

  it("are written only by printDocument, so none goes unstamped or unescaped", () => {
    const all = files(SRC);
    // The guard must scan something, or it passes by scanning nothing.
    expect(all.length).toBeGreaterThan(200);
    const writers = all
      .filter((f) => fs.readFileSync(f, "utf8").includes("document.write("))
      .map((f) => path.relative(SRC, f));

    expect(writers).toEqual([path.join("lib", "print-document.ts")]);
  });
});
