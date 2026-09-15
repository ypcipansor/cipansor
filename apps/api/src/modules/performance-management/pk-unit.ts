/**
 * The unit a Perjanjian Kinerja belongs to — ONE rule, shared by reporting
 * (`analytics.service.ts`) and access (`PerformanceAgreementService.assertUnitScope`).
 *
 * The two drifted apart: reporting filed a PK anchored to RKA Yayasan under
 * the foundation while access control still treated it as the employee's
 * unit's, so a kepala SD IT anchored there vanished from SD IT's dashboard
 * while SD IT's admin could still manage the PK. Decided 2026-09-11: a PK
 * belongs to its employee's unit. A plan reference overrides the home unit
 * only when the plan names a unit of its own — a teacher implementing another
 * school's RKA is filed under that school.
 *
 *   plan with a unit                → that unit
 *   no plan, or a yayasan document  → the employee's home unit
 *   neither                         → null, a foundation-level PK
 */
export type PkUnitView = {
  strategicPlan?: { unitId: string | null } | null;
  user?: { unitId: string | null } | null;
};

export function pkOwnerUnitId(pk: PkUnitView): string | null {
  return pk.strategicPlan?.unitId ?? pk.user?.unitId ?? null;
}
