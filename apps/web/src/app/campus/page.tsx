import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  BedDouble,
  Droplets,
  Dumbbell,
  Flag,
  FlaskConical,
  Goal,
  Landmark,
  Monitor,
  Presentation,
  School,
  TreePine,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { PublicPage } from "@/components/landing/public-page";
import { campusFacilities, galleryThumb, siteConfig } from "@/config/site";
import { pagesContentFor } from "@/config/pages.i18n";
import { siteTextFor } from "@/config/site.i18n";
import { galleryPhoto } from "@/config/page-photo";
import { getServerLocale } from "@/lib/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const copy = pagesContentFor(await getServerLocale()).campus;
  return {
    title: `${copy.title} — ${siteConfig.legalName}`,
    description: copy.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/campus" },
  };
}

/** What stands in for a photograph the pesantren has not published yet. */
const ICON: Record<string, LucideIcon> = {
  masjid: Landmark,
  asrama: BedDouble,
  "ruang-kelas": School,
  "lapangan-upacara": Flag,
  "aula-utama": Presentation,
  "gelanggang-olahraga": Dumbbell,
  "lapangan-olahraga": Goal,
  "laboratorium-komputer": Monitor,
  "laboratorium-ipa": FlaskConical,
  kantin: UtensilsCrossed,
  "sarana-outbound": TreePine,
  "sumber-mata-air": Droplets,
};

/**
 * Sarana & prasarana, as the 2027/2028 brochure lists them
 * (decisions/fasilitas-dan-kegiatan-situs-publik.md).
 *
 * A facility shows a photograph only when one in the gallery shows that very
 * place (decisions/public-site-photography.md); the rest show an icon until
 * the originals of the brochure's pictures arrive. Those with a photograph
 * come first, so the page opens on the place itself.
 */
export default async function CampusPage() {
  const locale = await getServerLocale();
  const copy = pagesContentFor(locale).campus;
  const text = siteTextFor(locale).facilities;

  const withPhoto = campusFacilities.filter((f) => f.photo);
  const withoutPhoto = campusFacilities.filter((f) => !f.photo);

  return (
    <PublicPage
      title={copy.title}
      lead={copy.lead}
      breadcrumb={[{ label: copy.title, href: "/campus" }]}
      heroImage={galleryPhoto("fasilitas", 0, locale)}
    >
      <ul
        className="grid grid-cols-1 gap-6 sm:grid-cols-2"
        data-testid="facilities-with-photo"
      >
        {withPhoto.map((facility) => {
          const photo = galleryPhoto(...facility.photo!, locale);
          return (
            <li
              key={facility.slug}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <span className="relative block aspect-[3/2] w-full">
                <Image
                  src={galleryThumb(photo.src)}
                  alt={photo.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                />
              </span>
              <div className="p-5">
                <h2 className="text-lg font-semibold">
                  {text[facility.slug]?.name ?? facility.name}
                </h2>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {text[facility.slug]?.description ?? facility.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <ul
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="facilities-without-photo"
      >
        {withoutPhoto.map((facility) => {
          const Icon = ICON[facility.slug] ?? School;
          return (
            <li
              key={facility.slug}
              className="flex gap-4 rounded-lg border border-border bg-card p-5 lg:flex-col lg:gap-3"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">
                  {text[facility.slug]?.name ?? facility.name}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {text[facility.slug]?.description ?? facility.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-muted/30 p-6">
        <p className="font-medium">{copy.contactPrompt}</p>
        <Link
          href="/kontak"
          className="font-medium text-primary underline underline-offset-4"
        >
          {copy.contactLink}
        </Link>
        <Link
          href="/galeri"
          className="font-medium text-primary underline underline-offset-4"
        >
          {copy.galleryLink}
        </Link>
      </div>
    </PublicPage>
  );
}
