import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PublicPage, ContentBlocks } from "@/components/landing/public-page";
import { LegalIdentity } from "@/components/landing/legal-identity";
import { publicContentFor } from "@/config/content.i18n";
import { getServerLocale } from "@/lib/server-locale";
import { galleryPhoto } from "@/config/page-photo";
import { siteConfig, educationUnits } from "@/config/site";

export async function generateMetadata(): Promise<Metadata> {
  const { profilePage } = publicContentFor(await getServerLocale());
  return {
    title: `${profilePage.title} — ${siteConfig.legalName}`,
    description: profilePage.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/profil" },
  };
}

export default async function ProfilPage() {
  // Server component: the locale comes from the cookie, not from useI18n.
  const locale = await getServerLocale();
  const {
    profilePage,
    profileSections,
    profileStats,
    legalIdentity,
    transparencyPage,
  } = publicContentFor(locale);

  return (
    <PublicPage
      title={profilePage.title}
      lead={profilePage.lead(siteConfig.markaz, siteConfig.establishedYear)}
      breadcrumb={[{ label: profilePage.title, href: "/profil" }]}
      heroImage={galleryPhoto("fasilitas", 0, locale)}
    >
      <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        {profileStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-primary">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ContentBlocks blocks={profileSections} />

      <div className="mt-10 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {educationUnits.map((unit) => (
          <Link
            key={unit.slug}
            href={`/unit/${unit.slug}`}
            className="rounded-lg border border-border p-5 transition-colors hover:border-primary hover:bg-muted/40"
          >
            <p className="font-semibold">{unit.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{unit.tagline}</p>
          </Link>
        ))}
      </div>

      <LegalIdentity copy={legalIdentity} />

      {/* The two cards above give the decree and the verification. The page
          they now link to adds what a reviewer asks for next: the registered
          name and legal form, the address of record, and — the reason it was
          written — which web domains this yayasan operates. */}
      <p className="mt-6 max-w-3xl">
        <Link
          href="/profil/legalitas"
          className="font-medium text-primary underline underline-offset-4"
        >
          {transparencyPage.title}
        </Link>
      </p>

      <p className="mt-10 max-w-3xl text-muted-foreground">
        {profilePage.leadershipPrompt}{" "}
        <Link
          href="/profil/pimpinan"
          className="font-medium text-primary underline"
        >
          {profilePage.leadershipLink}
        </Link>
        .
      </p>
    </PublicPage>
  );
}
