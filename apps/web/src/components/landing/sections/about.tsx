import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { siteConfig, galleryItems, galleryThumb } from "@/config/site";
import { homeContentFor } from "@/config/home.i18n";
import { siteTextFor } from "@/config/site.i18n";
import { formatNumber } from "@/lib/locale-format";
import type { Locale } from "@/locales";

export function AboutSection({ locale }: { locale: Locale }) {
  const copy = homeContentFor(locale).about;
  const site = siteTextFor(locale);
  const [featured, ...rest] = galleryItems;
  // The caption belongs to the photograph, so it is looked up by slug rather
  // than read off the item — the Indonesian title is the fallback if a
  // translation for a newly added photo has not been written yet.
  const caption = (slug: string, fallback: string) =>
    site.gallery[slug] ?? fallback;

  return (
    <section id="about" className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Text Content */}
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-primary bg-primary/10 border-primary/20">
              {copy.eyebrow}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl text-balance">
              {copy.heading}
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed text-pretty">
              {copy.body(
                siteConfig.markaz,
                siteConfig.legalName,
                formatNumber(locale, siteConfig.establishedYear),
                site.visi,
              )}
            </p>

            <div className="space-y-4 pt-4">
              {copy.commitments.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                  <span className="text-foreground font-medium">{item}</span>
                </div>
              ))}
            </div>

            <Link
              href="/profil"
              className="inline-flex items-center gap-1 pt-2 font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.moreLink}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Documentation gallery */}
          <div className="flex-1 w-full">
            <figure className="relative aspect-video rounded-xl overflow-hidden border border-border shadow-xl">
              <Image
                src={featured.image}
                alt={caption(featured.slug, featured.title)}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-sm font-medium text-white">
                {caption(featured.slug, featured.title)}
              </figcaption>
            </figure>

            <div className="grid grid-cols-2 gap-4 mt-4">
              {rest.map((item) => (
                <figure
                  key={item.slug}
                  className="relative h-32 rounded-lg overflow-hidden border border-border"
                >
                  {/* The 560px derivative: these render 128px tall, and the
                      production optimiser does not resize (see galleryThumb). */}
                  <Image
                    src={galleryThumb(item.image)}
                    alt={caption(item.slug, item.title)}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 text-xs font-medium text-white">
                    {caption(item.slug, item.title)}
                  </figcaption>
                </figure>
              ))}
            </div>

            <Link
              href="/galeri"
              className="mt-4 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.galleryLink}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
