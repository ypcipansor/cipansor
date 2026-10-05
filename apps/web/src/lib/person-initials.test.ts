import { describe, it, expect } from "vitest";
import { ORGANISATION } from "@cipansor/shared";
import { personInitials } from "./person-initials";

describe("personInitials", () => {
  it("reads the name, not the titles and degrees around it", () => {
    expect(personInitials("K.H. Drs. Tetep Abdullatip, M.Ag.")).toBe("TA");
    expect(personInitials("H.M. Rizkon Hakiki, Lc., Al-Hafidz")).toBe("RH");
    expect(personInitials("Ustadzah Ani Siti Nurasiah, S.Pd.")).toBe("AS");
    expect(personInitials("Aminudin")).toBe("A");
  });

  it("gives every office holder initials of their own name", () => {
    for (const group of ORGANISATION) {
      for (const h of group.holders) {
        const initials = personInitials(h.name);
        expect(initials, h.name).toMatch(/^[A-Z]{1,2}$/);
        expect(h.name, h.name).toContain(initials[0]);
      }
    }
  });
});
