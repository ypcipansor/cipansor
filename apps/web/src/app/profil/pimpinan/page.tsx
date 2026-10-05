import type { Metadata } from "next";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { PublicPage } from "@/components/landing/public-page";
import { leadership } from "@/config/content";
import { siteConfig } from "@/config/site";
import { pagesContentFor, STRUCTURE_POSITIONED } from "@/config/pages.i18n";
import { ORGANISATION } from "@cipansor/shared";
import { personInitials } from "@/lib/person-initials";
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
                {/* Isolated: in the Arabic page the final "S.T." full stop
                    otherwise jumps to the start of the name. */}
                <bdi>{leader.name}</bdi>
              </h2>
              {/* An Indonesian motto reads left to right on every page, or
                  its quotation marks and full stop swap ends in Arabic. */}
              <blockquote
                lang="id"
                dir="ltr"
                className="mt-4 border-l-2 border-primary/30 pl-4 text-sm italic leading-relaxed text-muted-foreground"
              >
                &ldquo;{leader.motto}&rdquo;
              </blockquote>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* The full structure, as the yayasan published it. Names are proper
          nouns and stay as written in every language; no phone numbers. */}
      <section
        aria-labelledby="struktur-organisasi"
        data-testid="org-structure"
        className="mt-16 border-t border-border pt-10"
      >
        <h2
          id="struktur-organisasi"
          className="text-2xl font-bold tracking-tight text-balance"
        >
          {copy.structure.heading}
        </h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          {copy.structure.lead}
        </p>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          {ORGANISATION.map((group) => (
            <div
              key={group.slug}
              data-testid={`org-group-${group.slug}`}
              className={group.slug === "pesantren" ? "lg:col-span-2" : ""}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                {copy.structure.groups[group.slug]}
              </h3>
              <ul
                className={`mt-4 grid gap-4 sm:grid-cols-2 ${
                  group.slug === "pesantren" ? "lg:grid-cols-3" : ""
                }`}
              >
                {group.holders.map((holder) => (
                  <li key={holder.slug} className="flex items-center gap-3">
                    {holder.photo ? (
                      <Image
                        src={holder.photo}
                        alt={copy.photoAlt(holder.name)}
                        width={56}
                        height={56}
                        className="h-14 w-14 shrink-0 rounded-full object-cover object-top"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                      >
                        {personInitials(holder.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">
                        {/* A Latin name in an Arabic page: isolated, so its
                            trailing degree's full stop stays at its end. */}
                        <bdi>{holder.name}</bdi>
                      </p>
                      {STRUCTURE_POSITIONED.includes(group.slug) && (
                        <p className="text-sm text-muted-foreground">
                          {copy.structure.positions[holder.slug]}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PublicPage>
  );
}
