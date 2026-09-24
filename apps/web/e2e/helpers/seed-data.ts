import { apiRequest, type AuthSession } from "./auth-api";

/**
 * Lookups against the real seeded database, used by specs that need an
 * existing record's id (instead of stubbing the API with a fake one).
 */

export interface SeededPlan {
  id: string;
  title: string;
  unitId: string;
}

/**
 * Find a seeded strategic plan that lives on a unit. Callers here scope a risk
 * or audit to `plan.unitId`, so a foundation-wide plan (the yayasan's
 * RPJP/Renstra/consolidated RKA, filed against no unit) is not usable — and
 * those now surface under every unit's list via the foundation-scope read
 * path. Walk the units and return the first plan whose unitId matches the unit
 * it was listed under, i.e. a genuinely unit-owned plan.
 */
export async function findStrategicPlan(
  session: AuthSession,
): Promise<SeededPlan> {
  const units = await apiRequest<{ data: Array<{ id: string; name: string }> }>(
    session,
    "GET",
    "/units",
  );
  for (const unit of units.data ?? []) {
    const plans = await apiRequest<{ data: SeededPlan[] }>(
      session,
      "GET",
      `/perencanaan?unitId=${unit.id}`,
    );
    const unitOwned = plans.data?.find((p) => p.unitId === unit.id);
    if (unitOwned) return unitOwned;
  }
  throw new Error(
    "No unit-owned strategic plan found — is the database seeded?",
  );
}
