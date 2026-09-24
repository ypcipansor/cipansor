import type { Metadata } from "next";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { PublicPage } from "@/components/landing/public-page";
import { leadership } from "@/config/content";
import { siteConfig } from "@/config/site";
import { pagesContentFor } from "@/config/pages.i18n";
import { publicContentFor } from "@/config/content.i18n";
import { getServerLocale } from "@/lib/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const copy = pagesContentFor(await getServerLocale()).leadership;
  return {
    title: `${copy.title} — ${siteConfig.legalName}`,
    description: copy.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/profil/pimpinan" },
  };
}

export default async function PimpinanPage() {
  const locale = await getServerLocale();
  const copy = pagesContentFor(locale).leadership;
  const { profilePage } = publicContentFor(locale);

  return (
    <PublicPage
      title={copy.title}
      lead={copy.lead}
      breadcrumb={[
        { label: profilePage.title, href: "/profil" },
        { label: copy.title, href: "/profil/pimpinan" },
      ]}
    >
      {copy.mottoNotTranslated && (
        <p className="mb-8 max-w-3xl rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {copy.mottoNotTranslated}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {leadership.map((leader) => (
          <Card key={leader.slug} className="h-full overflow-hidden pt-0">
            {/* Portraits already existed in `public/images/people/` — they were
                only being used by the demo-account panel on /login. */}
            <div className="relative aspect-[4/3] bg-muted">
              <Image
                src={leader.photo}
                alt={copy.photoAlt(leader.name)}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover object-top"
              />
            </div>
            <CardContent className="flex h-full flex-col p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {copy.positions[leader.slug] ?? leader.position}
              </p>
              <h2 className="mt-2 text-lg font-bold text-balance">
                {leader.name}
              </h2>
              <blockquote
                lang="id"
                className="mt-4 border-l-2 border-primary/30 pl-4 text-sm italic leading-relaxed text-muted-foreground"
              >
                &ldquo;{leader.motto}&rdquo;
              </blockquote>
            </CardContent>
          </Card>
        ))}
      </div>
    </PublicPage>
  );
}
