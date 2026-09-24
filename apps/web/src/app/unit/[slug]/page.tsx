import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPage } from "@/components/landing/public-page";
import { siteConfig, educationUnits } from "@/config/site";
import { unitDetails } from "@/config/content";
import { pagesContentFor } from "@/config/pages.i18n";
import { siteTextFor } from "@/config/site.i18n";
import { getServerLocale } from "@/lib/server-locale";
import { galleryPhoto } from "@/config/page-photo";

/** Pre-render all five units — the set is fixed and small. */
export function generateStaticParams() {
  return educationUnits.map((unit) => ({ slug: unit.slug }));
}

/**
 * The five slugs above are the whole set; anything else is a 404.
 *
 * Stated for the reader and for the day this page stops reading cookies and
 * becomes prerenderable. It is **not** what makes the status correct today:
 * the route renders on demand, so Next never consults this. What was actually
 * returning 200 for /unit/anything is the root `app/loading.tsx` — see the
 * note in `app/not-found.tsx`.
 */
export const dynamicParams = false;

/**
 * Which photograph leads each unit's page, as `[album, index]`.
 *
 * Only claims what a photograph actually shows. Indonesian school uniform is
 * unambiguous about the stage — red and white is primary, navy and white is
 * junior secondary — so SDIT and SMPIT get their own assemblies. Nothing in
 * the archive identifies a TK Qur'an, SMA Qur'an or Takhosus room as such, so
 * those three lead with pesantren-wide scenes: a building, a study circle.
 * Captioning a photograph with a unit it may not belong to would put a small
 * lie under every one of these headings.
 */
const UNIT_PHOTO: Record<string, [album: string, index: number]> = {
  tkq: ["fasilitas", 1],
  sdit: ["disiplin", 1],
  smpit: ["disiplin", 3],
  "sma-quran": ["karakter", 2],
  takhosus: ["karakter", 1],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const unit = educationUnits.find((u) => u.slug === slug);
  if (!unit) return {};
  const text = siteTextFor(await getServerLocale()).units[slug];
  return {
    title: `${unit.name} — ${siteConfig.legalName}`,
    description: text?.description ?? unit.description,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: `/unit/${unit.slug}` },
  };
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const unit = educationUnits.find((u) => u.slug === slug);
  const detail = unitDetails[slug];
  if (!unit || !detail) notFound();

  const locale = await getServerLocale();
  const pages = pagesContentFor(locale);
  const copy = pages.unitDetail;
  const text = siteTextFor(locale).units[slug];

  return (
    <PublicPage
      title={unit.name}
      lead={text?.tagline ?? unit.tagline}
      breadcrumb={[
        { label: pages.units.title, href: "/unit" },
        { label: unit.shortName, href: `/unit/${unit.slug}` },
      ]}
      heroImage={galleryPhoto(...UNIT_PHOTO[slug], locale)}
    >
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <Image
            src={unit.logo}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
          />
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {text?.level ?? detail.jenjang}
          </p>
        </div>

        <p className="leading-relaxed text-muted-foreground">
          {text?.intro ?? detail.intro}
        </p>
        <p className="leading-relaxed text-muted-foreground">
          {text?.description ?? unit.description}
        </p>

        <h2 className="pt-4 text-2xl font-semibold tracking-tight">
          {copy.highlightsHeading(unit.shortName)}
        </h2>
        <ul className="space-y-3">
          {(text?.highlights ?? detail.highlights).map((item) => (
            <li key={item} className="flex items-start gap-3">
              <Check
                className="mt-1 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="leading-relaxed text-muted-foreground">
                {item}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-lg border border-border bg-muted/30 p-6">
          <h2 className="text-xl font-bold">{copy.ctaHeading(unit.name)}</h2>
          <p className="mt-2 text-muted-foreground">{copy.ctaBody}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/public/spmb">{copy.ctaRegister}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/kontak">{copy.ctaContact}</Link>
            </Button>
          </div>
        </div>

        <nav aria-label={copy.otherUnitsHeading} className="pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.otherUnitsHeading}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {educationUnits
              .filter((u) => u.slug !== unit.slug)
              .map((u) => (
                <li key={u.slug}>
                  <Link
                    href={`/unit/${u.slug}`}
                    className="inline-block rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                  >
                    {u.name}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </PublicPage>
  );
}
