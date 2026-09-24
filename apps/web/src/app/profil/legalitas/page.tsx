import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Globe, Landmark, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PublicPage } from "@/components/landing/public-page";
import { LegalIdentity } from "@/components/landing/legal-identity";
import { legalIdentity } from "@/config/content";
import { publicContentFor } from "@/config/content.i18n";
import { pagesContentFor } from "@/config/pages.i18n";
import { siteConfig, addressLines } from "@/config/site";
import { getServerLocale } from "@/lib/server-locale";
import { galleryPhoto } from "@/config/page-photo";

/**
 * /profil/legalitas — one URL that answers "is this organisation real, and does
 * it operate this domain?".
 *
 * This page is deliberately a single scrollable answer presenting the complete
 * legal standing, SK Kemenkumham, NPWP, registered address, governance, and
 * official domain ownership of Yayasan Pesantren Cipansor.
 *
 * IT SITS UNDER /profil ON PURPOSE. `/profil` is already in
 * `PUBLIC_PATH_PREFIXES` (lib/host-split.ts) and `publicPrefixes`
 * (middleware.ts), and both match on segment boundaries, so a child route is
 * public on the apex without editing either list.
 */
export async function generateMetadata(): Promise<Metadata> {
  const copy = publicContentFor(await getServerLocale()).transparencyPage;
  return {
    title: `${copy.title} — ${siteConfig.legalName}`,
    description: copy.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/profil/legalitas" },
  };
}

/** A labelled fact. The value is never translated — see the note below. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3 last:border-b-0 sm:grid sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium sm:mt-0">{children}</dd>
    </div>
  );
}

export default async function LegalitasPage() {
  const locale = await getServerLocale();
  const content = publicContentFor(locale);
  const copy = content.transparencyPage;
  const contactCopy = pagesContentFor(locale).contact;

  return (
    <PublicPage
      title={copy.title}
      lead={copy.lead}
      breadcrumb={[
        { label: content.profilePage.title, href: "/profil" },
        { label: copy.title, href: "/profil/legalitas" },
      ]}
      heroImage={galleryPhoto("fasilitas", 3, locale)}
    >
      {/* ---------------------------------------------------------------
          Legal identity. Labels are translated; the values below are not.
          A decree number, an NPWP, a registered name and a street address
          are what is written on the documents, and a reviewer comparing
          this page against the yayasan's akta is comparing strings.
         --------------------------------------------------------------- */}
      <section aria-labelledby="identitas" className="max-w-4xl">
        <h2
          id="identitas"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
          {copy.identity.heading}
        </h2>
        <dl className="mt-6 rounded-lg border border-border px-5">
          <Fact label={copy.identity.legalNameLabel}>
            {siteConfig.legalName}
          </Fact>
          <Fact label={copy.identity.legalFormLabel}>
            {copy.identity.legalFormValue}
          </Fact>
          <Fact label={copy.identity.decreeLabel}>
            <span className="font-mono">{legalIdentity.decree.number}</span>
          </Fact>
          <Fact label={copy.identity.issuedByLabel}>
            {content.legalIdentity.decree.authority}
          </Fact>
          <Fact label={legalIdentity.verification.registeredIdLabel}>
            <span className="font-mono">
              {legalIdentity.verification.registeredId}
            </span>
          </Fact>
          <Fact label={copy.identity.establishedLabel}>
            {siteConfig.establishedYear}
          </Fact>
          <Fact label={copy.identity.markazLabel}>{siteConfig.markaz}</Fact>
          <Fact label={copy.identity.addressLabel}>
            <address className="not-italic font-normal leading-relaxed">
              {addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </Fact>
        </dl>
      </section>

      {/* ---------------------------------------------------------------
          The official domain section.
         --------------------------------------------------------------- */}
      <section aria-labelledby="domain" className="mt-14 max-w-4xl">
        <h2
          id="domain"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          {copy.domains.heading}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {copy.domains.intro}
        </p>

        <div className="mt-6 max-w-xl">
          <Card>
            <CardContent className="p-6">
              <a
                href={siteConfig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 font-mono text-base font-semibold text-primary underline-offset-4 group-hover:underline"
              >
                {siteConfig.domains.canonical}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {copy.domains.canonicalRole}
              </p>
            </CardContent>
          </Card>
        </div>

        {/*
          The strongest sentence on the page, and the reason it is set apart
          rather than folded into the paragraph above: everything else here is
          the yayasan describing itself, which is exactly the kind of claim a
          reviewer cannot take at face value. The .or.id registration is not —
          it was granted only after the registry checked incorporation documents
          in the organisation's name.
        */}
        <p className="mt-6 rounded-lg border border-border bg-muted/30 p-5 text-sm leading-relaxed">
          {copy.domains.registryNote}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {copy.domains.emailNote(siteConfig.contact.email)}
        </p>
      </section>

      {/* The full two-card block — decree, independent verification, verifier
          wordmarks — reused rather than restated, so the numbers here and on
          /profil and /wakaf-infaq cannot drift apart. */}
      <div className="max-w-4xl">
        <LegalIdentity variant="profile" copy={content.legalIdentity} />
      </div>

      <section aria-labelledby="tata-kelola" className="mt-14 max-w-4xl">
        <h2
          id="tata-kelola"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          {copy.governance.heading}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {content.legalIdentity.governance}
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {copy.governance.officersIntro}{" "}
          <Link
            href="/profil/pimpinan"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.governance.leadershipLink}
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="kontak-resmi" className="mt-14 max-w-4xl">
        <h2
          id="kontak-resmi"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
          {copy.contact.heading}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {copy.contact.body}
        </p>
        {/* Headings borrowed from /kontak's dictionary rather than duplicated
            into this page's block: they are the same three labels, already
            written in all three locales, and a second copy is a second thing to
            keep in step. The address itself is not repeated here — it is in the
            identity table above, and printing it twice on one page invites the
            two copies to disagree. */}
        <dl className="mt-6 rounded-lg border border-border px-5">
          <Fact label={contactCopy.phoneHeading}>
            <a
              href={`tel:+${siteConfig.contact.phoneE164}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {siteConfig.contact.phone}
            </a>
          </Fact>
          <Fact label={contactCopy.emailHeading}>
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="break-all text-primary underline-offset-4 hover:underline"
            >
              {siteConfig.contact.email}
            </a>
          </Fact>
          <Fact label={contactCopy.addressHeading}>
            <a
              href={siteConfig.contact.maps.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {contactCopy.openInMaps}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Fact>
        </dl>
      </section>
    </PublicPage>
  );
}
