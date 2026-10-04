"use client";

import type { PublicExtracurricular } from "@cipansor/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { educationUnits } from "@/config/site";
import { usePublicExtracurriculars } from "@/hooks/use-extracurricular";
import type { Locale } from "@/locales";

/**
 * The extracurriculars on *Kegiatan*, as each unit keeps them in the portal
 * (decisions/fasilitas-dan-kegiatan-situs-publik.md) — so the list changes
 * when a unit adds or retires one, without a deploy.
 *
 * A name shows in the reader's language when the unit gave one, otherwise as
 * the unit wrote it; `dir="auto"` keeps a Latin fallback readable inside the
 * Arabic page. Units are named as registered, without "Cipansor"; the site never
 * translates them.
 */

/** "SD IT", "SMA Qur'an" — the registered name without the yayasan's. */
const unitLabel = (unitType: string) =>
  educationUnits
    .find((u) => u.unitType === unitType)
    ?.name.replace(/ Cipansor$/, "") ?? unitType;

const nameIn = (e: PublicExtracurricular, locale: Locale) =>
  (locale === "en" ? e.nameEn : locale === "ar" ? e.nameAr : null) ?? e.name;

export function PublicExtracurriculars({
  locale,
  categories,
  unavailable,
}: {
  locale: Locale;
  categories: Record<string, string>;
  unavailable: string;
}) {
  const { data, isLoading, isError } = usePublicExtracurriculars();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (isError || !data?.length) {
    return <p className="text-muted-foreground">{unavailable}</p>;
  }

  // The API orders by category, then name; keep that order per category.
  const groups = new Map<string, PublicExtracurricular[]>();
  for (const e of data) {
    groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
  }

  return (
    <div className="space-y-8" data-testid="public-extracurriculars">
      {[...groups.entries()].map(([category, items]) => (
        <section key={category} aria-labelledby={`ekskul-${category}`}>
          <h3
            id={`ekskul-${category}`}
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {categories[category] ?? category}
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => (
              <li
                key={e.name}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="font-semibold" dir="auto">
                  {nameIn(e, locale)}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {e.unitTypes.map((t) => (
                    <li
                      key={t}
                      dir="ltr"
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {unitLabel(t)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
