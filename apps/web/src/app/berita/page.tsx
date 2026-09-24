import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublicPage } from "@/components/landing/public-page";
import { articles } from "@/config/content";
import { siteConfig } from "@/config/site";
import { pagesContentFor } from "@/config/pages.i18n";
import { newsTextFor } from "@/config/news.i18n";
import { getServerLocale } from "@/lib/server-locale";
import { galleryPhoto } from "@/config/page-photo";
import { dateFormatterFor } from "@/lib/locale-format";

export async function generateMetadata(): Promise<Metadata> {
  const copy = pagesContentFor(await getServerLocale()).news;
  return {
    title: `${copy.title} — ${siteConfig.legalName}`,
    description: copy.metaDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: "/berita" },
  };
}

export default async function BeritaPage() {
  const locale = await getServerLocale();
  const copy = pagesContentFor(locale).news;
  const dateFormatter = dateFormatterFor(locale);
  // Newest first, so the page leads with the most recent activity.
  const sorted = [...articles].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PublicPage
      title={copy.title}
      lead={copy.lead}
      breadcrumb={[{ label: copy.title, href: "/berita" }]}
      heroImage={galleryPhoto("disiplin", 1, locale)}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((article) => {
          const text = newsTextFor(locale, article.slug) ?? article;
          return (
            <Card key={article.slug} className="h-full overflow-hidden">
              <Link href={`/berita/${article.slug}`} className="block">
                <div className="relative aspect-[16/10]">
                  <Image
                    src={article.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
              </Link>
              <CardContent className="flex flex-col p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{article.unit}</Badge>
                  <time dateTime={article.date}>
                    {dateFormatter.format(new Date(article.date))}
                  </time>
                </div>
                <h2 className="mt-3 text-lg font-semibold leading-snug text-balance">
                  <Link
                    href={`/berita/${article.slug}`}
                    className="hover:text-primary"
                  >
                    {text.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {text.excerpt}
                </p>
                <Link
                  href={`/berita/${article.slug}`}
                  className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
                >
                  {copy.readMore}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PublicPage>
  );
}
