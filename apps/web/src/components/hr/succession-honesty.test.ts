import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * #410 removed three specific lies from the succession screens:
 *
 *   1. "AI Powered Recommendations" / "AI Suggestion Engine" / "AI-Driven
 *      Succession Recommendations" — the engine is a weighted sum.
 *   2. `competencyMatch ?? 0`, which drew a 0% bar for a candidate nobody had
 *      assessed. Not-measured is not a bad score.
 *   3. A headline percentage printed even when every term but the category
 *      base scored zero, so "Kepala Sekolah" and "zzzz nonsense" both returned
 *      80.
 *
 * All three are copy-and-render decisions, which is exactly the kind of thing
 * that creeps back one well-meaning edit at a time. These are source guards
 * rather than render tests because the failure mode is a string reappearing,
 * not a component misbehaving.
 */

const ROOT = path.join(__dirname, "..", "..");

// /hr/talenta and /hr/talenta/succession were merged into /talenta/succession.
// The guard has to follow the copy it protects: pointed at a deleted path it
// would either throw or, worse, scan nothing and pass.
const SURFACES = [
  "app/talenta/page.tsx",
  "app/talenta/succession/page.tsx",
  "components/hr/succession-planning-list.tsx",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Comments explain the rule; they must not be able to violate it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("succession screens — no AI branding on a weighted sum", () => {
  it("every succession surface exists (the guard cannot pass by scanning nothing)", () => {
    for (const rel of SURFACES) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("the word AI appears only where it is being denied", () => {
    const offenders: string[] = [];

    for (const rel of SURFACES) {
      const src = stripComments(read(rel));
      for (const m of src.matchAll(/\bAI\b/g)) {
        // "Penjumlahan berbobot, bukan model AI" is the disclaimer the page is
        // supposed to carry. Anything else is a claim we cannot back.
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (!/bukan\b/i.test(before)) {
          offenders.push(`${rel}: …${before.trim().slice(-30)}[AI]`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("the scoring method is stated on the page that shows the score", () => {
    const src = read("app/talenta/succession/page.tsx");
    expect(src).toContain("bukan model AI");
  });
});

describe("succession screens — an unmeasured candidate is not a zero", () => {
  it("competencyMatch is never coerced to 0 for display", () => {
    for (const rel of SURFACES) {
      const src = stripComments(read(rel));
      // `competencyMatch ?? 0` and `competencyMatch || 0` both turn "nobody
      // assessed this person" into a 0% progress bar that reads as a verdict.
      expect(src, rel).not.toMatch(/competencyMatch\s*(\?\?|\|\|)\s*0/);
    }
  });

  it("null competencyMatch renders as belum dinilai", () => {
    const src = read("components/hr/succession-planning-list.tsx");
    expect(src).toMatch(/competencyMatch === null/);
    expect(src).toContain("belum dinilai");
  });
});

describe("succession screens — the headline number is withheld when it means nothing", () => {
  it("the list consumes scoreReflectsOnlyCategory rather than always printing matchScore", () => {
    const src = stripComments(read("components/hr/succession-planning-list.tsx"));
    expect(src).toContain("scoreReflectsOnlyCategory");
  });

  it("the page asks the API about a real jabatan, so the competency term can fire", () => {
    // The service accepted targetPositionId from day one and nothing ever sent
    // one, which is why the only term grounded in recorded assessments was
    // permanently zero.
    const src = stripComments(read("app/talenta/succession/page.tsx"));
    expect(src).toContain("targetPositionId");
  });
});
