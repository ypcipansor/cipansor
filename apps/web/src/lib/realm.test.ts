import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { REALM_COLORS, REALM_LABELS, realmColor, realmLabel } from "./realm";

/**
 * The badge maps cover every value of the Prisma `Realm` enum. They drifted
 * once — `TK` and `SMA_ALQURAN` after the enum became `TK_QURAN` and
 * `SMA_QURAN` — and every TK Qur'an, SMA Qur'an, pesantren and business role
 * got an empty pill in the header. Read from the schema itself, so a new realm
 * fails here instead of rendering blank.
 */
const SCHEMA = path.resolve(__dirname, "../../../api/prisma/schema.prisma");

function realmEnum(): string[] {
  const source = fs.readFileSync(SCHEMA, "utf8");
  const block = /enum Realm \{([^}]*)\}/.exec(source)?.[1];
  if (!block) throw new Error("enum Realm not found in schema.prisma");
  return block
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

describe("realm badges", () => {
  const realms = realmEnum();

  it("reads the enum", () => {
    expect(realms).toContain("TK_QURAN");
    expect(realms.length).toBeGreaterThanOrEqual(8);
  });

  it.each(realmEnum())("%s has a label and a colour", (realm) => {
    expect(REALM_LABELS[realm]).toBeTruthy();
    expect(REALM_COLORS[realm]).toMatch(/^bg-/);
  });

  it("keys nothing the enum does not have", () => {
    for (const key of [
      ...Object.keys(REALM_LABELS),
      ...Object.keys(REALM_COLORS),
    ]) {
      expect(realms).toContain(key);
    }
  });

  it("an unknown realm still shows something", () => {
    expect(realmLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(realmColor("SOMETHING_NEW")).toBe("bg-slate-500");
  });
});
