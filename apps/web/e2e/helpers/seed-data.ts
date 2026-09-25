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
 * it was listed under, i.e. a genuinely unit-owned plan — and one with
 * objectives, which is what separates the seed's plans from those other specs
 * create on the fly.
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
    // Other specs create unit plans of their own — perencanaan-pengesahan
    // drafts "RKA SD IT uji pengesahan" in its beforeAll, with no objectives.
    // Picked up while that spec runs alongside, it leaves the finance spec with
    // no "+ Tambah Kegiatan" button: Chromium on main failed that way on
    // 3f7c77c4, and the same spec failed again on cfce2323. A seeded plan has
    // objectives; require them.
    for (const plan of plans.data ?? []) {
      if (plan.unitId !== unit.id) continue;
      const detail = await apiRequest<{ data: { objectives?: unknown[] } }>(
        session,
        "GET",
        `/perencanaan/${plan.id}`,
      ).catch(() => null);
      if ((detail?.data.objectives?.length ?? 0) > 0) return plan;
    }
  }
  throw new Error(
    "No unit-owned strategic plan with objectives found — is the database seeded?",
  );
}
