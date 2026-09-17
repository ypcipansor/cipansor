import { describe, it, expect } from "vitest";
import { createBoardSuspensionSchema, PLH_ROLE_CODES } from "@cipansor/shared";
import {
  boardSuspensionFormDefaults,
  plhSelectionPatch,
} from "./pengawasan-form";

/**
 * The suspension form's Plh/Plt pair is all-or-nothing, so the defaults and the
 * person-picker patch are what keep the form valid while the operator edits it.
 * These drive the form's values through the same shared schema the API uses.
 */
describe("board suspension form defaults", () => {
  it("submits without a Plh/Plt", () => {
    const values = {
      ...boardSuspensionFormDefaults(),
      userId: "11111111-1111-4111-8111-111111111111",
      skNumber: "SK/001/PENGAWAS/2026",
      auditReason: "Alasan audit yang cukup panjang untuk lolos validasi.",
    };

    expect(createBoardSuspensionSchema.safeParse(values).success).toBe(true);
  });

  it("starts with no role paired to the empty Plh user", () => {
    const defaults = boardSuspensionFormDefaults();
    expect(defaults.plhUserId).toBe("");
    expect(defaults.plhRoleCode).toBe("");
  });

  it("submits a complete Plh/Plt pair", () => {
    const values = {
      ...boardSuspensionFormDefaults(),
      userId: "11111111-1111-4111-8111-111111111111",
      skNumber: "SK/001/PENGAWAS/2026",
      auditReason: "Alasan audit yang cukup panjang untuk lolos validasi.",
      plhUserId: "22222222-2222-4222-8222-222222222222",
      plhRoleCode: PLH_ROLE_CODES[0],
    };

    expect(createBoardSuspensionSchema.safeParse(values).success).toBe(true);
  });
});

describe("plhSelectionPatch", () => {
  it("clears the role when the person is cleared", () => {
    expect(plhSelectionPatch("")).toEqual({ plhUserId: "", plhRoleCode: "" });
  });

  it("leaves the role alone when a person is chosen", () => {
    const patch = plhSelectionPatch("22222222-2222-4222-8222-222222222222");
    expect(patch.plhUserId).toBe("22222222-2222-4222-8222-222222222222");
    expect(patch.plhRoleCode).toBeUndefined();
  });

  it("keeps a person-only edit out of an invalid half-pair", () => {
    // Operator had chosen a person + role, then clears the person. Applying
    // the patch must leave neither field set, which the schema accepts.
    const values = {
      ...boardSuspensionFormDefaults(),
      userId: "11111111-1111-4111-8111-111111111111",
      skNumber: "SK/001/PENGAWAS/2026",
      auditReason: "Alasan audit yang cukup panjang untuk lolos validasi.",
      plhUserId: "22222222-2222-4222-8222-222222222222",
      plhRoleCode: PLH_ROLE_CODES[0],
    };

    Object.assign(values, plhSelectionPatch(""));

    expect(values.plhUserId).toBe("");
    expect(values.plhRoleCode).toBe("");
    expect(createBoardSuspensionSchema.safeParse(values).success).toBe(true);
  });
});
