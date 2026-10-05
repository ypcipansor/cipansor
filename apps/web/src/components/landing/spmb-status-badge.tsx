"use client";

import { useMemo } from "react";
import { spmbAnnouncementOf } from "@cipansor/shared";
import { usePublicIntakes } from "@/hooks/use-admissions";
import { spmbContentFor } from "@/config/spmb.i18n";
import { dateFormatterFor } from "@/lib/locale-format";
import type { Locale } from "@/locales";

/**
 * The homepage badge announcing admission status.
 *
 * It was fixed copy reading "SPMB 2026 Telah Dibuka" — a hardcoded claim that
 * outlived whatever intake it was written for. It contradicted the very page
 * it sat above: the record's most recent period closed on 31 May 2024, so
 * /public/spmb correctly showed "Pendaftaran Telah Ditutup" while the homepage
 * invited people to register. It also named a year no record contained.
 *
 * It reads the units' intakes through the same rule as the site-wide
 * announcement — `spmbAnnouncementOf` — so the two cannot disagree: "dibuka"
 * only while some unit takes registrations (not between two waves, when the
 * API refuses them), else the day the next one opens, else nothing at all. The
 * year comes from the intake's academic year rather than being written into the
 * markup.
 *
 * The wrapper keeps its height whether or not a badge renders, so resolving
 * the query cannot shift the <h1> beneath it.
 */
export function SpmbStatusBadge({ locale }: { locale: Locale }) {
  const { data: intakes = [] } = usePublicIntakes();
  const copy = spmbContentFor(locale);

  const announcement = useMemo(() => spmbAnnouncementOf(intakes), [intakes]);
  const year = announcement?.period.academicYear ?? "";
  const label = !announcement
    ? null
    : announcement.window === "open"
      ? copy.badgeOpen(year)
      : copy.badgeOpens(
          year,
          dateFormatterFor(locale).format(
            new Date(announcement.period.opensAt!),
          ),
        );

  return (
    <div className="flex h-6 items-center justify-center">
      {label && (
        <span
          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary/10 text-primary"
          data-testid="spmb-status-badge"
        >
          {label.replace(/\s+/g, " ").trim()}
        </span>
      )}
    </div>
  );
}
