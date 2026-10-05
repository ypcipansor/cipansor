import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { SpmbAnnouncement } from "@/components/landing/spmb-announcement";
import { HeroSection } from "@/components/landing/sections/hero";
import { StatsSection } from "@/components/landing/sections/stats";
import { AboutSection } from "@/components/landing/sections/about";
import { ProgramSection } from "@/components/landing/sections/programs";
import { UnitsSection } from "@/components/landing/sections/units";
import { NewsSection } from "@/components/landing/sections/news";
import { CtaSection } from "@/components/landing/sections/cta";
import { LegalIdentityStrip } from "@/components/landing/legal-identity";
import { siteConfig } from "@/config/site";
import { publicContentFor } from "@/config/content.i18n";
import { siteTextFor } from "@/config/site.i18n";
import { getServerLocale } from "@/lib/server-locale";
import { isPortalHost } from "@/lib/host-split";
import { headers } from "next/headers";
import { Metadata } from "next";
import type { Locale } from "@/locales";

const OG_LOCALE: Record<Locale, string> = {
  id: "id_ID",
  en: "en_GB",
  ar: "ar_AR",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const site = siteTextFor(locale);
  const title = `${siteConfig.legalName} — ${site.tagline}`;
  return {
    title,
    description: site.description,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description: site.description,
      url: siteConfig.url,
      siteName: siteConfig.name,
      locale: OG_LOCALE[locale],
      type: "website",
      images: [{ url: "/images/cipansor/hero.webp", width: 1536, height: 672 }],
    },
  };
}

export default async function Home() {
  // Server component: the locale comes from the cookie, not from useI18n.
  // Read once here and passed down, rather than each section reading it — the
  // sections stay pure functions of the locale and the cookie is touched once.
  const locale = await getServerLocale();
  const content = publicContentFor(locale);
  // The portal never shows the announcement: it is for prospective families,
  // and a visitor already signed in to the system does not need to be told that
  // registration is open. `isPortalHost` is false for localhost and previews,
  // so `pnpm dev` and staging keep it (the same polarity as `pwaEnabledForHost`).
  const showAnnouncement = !isPortalHost((await headers()).get("host"));

  return (
    <div className="flex min-h-screen flex-col">
      {/* The Organization markup moved to `LandingFooter`, which this page
          renders too — it now travels with every public page instead of only
          this one. See config/organization-jsonld.ts. */}
      <LandingNavbar />
      <SpmbAnnouncement
        locale={locale}
        enabled={showAnnouncement}
        className="mt-16"
      />
      <main id="main-content" className="flex-1">
        <HeroSection locale={locale} />
        <StatsSection locale={locale} />
        <AboutSection locale={locale} />
        <ProgramSection locale={locale} />
        <UnitsSection locale={locale} />
        <NewsSection locale={locale} />
        <CtaSection locale={locale} />
        <LegalIdentityStrip copy={content.legalIdentity} />
      </main>
      <LandingFooter />
    </div>
  );
}
