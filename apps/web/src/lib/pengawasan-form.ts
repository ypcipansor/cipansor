/**
 * Board-suspension form defaults and the one rule that keeps the Plh/Plt pair
 * valid while the operator edits it.
 *
 * `createBoardSuspensionSchema` treats `plhUserId`+`plhRoleCode` as
 * all-or-nothing. A blank form therefore has to be blank on *both* fields: a
 * default role with no user failed validation on submit, and the operator had
 * to clear the role by hand before the form would go through.
 */

/** A blank suspension form. No Plh is the normal case and must be submittable. */
export function boardSuspensionFormDefaults(): {
  userId: string;
  skNumber: string;
  auditReason: string;
  documentUrl: string;
  plhUserId: string;
  plhRoleCode: string;
} {
  return {
    userId: "",
    skNumber: "",
    auditReason: "",
    documentUrl: "",
    plhUserId: "",
    plhRoleCode: "",
  };
}

/**
 * The fields to write when the operator picks or clears the Plh/Plt person.
 * Clearing the person clears the role with it, so the pair never ends up half
 * filled. Picking a person leaves the role as-is for the operator to choose.
 */
export function plhSelectionPatch(plhUserId: string): {
  plhUserId: string;
  plhRoleCode?: string;
} {
  return plhUserId ? { plhUserId } : { plhUserId, plhRoleCode: "" };
}
