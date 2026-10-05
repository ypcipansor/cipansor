import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { homeContentFor } from "@/config/home.i18n";
import { siteTextFor } from "@/config/site.i18n";
import type { Locale } from "@/locales";
import { SpmbStatusBadge } from "@/components/landing/spmb-status-badge";

export function HeroSection({ locale }: { locale: Locale }) {
  const { hero } = homeContentFor(locale);
  const site = siteTextFor(locale);

  return (
    <section
      id="hero"
      className="relative pt-24 pb-12 md:pt-32 md:pb-20 overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
          <SpmbStatusBadge locale={locale} />

          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl text-foreground text-balance">
            {siteConfig.legalName}
            <br className="hidden sm:inline" />{" "}
            <span className="text-primary">{site.tagline}</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl text-pretty">
            {site.description}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/public/spmb" className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 text-base h-12">
                {/* No year: the destination page states the current period,
                    and a year written here goes stale the moment the intake
                    changes. */}
                {hero.registerCta} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/profil" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 text-base h-12"
              >
                <BookOpen className="h-4 w-4" />
                {hero.profileCta}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-12 md:mt-16 mx-auto max-w-5xl">
          <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-border shadow-xl">
            <Image
              src="/images/cipansor/hero.webp"
              alt={hero.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
