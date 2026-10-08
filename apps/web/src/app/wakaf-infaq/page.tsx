import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { SpmbAnnouncement } from "@/components/landing/spmb-announcement";
import { siteConfig, donationConfig } from "@/config/site";
import { getServerLocale } from "@/lib/server-locale";
import { isPortalHost } from "@/lib/host-split";
import { loadPublicAnnouncement } from "@/lib/public-intakes.server";
import { galleryPhoto } from "@/config/page-photo";
import type { Locale } from "@/locales";
import { DonationPortal } from "./donation-portal";

/**
 * Wakaf & Infaq — the single public donation page.
 *
 * This used to live at `/public/donation` while the navigation also spoke of
 * "Wakaf & Infaq", which is the term the pesantren itself uses. Two names for
 * one thing meant duplicate content and a menu that did not match the page it
 * opened. `/public/donation` now redirects here (see next.config.ts).
 *
 * The page body is a client component (it posts a donation form and reads live
 * campaigns), so this server wrapper exists to carry the metadata and the
 * structured data that a client component cannot export.
 */

const OG_LOCALE: Record<Locale, string> = {
  id: "id_ID",
  en: "en_GB",
  ar: "ar_AR",
};

/** Page chrome for /wakaf-infaq. See config/donation.i18n.ts for the body. */
const META: Record<Locale, { title: string; description: string; og: string }> =
  {
    id: {
      title: "Wakaf & Infaq",
      description:
        "Salurkan wakaf dan infaq untuk pembangunan sarana pendidikan, beasiswa santri penghafal Al-Qur'an 30 juz, dan operasional harian Pesantren Cipansor. Dikelola transparan dengan laporan penyaluran berkala.",
      og: "Dukung pendidikan santri Pesantren Cipansor melalui wakaf sarana pendidikan, beasiswa takhosus, dan infaq operasional.",
    },
    en: {
      title: "Wakaf & Infaq",
      description:
        "Give wakaf and infaq towards teaching facilities, scholarships for santri memorising all 30 juz of the Qur'an, and the day-to-day running of Pesantren Cipansor. Managed transparently, with disbursement reports updated regularly.",
      og: "Support the education of santri at Pesantren Cipansor through wakaf for teaching facilities, Takhosus scholarships, and infaq for daily running.",
    },
    ar: {
      title: "الوقف والإنفاق",
      description:
        "تبرّع بالوقف والإنفاق لبناء المرافق التعليمية، ومنح طلاب حفظ الثلاثين جزءاً، والتشغيل اليومي لمعهد سيبانسور. تُدار بشفافية مع تقارير صرف تُحدَّث دورياً.",
      og: "ادعم تعليم طلاب معهد سيبانسور عبر وقف المرافق التعليمية ومنح التخصّص والإنفاق على التشغيل.",
    },
  };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const meta = META[locale] ?? META.id;
  const title = `${meta.title} — ${siteConfig.legalName}`;
  return {
    title,
    description: meta.description,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/wakaf-infaq" },
    openGraph: {
      title,
      description: meta.og,
      url: `${siteConfig.url}/wakaf-infaq`,
      siteName: siteConfig.name,
      locale: OG_LOCALE[locale],
      type: "website",
    },
  };
}

/**
 * Structured data stays Indonesian: it describes the organisation to search
 * engines, which index the canonical Indonesian page, and the akad names are
 * what the donation records store.
 */
const donateJsonLd = {
  "@context": "https://schema.org",
  "@type": "DonateAction",
  name: "Wakaf & Infaq Pesantren Cipansor",
  recipient: {
    "@type": "NGO",
    name: siteConfig.legalName,
    url: siteConfig.url,
    email: siteConfig.contact.email,
    telephone: `+${siteConfig.contact.phoneE164}`,
  },
  potentialAction: donationConfig.programs.map((program) => ({
    "@type": "DonateAction",
    name: program.title,
    description: program.description,
  })),
};

export default async function WakafInfaqPage() {
  // The portal takes its *copy* from the provider, being a client component.
  // The locale is still read here for the one thing the provider cannot give
  // it: the alt text of the hero photograph, which is resolved server-side so
  // the description ships in the HTML rather than appearing after hydration.
  const locale = await getServerLocale();
  // This page builds its own chrome instead of using `PublicPage`, so the SPMB
  // announcement is mounted by hand — banner only (`withDialog={false}`), so a
  // five-second dialog never interrupts the donation flow. Same public-host
  // gate as every other public page.
  const showAnnouncement = !isPortalHost((await headers()).get("host"));
  // Fetched on the server so the banner is in the first paint, not inserted
  // after hydration (which shifted the donation page's content — CLS 0.035).
  // The dismissal cookie travels with it so a returning visitor does not get
  // the banner back in the first paint.
  const { intakes, bannerDismissed } = showAnnouncement
    ? await loadPublicAnnouncement()
    : { intakes: [], bannerDismissed: false };
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donateJsonLd) }}
      />
      <LandingNavbar />
      <main id="main-content" className="flex-1 pt-16">
        {/* First child of `<main>`, under the fixed navbar. `pt-16` on `<main>`
            clears the navbar for both the banner and the donation body. */}
        <SpmbAnnouncement
          locale={locale}
          enabled={showAnnouncement}
          withDialog={false}
          initialIntakes={intakes}
          initialBannerDismissed={bannerDismissed}
        />
        <DonationPortal photo={galleryPhoto("fasilitas", 2, locale)} />
      </main>
      <LandingFooter />
    </div>
  );
}
