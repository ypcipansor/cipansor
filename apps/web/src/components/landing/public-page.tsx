import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import type { ContentBlock } from "@/config/content";
import { getServerLocale } from "@/lib/server-locale";
import { translations } from "@/locales";

/**
 * Chrome for every public page other than the homepage.
 *
 * The public site is deliberately separate from the authenticated app shell
 * (`MainLayout`): these pages must render for visitors with no session, so
 * they must not pull in `ProtectedRoute` or the sidebar.
 *
 * It resolves the locale itself rather than taking it as a prop. Every caller
 * is a server component, and the breadcrumb's leading "Beranda" was the one
 * string still in Indonesian on an English page — reading the cookie here
 * fixes all eight public pages at once instead of asking each to remember.
 */
export async function PublicPage({
  title,
  lead,
  breadcrumb,
  heroImage,
  children,
}: {
  title: string;
  lead?: string;
  breadcrumb?: { label: string; href: string }[];
  /**
   * A photograph of the pesantren, shown as a band under the page heading.
   *
   * Every one of these is an original photograph of this place. Before August
   * 2026 the public pages carried none at all — a heading, a paragraph, and a
   * row of icons — and Google for Nonprofits declined the domain on the
   * grounds that the site "relies on generic stock images". Whatever the
   * reviewer saw, a school website that never shows the school is the
   * underlying problem, and this prop is where it gets fixed for all of them
   * at once. Do not fill it with an illustration.
   */
  heroImage?: { src: string; alt: string };
  children: React.ReactNode;
}) {
  const dict = translations[await getServerLocale()];

  return (
    <div className="flex min-h-screen flex-col">
      <LandingNavbar />
      <main id="main-content" className="flex-1 pt-16">
        <header className="border-b border-border bg-muted/30">
          <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav aria-label={dict.public.breadcrumbLabel} className="mb-4">
                <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-1">
                    <Link href="/" className="hover:text-foreground">
                      {dict.public.nav.home}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </li>
                  {breadcrumb.map((crumb, i) => (
                    <li key={crumb.href} className="flex items-center gap-1">
                      {i === breadcrumb.length - 1 ? (
                        <span className="text-foreground">{crumb.label}</span>
                      ) : (
                        <>
                          <Link
                            href={crumb.href}
                            className="hover:text-foreground"
                          >
                            {crumb.label}
                          </Link>
                          <ChevronRight
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
              {title}
            </h1>
            {lead && (
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground text-pretty">
                {lead}
              </p>
            )}
          </div>
        </header>
        {heroImage && (
          <div className="border-b border-border bg-muted/30">
            <div className="container mx-auto px-4 pb-12 sm:px-6 lg:px-8">
              <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-border shadow-lg sm:aspect-[21/8]">
                <Image
                  src={heroImage.src}
                  alt={heroImage.alt}
                  fill
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        )}
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {children}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

/**
 * Renders structured content blocks.
 *
 * Deliberately not `dangerouslySetInnerHTML`: the content is authored as data,
 * so there is no HTML to trust in the first place.
 */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="max-w-3xl space-y-6">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="pt-4 text-2xl font-semibold tracking-tight"
              >
                {block.text}
              </h2>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="list-disc space-y-2 pl-6 text-muted-foreground"
              >
                {block.items.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 border-primary/40 bg-muted/40 py-3 pl-5 pr-4 italic"
              >
                <p className="leading-relaxed">&ldquo;{block.text}&rdquo;</p>
                {block.attribution && (
                  <footer className="mt-2 text-sm not-italic text-muted-foreground">
                    — {block.attribution}
                  </footer>
                )}
              </blockquote>
            );
          default:
            return (
              <p key={i} className="leading-relaxed text-muted-foreground">
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
