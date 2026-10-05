import type { Metadata } from "next";
import Link from "next/link";
import {
  Bus,
  Compass,
  GraduationCap,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPage } from "@/components/landing/public-page";
import { PublicExtracurriculars } from "@/components/landing/public-extracurriculars";
import { annualActivities, siteConfig } from "@/config/site";
import { pagesContentFor } from "@/config/pages.i18n";
import { siteTextFor } from "@/config/site.i18n";
import { galleryPhoto } from "@/config/page-photo";
import { getServerLocale } from "@/lib/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const copy = pagesContentFor(await getServerLocale()).activities;
  return {
    title: `${copy.title} — ${siteConfig.legalName}`,
    description: copy.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/activities" },
  };
}

const ICON: Record<string, LucideIcon> = {
  "rihlah-tarbawi": Compass,
  "study-tour": Bus,
  "wisuda-tahfidz": GraduationCap,
  mukhoyam: Tent,
};

/**
 * Kegiatan (decisions/fasilitas-dan-kegiatan-situs-publik.md): the
 * extracurriculars each unit keeps in the portal, and the four annual events
 * the brochure lists — what each is, never a date, since the dates move every
 * year and the portal's calendar holds them.
 */
export default async function ActivitiesPage() {
  const locale = await getServerLocale();
  const copy = pagesContentFor(locale).activities;
  const text = siteTextFor(locale).activities;

  return (
    <PublicPage
      title={copy.title}
      lead={copy.lead}
      breadcrumb={[{ label: copy.title, href: "/activities" }]}
      heroImage={galleryPhoto("disiplin", 1, locale)}
    >
      <section aria-labelledby="ekstrakurikuler" className="max-w-5xl">
        <h2
          id="ekstrakurikuler"
          className="text-2xl font-semibold tracking-tight"
        >
          {copy.extracurricularHeading}
        </h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          {copy.extracurricularLead}
        </p>
        <div className="mt-6">
          <PublicExtracurriculars
            locale={locale}
            categories={copy.categories}
            unavailable={copy.extracurricularUnavailable}
          />
        </div>
      </section>

      <section aria-labelledby="agenda" className="mt-14 max-w-5xl">
        <h2 id="agenda" className="text-2xl font-semibold tracking-tight">
          {copy.agendaHeading}
        </h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          {copy.agendaLead}
        </p>
        <ul
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
          data-testid="annual-activities"
        >
          {annualActivities.map((activity) => {
            const Icon = ICON[activity.slug] ?? Compass;
            return (
              <li
                key={activity.slug}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">
                    {text[activity.slug]?.name ?? activity.name}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {text[activity.slug]?.description ?? activity.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-12 rounded-lg border border-border bg-muted/30 p-8 text-center">
        <h2 className="text-2xl font-bold">{copy.ctaHeading}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          {copy.ctaBody}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/public/spmb">{copy.ctaRegister}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/campus">{copy.ctaFacilities}</Link>
          </Button>
        </div>
      </div>
    </PublicPage>
  );
}
