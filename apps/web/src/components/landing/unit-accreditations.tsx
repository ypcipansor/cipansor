"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Award, ExternalLink, FileText } from "lucide-react";
import { BAN_PDM_LOOKUP_URL } from "@cipansor/shared";
import type { PublicAccreditation } from "@cipansor/shared";
import { Card, CardContent } from "@/components/ui/card";
import { accreditationContentFor } from "@/config/accreditation.i18n";
import { educationUnits } from "@/config/site";
import {
  publicCertificateUrl,
  usePublicAccreditations,
} from "@/hooks/use-unit-accreditation";
import { dateFormatterFor } from "@/lib/locale-format";
import type { Locale } from "@/locales";

/**
 * A unit's accreditation on the public site (decisions/akreditasi-unit.md):
 * the certificate in force, as the portal records it — rating, numbers, NPSN,
 * last day, the PDF, and a link to check it at BAN-PDM.
 *
 * A unit with no certificate in force is not mentioned at all, and neither is
 * the section when no unit has one: a "coming soon" line would read as "not
 * accredited". The API already drops a certificate the day after its last
 * day, so the site never states one that has run out.
 *
 * Client-side, like /public/verify-card: the public pages are otherwise
 * static, and this is the one fact on them that an admin changes in the
 * portal.
 */

/** A calendar day (yyyy-MM-dd) in the reader's locale. */
const dayIn = (locale: Locale, day: string) =>
  dateFormatterFor(locale).format(new Date(`${day}T12:00:00.000Z`));

/** Public-site order (TK → Takhosus); a unit type the site has no page for goes last. */
const orderOf = (unitType: string) => {
  const i = educationUnits.findIndex((u) => u.unitType === unitType);
  return i === -1 ? educationUnits.length : i;
};

const slugOf = (unitType: string) =>
  educationUnits.find((u) => u.unitType === unitType)?.slug;

/** An identifier as issued — kept left-to-right inside Arabic text. */
function Ident({ children }: { children: React.ReactNode }) {
  return (
    <span dir="ltr" className="font-mono">
      {children}
    </span>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-2.5 last:border-b-0 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium sm:mt-0">{children}</dd>
    </div>
  );
}

/** The section on /profil/legalitas: every unit with a certificate in force. */
export function AccreditationSection({ locale }: { locale: Locale }) {
  const { data } = usePublicAccreditations();
  const copy = accreditationContentFor(locale);
  const shown = [...(data ?? [])].sort(
    (a, b) => orderOf(a.unitType) - orderOf(b.unitType),
  );

  // A unit page links to #akreditasi, which exists only once the data is in.
  useEffect(() => {
    if (shown.length && window.location.hash === "#akreditasi") {
      document.getElementById("akreditasi")?.scrollIntoView();
    }
  }, [shown.length]);

  if (!shown.length) return null;

  return (
    <section aria-labelledby="akreditasi" className="mt-14 max-w-4xl">
      <h2
        id="akreditasi"
        className="flex scroll-mt-24 items-center gap-2 text-2xl font-semibold tracking-tight"
      >
        <Award className="h-5 w-5 text-primary" aria-hidden="true" />
        {copy.heading}
      </h2>
      <p className="mt-4 leading-relaxed text-muted-foreground">{copy.intro}</p>
      <div className="mt-6 space-y-4">
        {shown.map((a) => (
          <AccreditationCard key={a.id} accreditation={a} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function AccreditationCard({
  accreditation: a,
  locale,
}: {
  accreditation: PublicAccreditation;
  locale: Locale;
}) {
  const copy = accreditationContentFor(locale);
  const slug = slugOf(a.unitType);
  return (
    <Card role="article" aria-label={a.unitName}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-lg font-semibold">
            {slug ? (
              <Link
                href={`/unit/${slug}`}
                className="underline-offset-4 hover:underline"
              >
                {a.unitName}
              </Link>
            ) : (
              a.unitName
            )}
          </h3>
          <p className="text-xl font-bold text-primary">
            {copy.accredited(a.rating)}
          </p>
        </div>
        <dl className="mt-3">
          <Fact label={copy.certificateLabel}>
            <Ident>{a.certificateNumber}</Ident>
          </Fact>
          <Fact label={copy.decreeLabel}>
            <Ident>{a.decreeNumber}</Ident>
          </Fact>
          <Fact label={copy.decreeDateLabel}>{dayIn(locale, a.decreedAt)}</Fact>
          {a.npsn && (
            <Fact label={copy.npsnLabel}>
              <Ident>{a.npsn}</Ident>
            </Fact>
          )}
          <Fact label={copy.validUntilLabel}>
            {dayIn(locale, a.validUntil)}
          </Fact>
          <Fact label={copy.issuerLabel}>
            <bdi>{a.issuer}</bdi>
          </Fact>
        </dl>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a
            href={publicCertificateUrl(a.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {copy.viewCertificate}
          </a>
          <a
            href={BAN_PDM_LOOKUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.checkAtBanPdm}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

/** One line on a unit's page, when that unit has a certificate in force. */
export function UnitAccreditationLine({
  locale,
  unitType,
}: {
  locale: Locale;
  unitType: string;
}) {
  const { data } = usePublicAccreditations();
  const a = data?.find((x) => x.unitType === unitType);
  if (!a) return null;
  const copy = accreditationContentFor(locale);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
      <Award className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="font-medium">
        {copy.unitLine(a.rating, dayIn(locale, a.validUntil))}
      </span>
      <Link
        href="/profil/legalitas#akreditasi"
        className="font-medium text-primary underline underline-offset-4"
      >
        {copy.unitLineLink}
      </Link>
    </p>
  );
}
